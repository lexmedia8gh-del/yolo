import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  type DocumentSnapshot,
  type QuerySnapshot,
  increment,
  writeBatch,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, getAuthInstance, isFirebaseConfigured } from './config'
import { getAdminAuthHeaders } from './auth'

// ─── Collection Names (centralized) ──────────────────────────
export const COLLECTIONS = {
  USERS: 'users',
  CLIENTS: 'clients',
  SERVICES: 'services',
  PROJECTS: 'projects',
  PACKAGES: 'packages',
  INVOICES: 'invoices',
  INVOICE_ITEMS: 'invoiceItems',
  PAYMENTS: 'payments',
  CLIENT_LINKS: 'clientLinks',
  FILES: 'files',
  NOTIFICATIONS: 'notifications',
  ACTIVITY_LOGS: 'activityLogs',
  SETTINGS: 'settings',
  WHATSAPP_MESSAGES: 'whatsappMessages',
  DELIVERIES: 'deliveries',
  DELIVERY_FILES: 'deliveryFiles',
  REMINDERS: 'reminders',
  TASKS: 'tasks',
  QUICK_JOBS: 'quickJobs',
  CLIENT_PREVIEWS: 'clientPreviews',
  PREVIEW_LOGS: 'previewLogs',
  ADD_ONS: 'addOns',
} as const

const PUBLIC_READ_COLLECTIONS = new Set<string>([
  COLLECTIONS.DELIVERIES,
  COLLECTIONS.DELIVERY_FILES,
  COLLECTIONS.CLIENT_LINKS,
  COLLECTIONS.CLIENT_PREVIEWS,
])

const PUBLIC_WRITE_COLLECTIONS = new Set<string>([
  COLLECTIONS.PREVIEW_LOGS,
])

function hasFirebaseUserSession(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(getAuthInstance()?.currentUser)
}

function hasActiveAdminSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (sessionStorage.getItem('lexmedia_pin_session_active') === 'true') return true
    if (localStorage.getItem('lexmedia_pin_session_active') === 'true') return true
    if (sessionStorage.getItem('lexmedia_admin_session_email')) return true
    if (sessionStorage.getItem('lexmedia_active_id_token')) return true
    if (document.cookie.includes('__session=')) return true
  } catch {}
  return false
}

function canReadCloudFirestore(collectionName: string): boolean {
  if (!isFirebaseConfigured) return false
  if (PUBLIC_READ_COLLECTIONS.has(collectionName)) return true
  return hasFirebaseUserSession() || hasActiveAdminSession()
}

function canWriteCloudFirestore(collectionName: string): boolean {
  if (!isFirebaseConfigured) return false
  if (PUBLIC_WRITE_COLLECTIONS.has(collectionName)) return true
  return hasFirebaseUserSession() || hasActiveAdminSession()
}

/**
 * Recursively strips `undefined` properties from plain objects and arrays
 * while preserving Firebase FieldValue sentinels, Timestamps, and Dates.
 */
export function stripUndefinedDeep<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    return input
  }
  const cleaned: Record<string, any> = {}
  for (const [key, val] of Object.entries(input as Record<string, any>)) {
    if (val === undefined) continue
    cleaned[key] = stripUndefinedDeep(val)
  }
  return cleaned as T
}

function sanitizeForJsonMirror(input: any): any {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input
  }
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input.toISOString() : new Date().toISOString()
  }
  if (typeof input.toDate === 'function') {
    try {
      const d = input.toDate()
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString()
    } catch {}
  }
  if (Array.isArray(input)) {
    return input.filter((v) => v !== undefined).map(sanitizeForJsonMirror)
  }
  // Convert client SDK FieldValue sentinels (serverTimestamp, increment, etc.)
  if (Object.getPrototypeOf(input) !== Object.prototype) {
    const methodName = (input as any)._methodName || ''
    if (methodName === 'serverTimestamp') {
      return { __lex_transform: 'serverTimestamp' }
    }
    if (methodName === 'increment') {
      return { __lex_transform: 'increment', operand: Number((input as any)._operand || 0) }
    }
    if (methodName === 'deleteField') {
      return { __lex_transform: 'delete' }
    }
    if (methodName === 'arrayUnion') {
      return { __lex_transform: 'arrayUnion', elements: ((input as any)._elements || []).map(sanitizeForJsonMirror) }
    }
    if (methodName === 'arrayRemove') {
      return { __lex_transform: 'arrayRemove', elements: ((input as any)._elements || []).map(sanitizeForJsonMirror) }
    }
    return undefined
  }

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    const converted = sanitizeForJsonMirror(v)
    if (converted !== undefined) {
      out[k] = converted
    }
  }
  return out
}

async function postToServerLocalStore(payload: Record<string, any>): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const authHeaders = await getAdminAuthHeaders()
    await fetch('/api/admin/local-store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    })
  } catch {}
}

export async function syncBatchToServerLocalStore(
  operations: Array<{
    type: 'set' | 'update' | 'delete'
    collection: string
    id: string
    data?: Record<string, any>
    merge?: boolean
    cloudSynced?: boolean
  }>
): Promise<void> {
  if (typeof window === 'undefined' || operations.length === 0) return
  const sanitizedOps = operations.map((op) => ({
    ...op,
    data: op.data ? sanitizeForJsonMirror(op.data) : undefined,
  }))
  await postToServerLocalStore({
    action: 'batch',
    operations: sanitizedOps,
  })
}

async function fetchServerLocalCollection<T extends { id?: string }>(collectionName: string): Promise<T[] | null> {
  if (typeof window === 'undefined') return null
  try {
    const authHeaders = await getAdminAuthHeaders()
    const res = await fetch(
      `/api/admin/local-store?collection=${encodeURIComponent(collectionName)}`,
      {
        cache: 'no-store',
        headers: authHeaders,
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    if (json?.ok && Array.isArray(json.docs)) {
      return json.docs as T[]
    }
  } catch {}
  return null
}

async function fetchServerLocalDoc<T>(collectionName: string, docId: string): Promise<T | null> {
  if (typeof window === 'undefined') return null
  try {
    const authHeaders = await getAdminAuthHeaders()
    const res = await fetch(
      `/api/admin/local-store?collection=${encodeURIComponent(collectionName)}&id=${encodeURIComponent(docId)}`,
      {
        cache: 'no-store',
        headers: authHeaders,
      }
    )
    if (!res.ok) return null
    const json = await res.json()
    if (json?.ok && json.doc) {
      return json.doc as T
    }
  } catch {}
  return null
}

// Local fallback pub/sub for PIN sessions and unconfigured preview environments
const localListeners = new Map<string, Set<() => void>>()

function notifyLocalListeners(collectionName: string) {
  const subs = localListeners.get(collectionName)
  if (subs) {
    subs.forEach((fn) => {
      try {
        fn()
      } catch {}
    })
  }
}

function subscribeLocal(collectionName: string, fn: () => void): () => void {
  let subs = localListeners.get(collectionName)
  if (!subs) {
    subs = new Set()
    localListeners.set(collectionName, subs)
  }
  subs.add(fn)
  return () => {
    subs?.delete(fn)
  }
}

// Helper for local storage persistence fallback
function getLocalCollection<T>(collectionName: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`lexmedia_${collectionName}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setLocalCollection<T>(collectionName: string, items: T[], notify = true) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`lexmedia_${collectionName}`, JSON.stringify(items))
    if (notify) {
      notifyLocalListeners(collectionName)
    }
  } catch {}
}

function getSyncedIdSet(collectionName: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(`lexmedia_synced_${collectionName}`)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function markIdsSynced(collectionName: string, ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return
  try {
    const set = getSyncedIdSet(collectionName)
    let changed = false
    for (const id of ids) {
      if (id && !set.has(id)) {
        set.add(id)
        changed = true
      }
    }
    if (changed) {
      localStorage.setItem(`lexmedia_synced_${collectionName}`, JSON.stringify(Array.from(set)))
    }
  } catch {}
}

function getDeletedIdSet(collectionName: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(`lexmedia_deleted_${collectionName}`)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function markIdDeleted(collectionName: string, docId: string) {
  if (typeof window === 'undefined' || !docId) return
  try {
    const delSet = getDeletedIdSet(collectionName)
    delSet.add(docId)
    localStorage.setItem(`lexmedia_deleted_${collectionName}`, JSON.stringify(Array.from(delSet)))
    const syncSet = getSyncedIdSet(collectionName)
    if (syncSet.delete(docId)) {
      localStorage.setItem(`lexmedia_synced_${collectionName}`, JSON.stringify(Array.from(syncSet)))
    }
  } catch {}
}

function clearIdDeleted(collectionName: string, docId: string) {
  if (typeof window === 'undefined' || !docId) return
  try {
    const delSet = getDeletedIdSet(collectionName)
    if (delSet.delete(docId)) {
      localStorage.setItem(`lexmedia_deleted_${collectionName}`, JSON.stringify(Array.from(delSet)))
    }
  } catch {}
}

const migratingDocKeys = new Set<string>()

function backgroundMigrateUnsyncedToCloud<T extends { id?: string }>(
  collectionName: string,
  unsyncedDocs: T[]
) {
  if (typeof window === 'undefined' || unsyncedDocs.length === 0) return
  if (!canWriteCloudFirestore(collectionName)) return
  // Only auto-migrate admin business collections (skip public log collections)
  if (PUBLIC_WRITE_COLLECTIONS.has(collectionName)) return

  for (const item of unsyncedDocs) {
    const docId = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!docId) continue
    const key = `${collectionName}/${docId}`
    if (migratingDocKeys.has(key)) continue
    migratingDocKeys.add(key)

    const { id: _omitId, ...rest } = stripUndefinedDeep(item as Record<string, any>)
    const docRef = doc(db, collectionName, docId)
    void setDoc(
      docRef,
      {
        ...rest,
        updatedAt: rest.updatedAt || serverTimestamp(),
      },
      { merge: true }
    )
      .then(() => {
        markIdsSynced(collectionName, [docId])
      })
      .catch(() => {})
      .finally(() => {
        migratingDocKeys.delete(key)
      })
  }
}

function mergeCloudAndUnsyncedBrowserDocs<T extends { id?: string }>(
  collectionName: string,
  cloudDocs: T[],
  constraints: QueryConstraint[]
): T[] {
  const cloudIds = new Set<string>()
  for (const c of cloudDocs) {
    if (c?.id) cloudIds.add(c.id)
  }
  if (cloudIds.size > 0) {
    markIdsSynced(collectionName, Array.from(cloudIds))
  }

  const syncedSet = getSyncedIdSet(collectionName)
  const deletedSet = getDeletedIdSet(collectionName)
  const allBrowserDocs = getLocalCollection<T & { id?: string }>(collectionName)

  // Unsynced browser docs are records created locally (e.g. PIN mode or offline/pre-rules)
  // that have never been confirmed in Cloud Firestore yet and were not locally deleted.
  const unsyncedBrowserDocs = allBrowserDocs.filter(
    (b) => b?.id && !cloudIds.has(b.id) && !syncedSet.has(b.id) && !deletedSet.has(b.id)
  )

  if (unsyncedBrowserDocs.length > 0) {
    mirrorMissingBrowserDocsToServer(collectionName, cloudDocs, unsyncedBrowserDocs)
    backgroundMigrateUnsyncedToCloud(collectionName, unsyncedBrowserDocs)
  }

  const filteredCloud = cloudDocs.filter((c) => !c?.id || !deletedSet.has(c.id))
  const matchingUnsynced = applyLocalQueryConstraints(unsyncedBrowserDocs as T[], constraints)

  if (matchingUnsynced.length === 0) {
    return filteredCloud
  }

  const mergedMap = new Map<string, T>()
  for (const c of filteredCloud) {
    if (c?.id) mergedMap.set(c.id, c)
  }
  for (const u of matchingUnsynced) {
    const uid = (u as any)?.id
    if (uid && !mergedMap.has(uid)) {
      mergedMap.set(uid, u)
    }
  }
  return Array.from(mergedMap.values())
}

function mergeServerAndBrowserDocs<T extends { id?: string }>(
  collectionName: string,
  serverDocs: T[] | null,
  browserDocs: T[]
): T[] {
  const deletedSet = getDeletedIdSet(collectionName)
  const cleanBrowser = browserDocs.filter((b) => !b?.id || !deletedSet.has(b.id))
  if (!serverDocs || serverDocs.length === 0) return cleanBrowser
  const map = new Map<string, T>()
  for (const b of cleanBrowser) {
    if (b?.id) map.set(b.id, b)
  }
  for (const s of serverDocs) {
    if (s?.id && !deletedSet.has(s.id)) map.set(s.id, s)
  }
  return Array.from(map.values())
}

function generateLocalId(prefix = 'doc'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Guarantees that `doc.id` is always the canonical Firestore document ID,
 * even if the stored document data contains an internal `id` property.
 */
function withCanonicalDocId<T>(docId: string, rawData: DocumentData | undefined): T {
  const data: Record<string, any> = rawData ? { ...rawData } : {}
  if (typeof data.id === 'string' && data.id.trim() && data.id !== docId && !data.legacyId) {
    data.legacyId = data.id.trim()
  }
  data.id = docId
  return data as T
}

function applyLocalQueryConstraints<T>(items: T[], constraints: QueryConstraint[]): T[] {
  if (!constraints || constraints.length === 0 || items.length === 0) return items
  let result = [...items]

  for (const c of constraints) {
    const anyC = c as any
    if (anyC?.type === 'where') {
      const segments: string[] | undefined = anyC._field?.segments
      const field = Array.isArray(segments) && segments.length > 0 ? segments.join('.') : ''
      const op = anyC._op
      const target = anyC._value
      if (field && op === '==') {
        result = result.filter((item: any) => {
          const val = field.includes('.')
            ? field.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), item)
            : item?.[field]
          return val === target
        })
      }
    }
  }

  return result
}

function mirrorMissingBrowserDocsToServer<T extends { id?: string }>(
  collectionName: string,
  serverDocs: T[] | null,
  browserDocs: T[]
) {
  if (!browserDocs || browserDocs.length === 0) return
  const serverIds = new Set((serverDocs || []).map((d) => d?.id).filter(Boolean))
  const missingOnServer = browserDocs.filter((b) => b?.id && !serverIds.has(b.id))
  if (missingOnServer.length > 0) {
    void postToServerLocalStore({
      action: 'syncCollection',
      collection: collectionName,
      cloudSynced: false,
      docs: missingOnServer.map((d) => sanitizeForJsonMirror(d)),
    })
  }
}

// ─── Generic Get Document ────────────────────────────────────
export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const cleanId = typeof docId === 'string' ? docId.trim() : ''
  if (!cleanId) return null

  if (!canReadCloudFirestore(collectionName)) {
    const serverDoc = await fetchServerLocalDoc<T & { id: string }>(collectionName, cleanId)
    if (serverDoc) {
      const canonical = withCanonicalDocId<T & { id: string }>(cleanId, serverDoc as any)
      const local = getLocalCollection<any>(collectionName)
      const idx = local.findIndex((i) => i.id === cleanId)
      if (idx >= 0) local[idx] = canonical
      else local.push(canonical)
      setLocalCollection(collectionName, local, false)
      return canonical
    }
    const local = getLocalCollection<T & { id: string }>(collectionName)
    const matched = local.find((item) => item.id === cleanId) || null
    if (matched) {
      void postToServerLocalStore({
        action: 'set',
        collection: collectionName,
        id: cleanId,
        data: sanitizeForJsonMirror(matched),
        merge: true,
        cloudSynced: false,
      })
    }
    return matched
  }

  try {
    const docRef = doc(db, collectionName, cleanId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      markIdsSynced(collectionName, [snap.id])
      const resolved = withCanonicalDocId<T>(snap.id, snap.data())
      void postToServerLocalStore({
        action: 'set',
        collection: collectionName,
        id: snap.id,
        data: sanitizeForJsonMirror(resolved),
        merge: true,
        cloudSynced: true,
      })
      return resolved
    }
    // Also check server local store in case created via PIN mode earlier
    const serverDoc = await fetchServerLocalDoc<T>(collectionName, cleanId)
    if (serverDoc) {
      const canonical = withCanonicalDocId<T & { id?: string }>(cleanId, serverDoc as any)
      backgroundMigrateUnsyncedToCloud(collectionName, [canonical])
      return canonical as T
    }
    // Check unsynced browser localStorage record (e.g. created before server restart or PIN mode)
    const syncedSet = getSyncedIdSet(collectionName)
    const deletedSet = getDeletedIdSet(collectionName)
    if (!syncedSet.has(cleanId) && !deletedSet.has(cleanId)) {
      const local = getLocalCollection<T & { id: string }>(collectionName)
      const matched = local.find((item) => item.id === cleanId) || null
      if (matched) {
        void postToServerLocalStore({
          action: 'set',
          collection: collectionName,
          id: cleanId,
          data: sanitizeForJsonMirror(matched),
          merge: true,
          cloudSynced: false,
        })
        backgroundMigrateUnsyncedToCloud(collectionName, [matched])
        return matched
      }
    }
    return null
  } catch (err: any) {
    console.warn(
      `[Cloud Firestore] Offline or permission fallback fetching ${collectionName}/${cleanId}:`,
      err?.message || err
    )
    const serverDoc = await fetchServerLocalDoc<T>(collectionName, cleanId)
    if (serverDoc) return withCanonicalDocId<T>(cleanId, serverDoc as any)
    const local = getLocalCollection<T & { id: string }>(collectionName)
    const matched = local.find((item) => item.id === cleanId) || null
    if (matched) {
      void postToServerLocalStore({
        action: 'set',
        collection: collectionName,
        id: cleanId,
        data: sanitizeForJsonMirror(matched),
        merge: true,
        cloudSynced: false,
      })
    }
    return matched
  }
}

// ─── Generic Get Documents ───────────────────────────────────
export async function getDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  if (!canReadCloudFirestore(collectionName)) {
    const browserDocs = getLocalCollection<T & { id?: string }>(collectionName)
    const serverDocs = await fetchServerLocalCollection<T & { id?: string }>(collectionName)
    mirrorMissingBrowserDocsToServer(collectionName, serverDocs, browserDocs)
    const merged = mergeServerAndBrowserDocs(collectionName, serverDocs, browserDocs)
    if (serverDocs && serverDocs.length > 0) {
      setLocalCollection(collectionName, merged, false)
    }
    return applyLocalQueryConstraints(merged as T[], constraints)
  }

  try {
    const colRef = collection(db, collectionName)
    const q = query(colRef, ...constraints)
    const snap = await getDocs(q)
    const cloudDocs = snap.docs.map((d) => withCanonicalDocId<T & { id?: string }>(d.id, d.data()))
    const mergedDocs = mergeCloudAndUnsyncedBrowserDocs(collectionName, cloudDocs, constraints)
    if (constraints.length === 0) {
      setLocalCollection(collectionName, mergedDocs, false)
      if (mergedDocs.length > 0) {
        void postToServerLocalStore({
          action: 'syncCollection',
          collection: collectionName,
          cloudSynced: true,
          docs: mergedDocs.map((d) => sanitizeForJsonMirror(d)),
        })
      }
    }
    return mergedDocs as T[]
  } catch (err: any) {
    console.warn(`[Cloud Firestore] Fallback fetching collection '${collectionName}':`, err?.message || err)
    const browserDocs = getLocalCollection<T & { id?: string }>(collectionName)
    const serverDocs = await fetchServerLocalCollection<T & { id?: string }>(collectionName)
    mirrorMissingBrowserDocsToServer(collectionName, serverDocs, browserDocs)
    const merged = mergeServerAndBrowserDocs(collectionName, serverDocs, browserDocs)
    return applyLocalQueryConstraints(merged as T[], constraints)
  }
}

// ─── Firestore Error Helper ──────────────────────────────────
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string
  operationType: OperationType
  path: string | null
  authInfo: {
    userId?: string | null
    email?: string | null
    emailVerified?: boolean | null
    isAnonymous?: boolean | null
    tenantId?: string | null
    providerInfo?: {
      providerId?: string | null
      email?: string | null
    }[]
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const authInstance = getAuthInstance()
  const currentUser = authInstance?.currentUser
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider: any) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo))
  throw new Error(JSON.stringify(errInfo))
}

// ─── Generic Add Document ────────────────────────────────────
export async function addDocument(
  collectionName: string,
  data: DocumentData
): Promise<string> {
  const cleanData = stripUndefinedDeep(data)

  if (!canWriteCloudFirestore(collectionName)) {
    const id = generateLocalId(collectionName.slice(0, 3))
    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    const newRecord = {
      ...mirrorData,
      id,
      createdAt: mirrorData.createdAt ?? nowIso,
      updatedAt: nowIso,
    }
    const local = getLocalCollection<any>(collectionName)
    local.unshift(newRecord)
    setLocalCollection(collectionName, local)
    await postToServerLocalStore({
      action: 'add',
      collection: collectionName,
      id,
      data: newRecord,
      merge: false,
      cloudSynced: false,
    })
    return id
  }

  try {
    const colRef = collection(db, collectionName)
    const docRef = await addDoc(colRef, {
      ...cleanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    markIdsSynced(collectionName, [docRef.id])
    clearIdDeleted(collectionName, docRef.id)

    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    const localRecord = { id: docRef.id, ...mirrorData, createdAt: nowIso, updatedAt: nowIso }
    const local = getLocalCollection<any>(collectionName)
    local.unshift(localRecord)
    setLocalCollection(collectionName, local)

    void postToServerLocalStore({
      action: 'set',
      collection: collectionName,
      id: docRef.id,
      data: localRecord,
      merge: true,
      cloudSynced: true,
    })

    return docRef.id
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionName)
  }
}

// ─── Generic Set Document (custom ID) ───────────────────────
export async function setDocument(
  collectionName: string,
  docId: string,
  data: DocumentData,
  merge = false
): Promise<void> {
  const cleanData = stripUndefinedDeep(data)
  clearIdDeleted(collectionName, docId)

  if (!canWriteCloudFirestore(collectionName)) {
    const local = getLocalCollection<any>(collectionName)
    const existingIdx = local.findIndex((i) => i.id === docId)
    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    const updatedItem = merge
      ? {
          ...(existingIdx >= 0 ? local[existingIdx] : { id: docId, createdAt: nowIso }),
          ...mirrorData,
          id: docId,
          updatedAt: nowIso,
        }
      : {
          ...mirrorData,
          id: docId,
          createdAt: existingIdx >= 0 ? local[existingIdx]?.createdAt ?? nowIso : nowIso,
          updatedAt: nowIso,
        }
    if (existingIdx >= 0) {
      local[existingIdx] = updatedItem
    } else {
      local.push(updatedItem)
    }
    setLocalCollection(collectionName, local)
    await postToServerLocalStore({
      action: 'set',
      collection: collectionName,
      id: docId,
      data: updatedItem,
      merge,
      cloudSynced: false,
    })
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge })
    markIdsSynced(collectionName, [docId])

    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    const local = getLocalCollection<any>(collectionName)
    const existingIdx = local.findIndex((i) => i.id === docId)
    const updatedItem = {
      ...(existingIdx >= 0 ? local[existingIdx] : { id: docId }),
      ...mirrorData,
      id: docId,
      updatedAt: nowIso,
    }
    if (existingIdx >= 0) {
      local[existingIdx] = updatedItem
    } else {
      local.push(updatedItem)
    }
    setLocalCollection(collectionName, local)

    void postToServerLocalStore({
      action: 'set',
      collection: collectionName,
      id: docId,
      data: updatedItem,
      merge,
      cloudSynced: true,
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${docId}`)
  }
}

// ─── Generic Update Document ─────────────────────────────────
export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Partial<DocumentData>
): Promise<void> {
  const cleanData = stripUndefinedDeep(data)

  if (!canWriteCloudFirestore(collectionName)) {
    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...mirrorData, id: docId, updatedAt: nowIso }
      setLocalCollection(collectionName, local)
    }
    await postToServerLocalStore({
      action: 'update',
      collection: collectionName,
      id: docId,
      data: { ...mirrorData, updatedAt: nowIso },
      cloudSynced: false,
    })
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    try {
      await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() })
    } catch (updateErr: any) {
      const code = String(updateErr?.code || '')
      const msg = String(updateErr?.message || '')
      if (code === 'not-found' || code.endsWith('/not-found') || msg.includes('No document to update')) {
        const local = getLocalCollection<any>(collectionName)
        const existingLocal = local.find((i) => i.id === docId) || {}
        const { id: _omitId, ...localBase } = stripUndefinedDeep(existingLocal)
        await setDoc(
          docRef,
          { ...localBase, ...cleanData, updatedAt: serverTimestamp() },
          { merge: true }
        )
      } else {
        throw updateErr
      }
    }
    markIdsSynced(collectionName, [docId])

    const nowIso = new Date().toISOString()
    const mirrorData = sanitizeForJsonMirror(cleanData) || {}
    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...mirrorData, updatedAt: nowIso }
      setLocalCollection(collectionName, local)
    }

    void postToServerLocalStore({
      action: 'update',
      collection: collectionName,
      id: docId,
      data: { ...mirrorData, updatedAt: nowIso },
      cloudSynced: true,
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${docId}`)
  }
}

// ─── Generic Delete Document ─────────────────────────────────
export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  markIdDeleted(collectionName, docId)
  if (!canWriteCloudFirestore(collectionName)) {
    const local = getLocalCollection<any>(collectionName)
    const filtered = local.filter((i) => i.id !== docId)
    setLocalCollection(collectionName, filtered)
    await postToServerLocalStore({
      action: 'delete',
      collection: collectionName,
      id: docId,
      cloudSynced: false,
    })
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await deleteDoc(docRef)

    const local = getLocalCollection<any>(collectionName)
    const filtered = local.filter((i) => i.id !== docId)
    setLocalCollection(collectionName, filtered)

    void postToServerLocalStore({
      action: 'delete',
      collection: collectionName,
      id: docId,
      cloudSynced: true,
    })
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${docId}`)
  }
}

// ─── Real-time Listener ──────────────────────────────────────
export function subscribeToDocument<T>(
  collectionName: string,
  docId: string,
  callback: (data: T | null) => void
): () => void {
  if (typeof window === 'undefined') {
    callback(null)
    return () => {}
  }

  let disposed = false
  let cloudUnsub: (() => void) | null = null

  const emitLocal = () => {
    if (disposed) return
    const local = getLocalCollection<T & { id: string }>(collectionName)
    callback(local.find((i) => i.id === docId) || null)
  }

  const localUnsub = subscribeLocal(collectionName, emitLocal)

  const attachCloud = () => {
    if (disposed || cloudUnsub || !canReadCloudFirestore(collectionName)) return
    try {
      const docRef = doc(db, collectionName, docId)
      cloudUnsub = onSnapshot(
        docRef,
        (snap: DocumentSnapshot) => {
          if (disposed) return
          if (snap.exists()) {
            callback(withCanonicalDocId<T>(snap.id, snap.data()))
          } else {
            emitLocal()
          }
        },
        () => {
          emitLocal()
        }
      )
    } catch {
      emitLocal()
    }
  }

  if (canReadCloudFirestore(collectionName)) {
    attachCloud()
  } else {
    emitLocal()
    void fetchServerLocalDoc<T & { id: string }>(collectionName, docId).then((serverDoc) => {
      if (disposed || !serverDoc) return
      const canonical = withCanonicalDocId<T & { id: string }>(docId, serverDoc as any)
      const local = getLocalCollection<any>(collectionName)
      const idx = local.findIndex((i) => i.id === docId)
      if (idx >= 0) local[idx] = canonical
      else local.push(canonical)
      setLocalCollection(collectionName, local, false)
      callback(canonical)
    })
  }

  const authInstance = getAuthInstance()
  const authUnsub = authInstance
    ? onAuthStateChanged(authInstance, (fbUser) => {
        if (disposed) return
        if (fbUser && !cloudUnsub) {
          attachCloud()
        }
      })
    : null

  return () => {
    disposed = true
    localUnsub()
    if (cloudUnsub) {
      try {
        cloudUnsub()
      } catch {}
    }
    if (authUnsub) {
      try {
        authUnsub()
      } catch {}
    }
  }
}

export function subscribeToCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[],
  callback: (data: T[]) => void
): () => void {
  if (typeof window === 'undefined') {
    callback([])
    return () => {}
  }

  let disposed = false
  let cloudUnsub: (() => void) | null = null

  const emitLocal = () => {
    if (disposed) return
    const allLocal = getLocalCollection<T>(collectionName)
    callback(applyLocalQueryConstraints(allLocal, constraints))
  }

  const localUnsub = subscribeLocal(collectionName, emitLocal)

  const attachCloud = () => {
    if (disposed || cloudUnsub || !canReadCloudFirestore(collectionName)) return
    try {
      const colRef = collection(db, collectionName)
      const q = query(colRef, ...constraints)
      cloudUnsub = onSnapshot(
        q,
        (snap: QuerySnapshot) => {
          if (disposed) return
          const cloudDocs = snap.docs.map((d) => withCanonicalDocId<T & { id?: string }>(d.id, d.data()))
          const mergedDocs = mergeCloudAndUnsyncedBrowserDocs(collectionName, cloudDocs, constraints)
          if (constraints.length === 0) {
            setLocalCollection(collectionName, mergedDocs, false)
            if (mergedDocs.length > 0) {
              void postToServerLocalStore({
                action: 'syncCollection',
                collection: collectionName,
                cloudSynced: true,
                docs: mergedDocs.map((d) => sanitizeForJsonMirror(d)),
              })
            }
          }
          callback(mergedDocs as T[])
        },
        (err) => {
          console.warn(`[Firestore] Subscription fallback for ${collectionName}:`, err?.message || err)
          const browserDocs = getLocalCollection<T & { id?: string }>(collectionName)
          mirrorMissingBrowserDocsToServer(collectionName, null, browserDocs)
          emitLocal()
        }
      )
    } catch (err) {
      console.warn(`[Firestore] Failed to initiate subscription for ${collectionName}:`, err)
      emitLocal()
    }
  }

  if (canReadCloudFirestore(collectionName)) {
    attachCloud()
  } else {
    emitLocal()
    void fetchServerLocalCollection<T & { id?: string }>(collectionName).then((serverDocs) => {
      if (disposed) return
      const browserDocs = getLocalCollection<T & { id?: string }>(collectionName)
      mirrorMissingBrowserDocsToServer(collectionName, serverDocs, browserDocs)
      if (!serverDocs) return
      const merged = mergeServerAndBrowserDocs(collectionName, serverDocs, browserDocs)
      setLocalCollection(collectionName, merged, false)
      callback(applyLocalQueryConstraints(merged as T[], constraints))
    })
  }

  const authInstance = getAuthInstance()
  const authUnsub = authInstance
    ? onAuthStateChanged(authInstance, (fbUser) => {
        if (disposed) return
        if (fbUser && !cloudUnsub) {
          attachCloud()
        }
      })
    : null

  return () => {
    disposed = true
    localUnsub()
    if (cloudUnsub) {
      try {
        cloudUnsub()
      } catch {}
    }
    if (authUnsub) {
      try {
        authUnsub()
      } catch {}
    }
  }
}

// ─── Increment Counter ───────────────────────────────────────
export async function incrementField(
  collectionName: string,
  docId: string,
  field: string,
  amount = 1
): Promise<void> {
  if (!canWriteCloudFirestore(collectionName)) {
    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    const nowIso = new Date().toISOString()
    if (idx >= 0) {
      local[idx] = {
        ...local[idx],
        [field]: Number(local[idx][field] || 0) + amount,
        updatedAt: nowIso,
      }
      setLocalCollection(collectionName, local)
    }
    await postToServerLocalStore({
      action: 'update',
      collection: collectionName,
      id: docId,
      data: {
        [field]: { __lex_transform: 'increment', operand: amount },
        updatedAt: nowIso,
      },
      cloudSynced: false,
    })
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await updateDoc(docRef, { [field]: increment(amount) })
    void postToServerLocalStore({
      action: 'update',
      collection: collectionName,
      id: docId,
      data: {
        [field]: { __lex_transform: 'increment', operand: amount },
      },
      cloudSynced: true,
    })
  } catch (err) {
    console.warn('Firestore incrementField warning:', err)
  }
}

// ─── Sync Server Payment Mutation to Local Browser Cache ─────
export function syncRecordedPaymentToLocalCache(payload: {
  payment?: Record<string, any> | null
  deletedPaymentId?: string | null
  updatedClient?: Record<string, any> | null
  updatedInvoice?: Record<string, any> | null
  updatedProject?: Record<string, any> | null
}): void {
  if (typeof window === 'undefined' || !payload) return

  const upsertInLocal = (colName: string, item: Record<string, any> | null | undefined, prepend = false) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) return
    clearIdDeleted(colName, item.id)
    if (hasFirebaseUserSession()) {
      markIdsSynced(colName, [item.id])
    }
    const list = getLocalCollection<any>(colName)
    const idx = list.findIndex((entry) => entry?.id === item.id)
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...item, id: item.id }
    } else if (prepend) {
      list.unshift({ ...item, id: item.id })
    } else {
      list.push({ ...item, id: item.id })
    }
    setLocalCollection(colName, list, true)
  }

  if (payload.deletedPaymentId) {
    markIdDeleted(COLLECTIONS.PAYMENTS, payload.deletedPaymentId)
    const list = getLocalCollection<any>(COLLECTIONS.PAYMENTS)
    const next = list.filter((p) => p?.id !== payload.deletedPaymentId)
    setLocalCollection(COLLECTIONS.PAYMENTS, next, true)
  }

  if (payload.payment) {
    upsertInLocal(COLLECTIONS.PAYMENTS, payload.payment, true)
  }
  if (payload.updatedClient) {
    upsertInLocal(COLLECTIONS.CLIENTS, payload.updatedClient)
  }
  if (payload.updatedInvoice) {
    upsertInLocal(COLLECTIONS.INVOICES, payload.updatedInvoice)
  }
  if (payload.updatedProject) {
    upsertInLocal(COLLECTIONS.PROJECTS, payload.updatedProject)
  }
}

// ─── Batch Write ─────────────────────────────────────────────
export { writeBatch, db, doc, collection, serverTimestamp, Timestamp, isFirebaseConfigured }
export { where, orderBy, limit, startAfter }
