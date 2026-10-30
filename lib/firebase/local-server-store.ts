import fs from 'fs'
import path from 'path'
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'

const LOCAL_DB_FILE = path.join('/tmp', 'lexmedia_local_db.json')

interface StoredTimestampMarker {
  __lex_ts: number
}

interface LocalDbSchema {
  collections: Record<string, Record<string, Record<string, any>>>
  deletedIds: Record<string, Record<string, number>>
}

let memoryState: LocalDbSchema | null = null

function loadState(): LocalDbSchema {
  if (memoryState) return memoryState

  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.collections) {
        memoryState = {
          collections: parsed.collections || {},
          deletedIds: parsed.deletedIds || {},
        }
        return memoryState
      }
    }
  } catch (err) {
    console.warn('[LocalServerStore] Failed to read state file, initializing fresh store:', err)
  }

  memoryState = { collections: {}, deletedIds: {} }
  return memoryState
}

function persistState(state: LocalDbSchema): void {
  memoryState = state
  try {
    const dir = path.dirname(LOCAL_DB_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const tmpFile = `${LOCAL_DB_FILE}.tmp.${process.pid}.${Date.now()}`
    fs.writeFileSync(tmpFile, JSON.stringify(state), 'utf8')
    fs.renameSync(tmpFile, LOCAL_DB_FILE)
  } catch (err) {
    console.warn('[LocalServerStore] Disk write warning (in-memory state active):', err)
  }
}

export function isServerTimestampTransform(val: any): boolean {
  if (!val || typeof val !== 'object') return false
  const ctor = val.constructor?.name || ''
  return (
    ctor === 'ServerTimestampTransform' ||
    val._methodName === 'serverTimestamp' ||
    val.__lex_transform === 'serverTimestamp'
  )
}

export function isDeleteTransform(val: any): boolean {
  if (!val || typeof val !== 'object') return false
  const ctor = val.constructor?.name || ''
  return (
    ctor === 'DeleteTransform' ||
    val._methodName === 'deleteField' ||
    val.__lex_transform === 'delete'
  )
}

export function isNumericIncrementTransform(val: any): { match: boolean; operand: number } {
  if (!val || typeof val !== 'object') return { match: false, operand: 0 }
  const ctor = val.constructor?.name || ''
  if (
    ctor === 'NumericIncrementTransform' ||
    val._methodName === 'increment' ||
    val.__lex_transform === 'increment'
  ) {
    return { match: true, operand: Number(val.operand ?? val._operand ?? 0) }
  }
  return { match: false, operand: 0 }
}

export function isArrayUnionTransform(val: any): { match: boolean; elements: any[] } {
  if (!val || typeof val !== 'object') return { match: false, elements: [] }
  const ctor = val.constructor?.name || ''
  if (
    ctor === 'ArrayUnionTransform' ||
    val._methodName === 'arrayUnion' ||
    val.__lex_transform === 'arrayUnion'
  ) {
    const els = val.elements ?? val._elements
    return { match: true, elements: Array.isArray(els) ? els : [] }
  }
  return { match: false, elements: [] }
}

export function isArrayRemoveTransform(val: any): { match: boolean; elements: any[] } {
  if (!val || typeof val !== 'object') return { match: false, elements: [] }
  const ctor = val.constructor?.name || ''
  if (
    ctor === 'ArrayRemoveTransform' ||
    val._methodName === 'arrayRemove' ||
    val.__lex_transform === 'arrayRemove'
  ) {
    const els = val.elements ?? val._elements
    return { match: true, elements: Array.isArray(els) ? els : [] }
  }
  return { match: false, elements: [] }
}

function isTimestampLikeObject(val: any): number | null {
  if (!val || typeof val !== 'object') return null
  if (val instanceof Date) {
    return Number.isFinite(val.getTime()) ? val.getTime() : Date.now()
  }
  if (typeof val.toMillis === 'function') {
    try {
      return val.toMillis()
    } catch {}
  }
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate()
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime()
    } catch {}
  }
  if (typeof val.__lex_ts === 'number') {
    return val.__lex_ts
  }
  if (typeof val._seconds === 'number') {
    return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6)
  }
  if (typeof val.seconds === 'number' && Object.keys(val).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'type')) {
    return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6)
  }
  return null
}

function serializeValueForStorage(val: any, existingVal?: any): any {
  if (val === undefined) return undefined
  if (val === null || typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') {
    return val
  }

  if (isServerTimestampTransform(val)) {
    return { __lex_ts: Date.now() } satisfies StoredTimestampMarker
  }

  const inc = isNumericIncrementTransform(val)
  if (inc.match) {
    const base = typeof existingVal === 'number' ? existingVal : Number(existingVal) || 0
    return base + inc.operand
  }

  const union = isArrayUnionTransform(val)
  if (union.match) {
    const base = Array.isArray(existingVal) ? [...existingVal] : []
    for (const item of union.elements) {
      const serialized = serializeValueForStorage(item)
      const serializedJson = JSON.stringify(serialized)
      if (!base.some((b) => JSON.stringify(b) === serializedJson)) {
        base.push(serialized)
      }
    }
    return base
  }

  const remove = isArrayRemoveTransform(val)
  if (remove.match) {
    const base = Array.isArray(existingVal) ? [...existingVal] : []
    const removeSet = new Set(remove.elements.map((e) => JSON.stringify(serializeValueForStorage(e))))
    return base.filter((b) => !removeSet.has(JSON.stringify(b)))
  }

  const tsMillis = isTimestampLikeObject(val)
  if (tsMillis !== null) {
    return { __lex_ts: tsMillis } satisfies StoredTimestampMarker
  }

  if (Array.isArray(val)) {
    return val
      .map((item) => serializeValueForStorage(item))
      .filter((item) => item !== undefined)
  }

  if (typeof val === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined || isDeleteTransform(v)) continue
      const prev = existingVal && typeof existingVal === 'object' ? existingVal[k] : undefined
      const serialized = serializeValueForStorage(v, prev)
      if (serialized !== undefined) {
        out[k] = serialized
      }
    }
    return out
  }

  return val
}

export function hydrateStoredDoc(rawDoc: Record<string, any>): Record<string, any> {
  const hydrateVal = (val: any): any => {
    if (val === null || val === undefined || typeof val !== 'object') return val
    if (typeof val.__lex_ts === 'number') {
      return AdminTimestamp.fromMillis(val.__lex_ts)
    }
    if (Array.isArray(val)) {
      return val.map(hydrateVal)
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(val)) {
      if (k === '_localUpdatedAtMs' || k === '_cloudSynced') continue
      out[k] = hydrateVal(v)
    }
    return out
  }
  return hydrateVal(rawDoc)
}

export function dehydrateForJsonResponse(rawDoc: Record<string, any>): Record<string, any> {
  const convertVal = (val: any): any => {
    if (val === null || val === undefined || typeof val !== 'object') return val
    if (typeof val.__lex_ts === 'number') {
      return new Date(val.__lex_ts).toISOString()
    }
    const ts = isTimestampLikeObject(val)
    if (ts !== null) {
      return new Date(ts).toISOString()
    }
    if (Array.isArray(val)) {
      return val.map(convertVal)
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(val)) {
      if (k === '_localUpdatedAtMs' || k === '_cloudSynced') continue
      out[k] = convertVal(v)
    }
    return out
  }
  return convertVal(rawDoc)
}

function setNestedField(target: Record<string, any>, dottedPath: string, value: any): void {
  const parts = dottedPath.split('.')
  let curr = target
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!curr[p] || typeof curr[p] !== 'object' || Array.isArray(curr[p])) {
      curr[p] = {}
    }
    curr = curr[p]
  }
  const last = parts[parts.length - 1]
  if (isDeleteTransform(value)) {
    delete curr[last]
  } else {
    const serialized = serializeValueForStorage(value, curr[last])
    if (serialized !== undefined) {
      curr[last] = serialized
    }
  }
}

export function getLocalDocRaw(
  collectionPath: string,
  docId: string
): { exists: boolean; raw: Record<string, any> | null; deletedAtMs?: number } {
  const state = loadState()
  const deletedAtMs = state.deletedIds[collectionPath]?.[docId]
  const raw = state.collections[collectionPath]?.[docId] || null
  return { exists: Boolean(raw), raw, deletedAtMs }
}

export function getLocalDocHydrated(
  collectionPath: string,
  docId: string
): { exists: boolean; data: Record<string, any> | null; localUpdatedAtMs: number; cloudSynced: boolean; deletedAtMs?: number } {
  const { exists, raw, deletedAtMs } = getLocalDocRaw(collectionPath, docId)
  if (!exists || !raw) {
    return { exists: false, data: null, localUpdatedAtMs: 0, cloudSynced: false, deletedAtMs }
  }
  return {
    exists: true,
    data: hydrateStoredDoc(raw),
    localUpdatedAtMs: Number(raw._localUpdatedAtMs || 0),
    cloudSynced: Boolean(raw._cloudSynced),
    deletedAtMs,
  }
}

export function setLocalDoc(
  collectionPath: string,
  docId: string,
  data: Record<string, any>,
  options?: { merge?: boolean; cloudSynced?: boolean }
): Record<string, any> {
  const state = loadState()
  if (!state.collections[collectionPath]) {
    state.collections[collectionPath] = {}
  }
  if (state.deletedIds[collectionPath]) {
    delete state.deletedIds[collectionPath][docId]
  }

  const existing = state.collections[collectionPath][docId] || {}
  const base: Record<string, any> = options?.merge ? JSON.parse(JSON.stringify(existing)) : {}

  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined) continue
    if (isDeleteTransform(v)) {
      delete base[k]
      continue
    }
    const serialized = serializeValueForStorage(v, existing[k])
    if (serialized !== undefined) {
      base[k] = serialized
    }
  }

  base._localUpdatedAtMs = Date.now()
  base._cloudSynced = Boolean(options?.cloudSynced)

  state.collections[collectionPath][docId] = base
  persistState(state)
  return hydrateStoredDoc(base)
}

export function updateLocalDoc(
  collectionPath: string,
  docId: string,
  updates: Record<string, any>,
  options?: { cloudSynced?: boolean }
): Record<string, any> {
  const state = loadState()
  if (!state.collections[collectionPath]) {
    state.collections[collectionPath] = {}
  }
  if (state.deletedIds[collectionPath]) {
    delete state.deletedIds[collectionPath][docId]
  }

  const existing = state.collections[collectionPath][docId] || {}
  const target: Record<string, any> = JSON.parse(JSON.stringify(existing))

  for (const [k, v] of Object.entries(updates || {})) {
    if (v === undefined) continue
    if (k.includes('.')) {
      setNestedField(target, k, v)
    } else if (isDeleteTransform(v)) {
      delete target[k]
    } else {
      const serialized = serializeValueForStorage(v, target[k])
      if (serialized !== undefined) {
        target[k] = serialized
      }
    }
  }

  target._localUpdatedAtMs = Date.now()
  target._cloudSynced = Boolean(options?.cloudSynced)

  state.collections[collectionPath][docId] = target
  persistState(state)
  return hydrateStoredDoc(target)
}

export function deleteLocalDoc(
  collectionPath: string,
  docId: string,
  options?: { cloudSynced?: boolean }
): void {
  const state = loadState()
  if (state.collections[collectionPath]) {
    delete state.collections[collectionPath][docId]
  }
  if (!options?.cloudSynced) {
    if (!state.deletedIds[collectionPath]) {
      state.deletedIds[collectionPath] = {}
    }
    state.deletedIds[collectionPath][docId] = Date.now()
  } else if (state.deletedIds[collectionPath]) {
    delete state.deletedIds[collectionPath][docId]
  }
  persistState(state)
}

export function clearLocalCollection(collectionPath: string): number {
  const state = loadState()
  const count = Object.keys(state.collections[collectionPath] || {}).length
  state.collections[collectionPath] = {}
  state.deletedIds[collectionPath] = {}
  persistState(state)
  return count
}

export function listAllLocalDocsJson(collectionPath: string): Array<Record<string, any>> {
  const state = loadState()
  const col = state.collections[collectionPath] || {}
  return Object.entries(col).map(([id, raw]) => ({
    ...dehydrateForJsonResponse(raw),
    id,
  }))
}

export interface LocalQueryFilter {
  field: string
  op: string
  value: any
}

export interface LocalQueryOrder {
  field: string
  direction: 'asc' | 'desc'
}

function getFieldByPath(obj: Record<string, any>, fieldPath: string, docId: string): any {
  if (fieldPath === '__name__') return docId
  if (!fieldPath.includes('.')) return obj?.[fieldPath]
  return fieldPath.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj)
}

function normalizeComparable(val: any): any {
  if (val === null || val === undefined) return null
  const ts = isTimestampLikeObject(val)
  if (ts !== null) return ts
  if (typeof val === 'string') {
    // Keep normal strings unless ISO 8601 date format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      const parsed = Date.parse(val)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return val
}

export function evaluateFilter(docData: Record<string, any>, docId: string, filter: LocalQueryFilter): boolean {
  const rawFieldVal = getFieldByPath(docData, filter.field, docId)
  let targetVal = filter.value
  if (filter.field === '__name__' && typeof targetVal === 'string' && targetVal.includes('/')) {
    targetVal = targetVal.split('/').pop() || targetVal
  }

  const left = normalizeComparable(rawFieldVal)
  const right = normalizeComparable(targetVal)

  switch (filter.op) {
    case '==':
      return left === right
    case '!=':
      return left !== right
    case '<':
      return left !== null && right !== null && left < right
    case '<=':
      return left !== null && right !== null && left <= right
    case '>':
      return left !== null && right !== null && left > right
    case '>=':
      return left !== null && right !== null && left >= right
    case 'in':
      if (!Array.isArray(targetVal)) return false
      return targetVal.map(normalizeComparable).includes(left)
    case 'not-in':
      if (!Array.isArray(targetVal)) return true
      return !targetVal.map(normalizeComparable).includes(left)
    case 'array-contains':
      if (!Array.isArray(rawFieldVal)) return false
      return rawFieldVal.map(normalizeComparable).includes(right)
    case 'array-contains-any':
      if (!Array.isArray(rawFieldVal) || !Array.isArray(targetVal)) return false
      const targetNorm = new Set(targetVal.map(normalizeComparable))
      return rawFieldVal.some((item) => targetNorm.has(normalizeComparable(item)))
    default:
      return true
  }
}

export function sortAndLimitDocs<T extends { id: string; data: Record<string, any> }>(
  items: T[],
  orders: LocalQueryOrder[],
  limitCount?: number
): T[] {
  const copy = [...items]
  if (orders.length > 0) {
    copy.sort((a, b) => {
      for (const ord of orders) {
        const va = normalizeComparable(getFieldByPath(a.data, ord.field, a.id))
        const vb = normalizeComparable(getFieldByPath(b.data, ord.field, b.id))
        if (va === vb) continue
        if (va === null || va === undefined) return ord.direction === 'asc' ? 1 : -1
        if (vb === null || vb === undefined) return ord.direction === 'asc' ? -1 : 1
        const cmp = va < vb ? -1 : 1
        return ord.direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }
  if (typeof limitCount === 'number' && limitCount >= 0) {
    return copy.slice(0, limitCount)
  }
  return copy
}

export function queryLocalCollection(
  collectionPath: string,
  filters: LocalQueryFilter[] = [],
  orders: LocalQueryOrder[] = [],
  limitCount?: number
): Array<{ id: string; data: Record<string, any>; localUpdatedAtMs: number; cloudSynced: boolean }> {
  const state = loadState()
  const col = state.collections[collectionPath] || {}
  const matched: Array<{ id: string; data: Record<string, any>; localUpdatedAtMs: number; cloudSynced: boolean }> = []

  for (const [id, raw] of Object.entries(col)) {
    const hydrated = hydrateStoredDoc(raw)
    if (filters.every((f) => evaluateFilter(hydrated, id, f))) {
      matched.push({
        id,
        data: hydrated,
        localUpdatedAtMs: Number(raw._localUpdatedAtMs || 0),
        cloudSynced: Boolean(raw._cloudSynced),
      })
    }
  }

  return sortAndLimitDocs(matched, orders, limitCount)
}

export function getLocallyDeletedMap(collectionPath: string): Record<string, number> {
  const state = loadState()
  return state.deletedIds[collectionPath] || {}
}
