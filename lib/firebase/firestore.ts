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
import { db, getAuthInstance, isFirebaseConfigured } from './config'

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

// Local fallback pub/sub for unconfigured preview environments
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

function setLocalCollection<T>(collectionName: string, items: T[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`lexmedia_${collectionName}`, JSON.stringify(items))
    notifyLocalListeners(collectionName)
  } catch {}
}

function generateLocalId(prefix = 'doc'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

// ─── Generic Get Document ────────────────────────────────────
export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  if (!isFirebaseConfigured) {
    const local = getLocalCollection<T & { id: string }>(collectionName)
    return local.find((item) => item.id === docId) || null
  }

  try {
    const docRef = doc(db, collectionName, docId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as T
    }
    return null
  } catch (err: any) {
    console.warn(`[Cloud Firestore] Offline or network warning fetching ${collectionName}/${docId}:`, err?.message || err)
    const local = getLocalCollection<T & { id: string }>(collectionName)
    return local.find((item) => item.id === docId) || null
  }
}

// ─── Generic Get Documents ───────────────────────────────────
export async function getDocuments<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  if (!isFirebaseConfigured) {
    return getLocalCollection<T>(collectionName)
  }

  try {
    const colRef = collection(db, collectionName)
    const q = query(colRef, ...constraints)
    const snap = await getDocs(q)
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T))
    setLocalCollection(collectionName, docs)
    return docs
  } catch (err: any) {
    console.error(`[Cloud Firestore] Error fetching collection '${collectionName}':`, err)
    return getLocalCollection<T>(collectionName)
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
  if (!isFirebaseConfigured) {
    const id = generateLocalId(collectionName.slice(0, 3))
    const nowIso = new Date().toISOString()
    const local = getLocalCollection<any>(collectionName)
    local.unshift({
      ...data,
      id,
      createdAt: data.createdAt ?? nowIso,
      updatedAt: nowIso,
    })
    setLocalCollection(collectionName, local)
    return id
  }

  try {
    const colRef = collection(db, collectionName)
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    console.log(`[Cloud Firestore] Successfully created document in '${collectionName}':`, docRef.id)

    const local = getLocalCollection<any>(collectionName)
    local.unshift({ id: docRef.id, ...data, createdAt: new Date().toISOString() })
    setLocalCollection(collectionName, local)

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
  if (!isFirebaseConfigured) {
    const local = getLocalCollection<any>(collectionName)
    const existingIdx = local.findIndex((i) => i.id === docId)
    const nowIso = new Date().toISOString()
    const updatedItem = merge
      ? {
          ...(existingIdx >= 0 ? local[existingIdx] : { id: docId, createdAt: nowIso }),
          ...data,
          id: docId,
          updatedAt: nowIso,
        }
      : {
          ...data,
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
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge })
    console.log(`[Cloud Firestore] Successfully set document '${collectionName}/${docId}'`)

    const local = getLocalCollection<any>(collectionName)
    const existingIdx = local.findIndex((i) => i.id === docId)
    const updatedItem = {
      ...(existingIdx >= 0 ? local[existingIdx] : { id: docId }),
      ...data,
      updatedAt: new Date().toISOString(),
    }
    if (existingIdx >= 0) {
      local[existingIdx] = updatedItem
    } else {
      local.push(updatedItem)
    }
    setLocalCollection(collectionName, local)
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
  if (!isFirebaseConfigured) {
    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    const nowIso = new Date().toISOString()
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...data, id: docId, updatedAt: nowIso }
      setLocalCollection(collectionName, local)
    }
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() })
    console.log(`[Cloud Firestore] Successfully updated document '${collectionName}/${docId}'`)

    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...data, updatedAt: new Date().toISOString() }
      setLocalCollection(collectionName, local)
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${docId}`)
  }
}

// ─── Generic Delete Document ─────────────────────────────────
export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  if (!isFirebaseConfigured) {
    const local = getLocalCollection<any>(collectionName)
    const filtered = local.filter((i) => i.id !== docId)
    setLocalCollection(collectionName, filtered)
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await deleteDoc(docRef)
    console.log(`[Cloud Firestore] Successfully deleted document '${collectionName}/${docId}'`)

    const local = getLocalCollection<any>(collectionName)
    const filtered = local.filter((i) => i.id !== docId)
    setLocalCollection(collectionName, filtered)
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

  if (!isFirebaseConfigured) {
    const emitLocal = () => {
      const local = getLocalCollection<T & { id: string }>(collectionName)
      callback(local.find((i) => i.id === docId) || null)
    }
    emitLocal()
    return subscribeLocal(collectionName, emitLocal)
  }

  try {
    const docRef = doc(db, collectionName, docId)
    return onSnapshot(
      docRef,
      (snap: DocumentSnapshot) => {
        if (snap.exists()) {
          callback({ id: snap.id, ...snap.data() } as T)
        } else {
          const local = getLocalCollection<T & { id: string }>(collectionName)
          callback(local.find((i) => i.id === docId) || null)
        }
      },
      () => {
        const local = getLocalCollection<T & { id: string }>(collectionName)
        callback(local.find((i) => i.id === docId) || null)
      }
    )
  } catch {
    const local = getLocalCollection<T & { id: string }>(collectionName)
    callback(local.find((i) => i.id === docId) || null)
    return () => {}
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

  if (!isFirebaseConfigured) {
    const emitLocal = () => {
      callback(getLocalCollection<T>(collectionName))
    }
    emitLocal()
    return subscribeLocal(collectionName, emitLocal)
  }

  try {
    const colRef = collection(db, collectionName)
    const q = query(colRef, ...constraints)
    return onSnapshot(
      q,
      (snap: QuerySnapshot) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T))
        setLocalCollection(collectionName, data)
        callback(data)
      },
      (err) => {
        console.warn(`[Firestore] Subscription error for ${collectionName}:`, err)
        callback(getLocalCollection<T>(collectionName))
      }
    )
  } catch (err) {
    console.warn(`[Firestore] Failed to initiate subscription for ${collectionName}:`, err)
    callback(getLocalCollection<T>(collectionName))
    return () => {}
  }
}

// ─── Increment Counter ───────────────────────────────────────
export async function incrementField(
  collectionName: string,
  docId: string,
  field: string,
  amount = 1
): Promise<void> {
  if (!isFirebaseConfigured) {
    const local = getLocalCollection<any>(collectionName)
    const idx = local.findIndex((i) => i.id === docId)
    if (idx >= 0) {
      local[idx] = {
        ...local[idx],
        [field]: Number(local[idx][field] || 0) + amount,
        updatedAt: new Date().toISOString(),
      }
      setLocalCollection(collectionName, local)
    }
    return
  }

  try {
    const docRef = doc(db, collectionName, docId)
    await updateDoc(docRef, { [field]: increment(amount) })
  } catch (err) {
    console.warn('Firestore incrementField warning:', err)
  }
}

// ─── Batch Write ─────────────────────────────────────────────
export { writeBatch, db, doc, collection, serverTimestamp, Timestamp, isFirebaseConfigured }
export { where, orderBy, limit, startAfter }
