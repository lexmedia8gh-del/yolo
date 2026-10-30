import crypto from 'crypto'
import { cookies, headers } from 'next/headers'
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import firebaseAppletConfig from '@/firebase-applet-config.json'
import {
  deleteLocalDoc,
  evaluateFilter,
  getLocalDocHydrated,
  getLocallyDeletedMap,
  isArrayRemoveTransform,
  isArrayUnionTransform,
  isDeleteTransform,
  isNumericIncrementTransform,
  isServerTimestampTransform,
  queryLocalCollection,
  setLocalDoc,
  sortAndLimitDocs,
  updateLocalDoc,
  type LocalQueryFilter,
  type LocalQueryOrder,
} from './local-server-store'

const PUBLIC_READ_COLLECTIONS = new Set([
  'deliveries',
  'deliveryFiles',
  'clientLinks',
  'clientPreviews',
])

const PUBLIC_WRITE_COLLECTIONS = new Set(['previewLogs'])

function generateFirestoreId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(20)
  let id = ''
  for (let i = 0; i < 20; i++) {
    id += chars[bytes[i] % chars.length]
  }
  return id
}

function cleanConfigVal(raw?: string): string | undefined {
  if (!raw) return undefined
  let val = String(raw).trim()
  val = val.replace(/^[A-Z0-9_]+\s*=\s*/i, '').trim()
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim()
  }
  return val || undefined
}

function getRestConfig(projectId: string, databaseId?: string) {
  const dbId = databaseId || '(default)'
  const apiKey =
    cleanConfigVal(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) ||
    cleanConfigVal(process.env.FIREBASE_API_KEY) ||
    cleanConfigVal(firebaseAppletConfig?.apiKey) ||
    ''
  const basePath = `projects/${projectId}/databases/${dbId}/documents`
  const baseUrl = `https://firestore.googleapis.com/v1/${encodeURI(basePath)}`
  return { projectId, dbId, apiKey, basePath, baseUrl }
}

async function resolveCallerJwt(): Promise<string | null> {
  try {
    const hdrs = await Promise.resolve(headers())
    const authHeader = hdrs.get('authorization') || ''
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim()
      if (token.split('.').length === 3) {
        return token
      }
    }
  } catch {}

  try {
    const ck = await Promise.resolve(cookies())
    const session = ck.get('__session')?.value?.trim() || ''
    if (session.split('.').length === 3) {
      return session
    }
  } catch {}

  return null
}

function escapeFieldPathSegment(seg: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg)) return seg
  return `\`${seg.replace(/`/g, '\\`')}\``
}

function formatFieldPath(fieldPath: string): string {
  return fieldPath.split('.').map(escapeFieldPathSegment).join('.')
}

function toFirestoreValue(val: any): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null }
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val }
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' }
    if (Number.isInteger(val) && Number.isSafeInteger(val)) {
      return { integerValue: String(val) }
    }
    return { doubleValue: val }
  }
  if (typeof val === 'string') {
    return { stringValue: val }
  }
  if (val instanceof Date) {
    const iso = Number.isFinite(val.getTime()) ? val.toISOString() : new Date().toISOString()
    return { timestampValue: iso }
  }
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate()
        if (d instanceof Date && Number.isFinite(d.getTime())) {
          return { timestampValue: d.toISOString() }
        }
      } catch {}
    }
    if (typeof val._seconds === 'number') {
      const ms = val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6)
      return { timestampValue: new Date(ms).toISOString() }
    }
    if (
      typeof val.seconds === 'number' &&
      Object.keys(val).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'type')
    ) {
      const ms = val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6)
      return { timestampValue: new Date(ms).toISOString() }
    }
    if (Array.isArray(val)) {
      return {
        arrayValue: {
          values: val.filter((v) => v !== undefined).map(toFirestoreValue),
        },
      }
    }
    const fields: Record<string, any> = {}
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined || isDeleteTransform(v) || isServerTimestampTransform(v)) continue
      fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null
  if ('nullValue' in val) return null
  if ('booleanValue' in val) return Boolean(val.booleanValue)
  if ('integerValue' in val) return Number(val.integerValue)
  if ('doubleValue' in val) return Number(val.doubleValue)
  if ('stringValue' in val) return String(val.stringValue)
  if ('timestampValue' in val) {
    const d = new Date(val.timestampValue)
    return Number.isFinite(d.getTime()) ? AdminTimestamp.fromDate(d) : AdminTimestamp.now()
  }
  if ('referenceValue' in val) return String(val.referenceValue)
  if ('geoPointValue' in val) return val.geoPointValue
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values
    return Array.isArray(arr) ? arr.map(fromFirestoreValue) : []
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {}
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v)
    }
    return out
  }
  return null
}

function decodeFirestoreDocument(docJson: any): { id: string; data: Record<string, any>; updateTimeMs: number } {
  const name = String(docJson?.name || '')
  const id = decodeURIComponent(name.split('/').pop() || '')
  const fields = docJson?.fields || {}
  const data: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields)) {
    data[k] = fromFirestoreValue(v)
  }
  const updateTimeMs = docJson?.updateTime ? Date.parse(docJson.updateTime) || 0 : 0
  return { id, data, updateTimeMs }
}

interface BuiltCommitWrite {
  write: Record<string, any>
}

function setNestedMapValue(fieldsObj: Record<string, any>, dottedKey: string, val: any): void {
  const parts = dottedKey.split('.')
  let currFields = fieldsObj
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i]
    if (!currFields[seg] || !currFields[seg].mapValue) {
      currFields[seg] = { mapValue: { fields: {} } }
    }
    if (!currFields[seg].mapValue.fields) {
      currFields[seg].mapValue.fields = {}
    }
    currFields = currFields[seg].mapValue.fields
  }
  currFields[parts[parts.length - 1]] = toFirestoreValue(val)
}

function buildCommitWrite(
  fullDocResourceName: string,
  mode: 'set' | 'merge' | 'update' | 'create' | 'delete',
  data?: Record<string, any>
): BuiltCommitWrite {
  if (mode === 'delete') {
    return { write: { delete: fullDocResourceName } }
  }

  const fields: Record<string, any> = {}
  const maskFieldPaths: string[] = []
  const transforms: Array<Record<string, any>> = []

  const collectEntries = (obj: Record<string, any>, prefix = '', allowDottedKeys = false) => {
    for (const [rawKey, val] of Object.entries(obj || {})) {
      if (val === undefined) continue
      const fullPath = prefix ? `${prefix}.${rawKey}` : rawKey
      const formattedPath = formatFieldPath(fullPath)

      if (isDeleteTransform(val)) {
        if (mode === 'merge' || mode === 'update') {
          maskFieldPaths.push(formattedPath)
        }
        continue
      }

      if (isServerTimestampTransform(val)) {
        transforms.push({
          fieldPath: formattedPath,
          setToServerValue: 'REQUEST_TIME',
        })
        continue
      }

      const inc = isNumericIncrementTransform(val)
      if (inc.match) {
        transforms.push({
          fieldPath: formattedPath,
          increment: Number.isInteger(inc.operand)
            ? { integerValue: String(inc.operand) }
            : { doubleValue: inc.operand },
        })
        continue
      }

      const union = isArrayUnionTransform(val)
      if (union.match) {
        transforms.push({
          fieldPath: formattedPath,
          appendMissingElements: { values: union.elements.map(toFirestoreValue) },
        })
        continue
      }

      const remove = isArrayRemoveTransform(val)
      if (remove.match) {
        transforms.push({
          fieldPath: formattedPath,
          removeAllFromArray: { values: remove.elements.map(toFirestoreValue) },
        })
        continue
      }

      // Check if plain nested object (not Timestamp/Date/Array) that may contain nested transforms
      const isPlainObj =
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !(val instanceof Date) &&
        typeof val.toDate !== 'function' &&
        typeof val._seconds !== 'number' &&
        !(typeof val.seconds === 'number' && Object.keys(val).length <= 3)

      if (isPlainObj && !allowDottedKeys && Object.values(val).some((child) =>
        isServerTimestampTransform(child) ||
        isDeleteTransform(child) ||
        isNumericIncrementTransform(child).match ||
        isArrayUnionTransform(child).match ||
        isArrayRemoveTransform(child).match
      )) {
        collectEntries(val, fullPath, false)
        continue
      }

      if (allowDottedKeys && rawKey.includes('.')) {
        setNestedMapValue(fields, rawKey, val)
      } else if (prefix) {
        setNestedMapValue(fields, fullPath, val)
      } else {
        fields[rawKey] = toFirestoreValue(val)
      }
      maskFieldPaths.push(formattedPath)
    }
  }

  collectEntries(data || {}, '', mode === 'update')

  const writeObj: Record<string, any> = {
    update: {
      name: fullDocResourceName,
      fields,
    },
  }

  if (mode === 'merge' || mode === 'update') {
    writeObj.updateMask = { fieldPaths: Array.from(new Set(maskFieldPaths)) }
  }
  if (transforms.length > 0) {
    writeObj.updateTransforms = transforms
  }
  if (mode === 'update') {
    writeObj.currentDocument = { exists: true }
  } else if (mode === 'create') {
    writeObj.currentDocument = { exists: false }
  }

  return { write: writeObj }
}

const FILTER_OP_MAP: Record<string, string> = {
  '==': 'EQUAL',
  '!=': 'NOT_EQUAL',
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
  '>=': 'GREATER_THAN_OR_EQUAL',
  'array-contains': 'ARRAY_CONTAINS',
  in: 'IN',
  'not-in': 'NOT_IN',
  'array-contains-any': 'ARRAY_CONTAINS_ANY',
}

export class RestDocumentSnapshot {
  readonly id: string
  readonly ref: RestDocumentReference
  readonly exists: boolean
  private readonly _data: Record<string, any> | undefined

  constructor(ref: RestDocumentReference, exists: boolean, data?: Record<string, any>) {
    this.id = ref.id
    this.ref = ref
    this.exists = exists
    this._data = exists && data ? data : undefined
  }

  data(): Record<string, any> | undefined {
    return this._data ? { ...this._data } : undefined
  }

  get(fieldPath: string): any {
    if (!this._data) return undefined
    if (!fieldPath.includes('.')) return this._data[fieldPath]
    return fieldPath.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), this._data)
  }
}

export class RestQuerySnapshot {
  readonly docs: RestDocumentSnapshot[]
  readonly empty: boolean
  readonly size: number

  constructor(docs: RestDocumentSnapshot[]) {
    this.docs = docs
    this.size = docs.length
    this.empty = docs.length === 0
  }

  forEach(callback: (result: RestDocumentSnapshot, idx: number) => void): void {
    this.docs.forEach((d, idx) => callback(d, idx))
  }
}

export class RestDocumentReference {
  readonly id: string
  readonly path: string
  readonly collectionPath: string
  private readonly adapter: FirestoreRestAdapter

  constructor(adapter: FirestoreRestAdapter, collectionPath: string, id: string) {
    this.adapter = adapter
    this.collectionPath = collectionPath
    this.id = id
    this.path = `${collectionPath}/${id}`
  }

  collection(subCollectionName: string): RestCollectionReference {
    return new RestCollectionReference(this.adapter, `${this.path}/${subCollectionName}`)
  }

  async get(): Promise<RestDocumentSnapshot> {
    return this.adapter._getDocument(this)
  }

  async set(data: Record<string, any>, options?: { merge?: boolean }): Promise<{ writeTime: AdminTimestamp }> {
    await this.adapter._writeDocument(this, options?.merge ? 'merge' : 'set', data)
    return { writeTime: AdminTimestamp.now() }
  }

  async create(data: Record<string, any>): Promise<{ writeTime: AdminTimestamp }> {
    await this.adapter._writeDocument(this, 'create', data)
    return { writeTime: AdminTimestamp.now() }
  }

  async update(data: Record<string, any>): Promise<{ writeTime: AdminTimestamp }> {
    await this.adapter._writeDocument(this, 'update', data)
    return { writeTime: AdminTimestamp.now() }
  }

  async delete(): Promise<{ writeTime: AdminTimestamp }> {
    await this.adapter._writeDocument(this, 'delete')
    return { writeTime: AdminTimestamp.now() }
  }
}

export class RestQuery {
  protected readonly adapter: FirestoreRestAdapter
  protected readonly collectionPath: string
  protected readonly filters: LocalQueryFilter[]
  protected readonly orders: LocalQueryOrder[]
  protected readonly limitCount?: number

  constructor(
    adapter: FirestoreRestAdapter,
    collectionPath: string,
    filters: LocalQueryFilter[] = [],
    orders: LocalQueryOrder[] = [],
    limitCount?: number
  ) {
    this.adapter = adapter
    this.collectionPath = collectionPath
    this.filters = filters
    this.orders = orders
    this.limitCount = limitCount
  }

  where(field: any, op?: string, value?: any): RestQuery {
    // Support Filter-like object or standard 3-arg where(field, op, value)
    const fieldName = typeof field === 'string' ? field : String(field?.fieldPath || field)
    return new RestQuery(
      this.adapter,
      this.collectionPath,
      [...this.filters, { field: fieldName, op: op || '==', value }],
      this.orders,
      this.limitCount
    )
  }

  orderBy(field: any, direction: 'asc' | 'desc' = 'asc'): RestQuery {
    const fieldName = typeof field === 'string' ? field : String(field?.fieldPath || field)
    const dir = String(direction).toLowerCase() === 'desc' ? 'desc' : 'asc'
    return new RestQuery(
      this.adapter,
      this.collectionPath,
      this.filters,
      [...this.orders, { field: fieldName, direction: dir }],
      this.limitCount
    )
  }

  limit(n: number): RestQuery {
    return new RestQuery(this.adapter, this.collectionPath, this.filters, this.orders, n)
  }

  offset(_n: number): RestQuery {
    return this
  }

  startAfter(..._vals: any[]): RestQuery {
    return this
  }

  async get(): Promise<RestQuerySnapshot> {
    return this.adapter._runQuery(this.collectionPath, this.filters, this.orders, this.limitCount)
  }
}

export class RestCollectionReference extends RestQuery {
  readonly id: string
  readonly path: string

  constructor(adapter: FirestoreRestAdapter, collectionPath: string) {
    super(adapter, collectionPath)
    const clean = collectionPath.replace(/^\/+|\/+$/g, '')
    this.path = clean
    this.id = clean.split('/').pop() || clean
  }

  doc(docId?: string): RestDocumentReference {
    const resolvedId = docId && String(docId).trim() ? String(docId).trim() : generateFirestoreId()
    return new RestDocumentReference(this.adapter, this.path, resolvedId)
  }

  async add(data: Record<string, any>): Promise<RestDocumentReference> {
    const ref = this.doc()
    await ref.set(data)
    return ref
  }
}

interface QueuedBatchOp {
  ref: RestDocumentReference
  mode: 'set' | 'merge' | 'update' | 'create' | 'delete'
  data?: Record<string, any>
}

export class RestWriteBatch {
  private readonly adapter: FirestoreRestAdapter
  private readonly ops: QueuedBatchOp[] = []

  constructor(adapter: FirestoreRestAdapter) {
    this.adapter = adapter
  }

  set(ref: RestDocumentReference, data: Record<string, any>, options?: { merge?: boolean }): this {
    this.ops.push({ ref, mode: options?.merge ? 'merge' : 'set', data })
    return this
  }

  create(ref: RestDocumentReference, data: Record<string, any>): this {
    this.ops.push({ ref, mode: 'create', data })
    return this
  }

  update(ref: RestDocumentReference, data: Record<string, any>): this {
    this.ops.push({ ref, mode: 'update', data })
    return this
  }

  delete(ref: RestDocumentReference): this {
    this.ops.push({ ref, mode: 'delete' })
    return this
  }

  async commit(): Promise<Array<{ writeTime: AdminTimestamp }>> {
    if (this.ops.length === 0) return []
    await this.adapter._commitBatch(this.ops)
    return this.ops.map(() => ({ writeTime: AdminTimestamp.now() }))
  }
}

export class FirestoreRestAdapter {
  private readonly projectId: string
  private readonly databaseId?: string

  constructor(projectId: string, databaseId?: string) {
    this.projectId = projectId
    this.databaseId = databaseId
  }

  collection(collectionPath: string): RestCollectionReference {
    const clean = collectionPath.replace(/^\/+|\/+$/g, '')
    return new RestCollectionReference(this, clean)
  }

  doc(documentPath: string): RestDocumentReference {
    const parts = documentPath.replace(/^\/+|\/+$/g, '').split('/')
    const docId = parts.pop() || generateFirestoreId()
    const colPath = parts.join('/')
    return new RestDocumentReference(this, colPath, docId)
  }

  batch(): RestWriteBatch {
    return new RestWriteBatch(this)
  }

  async getAll(...refs: RestDocumentReference[]): Promise<RestDocumentSnapshot[]> {
    return Promise.all(refs.map((r) => r.get()))
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const batch = this.batch()
    const tx = {
      get: (target: RestDocumentReference | RestQuery) => target.get(),
      set: (ref: RestDocumentReference, data: Record<string, any>, opts?: { merge?: boolean }) => {
        batch.set(ref, data, opts)
        return tx
      },
      create: (ref: RestDocumentReference, data: Record<string, any>) => {
        batch.create(ref, data)
        return tx
      },
      update: (ref: RestDocumentReference, data: Record<string, any>) => {
        batch.update(ref, data)
        return tx
      },
      delete: (ref: RestDocumentReference) => {
        batch.delete(ref)
        return tx
      },
    }
    const result = await updateFunction(tx)
    await batch.commit()
    return result
  }

  private buildHeaders(jwt: string | null): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (jwt) {
      h.Authorization = `Bearer ${jwt}`
    }
    return h
  }

  private appendApiKey(url: string, apiKey: string): string {
    if (!apiKey) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}key=${encodeURIComponent(apiKey)}`
  }

  async _getDocument(ref: RestDocumentReference): Promise<RestDocumentSnapshot> {
    const topCollection = ref.collectionPath.split('/')[0]
    const jwt = await resolveCallerJwt()
    const { apiKey, baseUrl } = getRestConfig(this.projectId, this.databaseId)
    const localState = getLocalDocHydrated(ref.collectionPath, ref.id)

    const canReadCloud = Boolean(jwt) || PUBLIC_READ_COLLECTIONS.has(topCollection)
    if (canReadCloud && apiKey) {
      const encodedDocPath = ref.path
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
      const url = this.appendApiKey(`${baseUrl}/${encodedDocPath}`, apiKey)

      try {
        let res = await fetch(url, {
          method: 'GET',
          headers: this.buildHeaders(jwt),
          cache: 'no-store',
        })

        // If JWT expired on a publicly readable collection, retry unauthenticated
        if ((res.status === 401 || res.status === 403) && jwt && PUBLIC_READ_COLLECTIONS.has(topCollection)) {
          res = await fetch(url, {
            method: 'GET',
            headers: this.buildHeaders(null),
            cache: 'no-store',
          })
        }

        if (res.ok) {
          const json = await res.json()
          const decoded = decodeFirestoreDocument(json)

          // Respect newer unsynced local deletion or local PIN-session update
          if (localState.deletedAtMs && localState.deletedAtMs > decoded.updateTimeMs) {
            return new RestDocumentSnapshot(ref, false)
          }
          if (
            localState.exists &&
            !localState.cloudSynced &&
            localState.localUpdatedAtMs > decoded.updateTimeMs &&
            localState.data
          ) {
            return new RestDocumentSnapshot(ref, true, localState.data)
          }

          setLocalDoc(ref.collectionPath, ref.id, decoded.data, { merge: false, cloudSynced: true })
          return new RestDocumentSnapshot(ref, true, decoded.data)
        }

        if (res.status === 404) {
          if (localState.exists && !localState.cloudSynced && localState.data) {
            return new RestDocumentSnapshot(ref, true, localState.data)
          }
          return new RestDocumentSnapshot(ref, false)
        }
      } catch (err) {
        console.warn(`[FirestoreREST] Network fallback on GET ${ref.path}:`, err)
      }
    }

    if (localState.exists && localState.data) {
      return new RestDocumentSnapshot(ref, true, localState.data)
    }
    return new RestDocumentSnapshot(ref, false)
  }

  private buildStructuredQueryBody(
    collectionPath: string,
    filters: LocalQueryFilter[],
    orders: LocalQueryOrder[],
    limitCount: number | undefined,
    basePath: string
  ): { parentUrlPath: string; body: Record<string, any> } {
    const segments = collectionPath.split('/')
    const collectionId = segments[segments.length - 1]
    const parentSegments = segments.slice(0, -1)
    const parentResource =
      parentSegments.length > 0 ? `${basePath}/${parentSegments.join('/')}` : basePath

    const structuredQuery: Record<string, any> = {
      from: [{ collectionId }],
    }

    if (filters.length > 0) {
      const builtFilters = filters.map((f) => {
        const op = FILTER_OP_MAP[f.op] || 'EQUAL'
        let encodedVal: Record<string, any>

        if (f.field === '__name__') {
          const toRef = (v: any) => {
            const rawStr = String(v)
            const fullRef = rawStr.startsWith('projects/')
              ? rawStr
              : `${basePath}/${collectionPath}/${rawStr.split('/').pop()}`
            return { referenceValue: fullRef }
          }
          encodedVal =
            op === 'IN' || op === 'NOT_IN'
              ? { arrayValue: { values: (Array.isArray(f.value) ? f.value : []).map(toRef) } }
              : toRef(f.value)
        } else if (op === 'IN' || op === 'NOT_IN' || op === 'ARRAY_CONTAINS_ANY') {
          encodedVal = {
            arrayValue: {
              values: (Array.isArray(f.value) ? f.value : []).map(toFirestoreValue),
            },
          }
        } else {
          encodedVal = toFirestoreValue(f.value)
        }

        return {
          fieldFilter: {
            field: { fieldPath: f.field },
            op,
            value: encodedVal,
          },
        }
      })

      structuredQuery.where =
        builtFilters.length === 1
          ? builtFilters[0]
          : { compositeFilter: { op: 'AND', filters: builtFilters } }
    }

    if (orders.length > 0) {
      structuredQuery.orderBy = orders.map((o) => ({
        field: { fieldPath: o.field },
        direction: o.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
      }))
    }

    if (typeof limitCount === 'number' && limitCount > 0) {
      structuredQuery.limit = limitCount
    }

    const parentUrlPath =
      parentSegments.length > 0
        ? `/${parentSegments.map((s) => encodeURIComponent(s)).join('/')}`
        : ''

    return {
      parentUrlPath,
      body: {
        parent: parentResource,
        structuredQuery,
      },
    }
  }

  async _runQuery(
    collectionPath: string,
    filters: LocalQueryFilter[],
    orders: LocalQueryOrder[],
    limitCount?: number
  ): Promise<RestQuerySnapshot> {
    const topCollection = collectionPath.split('/')[0]
    const jwt = await resolveCallerJwt()
    const { apiKey, basePath, baseUrl } = getRestConfig(this.projectId, this.databaseId)
    const canReadCloud = Boolean(jwt) || PUBLIC_READ_COLLECTIONS.has(topCollection)

    const localMatched = queryLocalCollection(collectionPath, filters, [], undefined)
    const deletedMap = getLocallyDeletedMap(collectionPath)

    if (canReadCloud && apiKey) {
      const executeRestQuery = async (
        useOrders: LocalQueryOrder[],
        useLimit: number | undefined,
        activeJwt: string | null
      ) => {
        const { parentUrlPath, body } = this.buildStructuredQueryBody(
          collectionPath,
          filters,
          useOrders,
          useLimit,
          basePath
        )
        const url = this.appendApiKey(`${baseUrl}${parentUrlPath}:runQuery`, apiKey)
        return fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(activeJwt),
          body: JSON.stringify(body),
          cache: 'no-store',
        })
      }

      try {
        let res = await executeRestQuery(orders, limitCount, jwt)

        if ((res.status === 401 || res.status === 403) && jwt && PUBLIC_READ_COLLECTIONS.has(topCollection)) {
          res = await executeRestQuery(orders, limitCount, null)
        }

        // Retry without orderBy/limit if composite index is missing (400 FAILED_PRECONDITION)
        if (res.status === 400 && orders.length > 0) {
          res = await executeRestQuery([], undefined, jwt)
          if ((res.status === 401 || res.status === 403) && jwt && PUBLIC_READ_COLLECTIONS.has(topCollection)) {
            res = await executeRestQuery([], undefined, null)
          }
        }

        if (res.ok) {
          const rows = await res.json()
          const mergedMap = new Map<string, { id: string; data: Record<string, any> }>()

          if (Array.isArray(rows)) {
            for (const row of rows) {
              if (!row?.document) continue
              const decoded = decodeFirestoreDocument(row.document)
              if (!decoded.id) continue

              const deletedAtMs = deletedMap[decoded.id]
              if (deletedAtMs && deletedAtMs > decoded.updateTimeMs) {
                continue
              }

              // Double-check filter in case orderBy fallback fetched broader set
              if (filters.every((f) => evaluateFilter(decoded.data, decoded.id, f))) {
                setLocalDoc(collectionPath, decoded.id, decoded.data, {
                  merge: false,
                  cloudSynced: true,
                })
                mergedMap.set(decoded.id, { id: decoded.id, data: decoded.data })
              }
            }
          }

          // Merge any unsynced local records (e.g. created/updated during PIN session)
          for (const localItem of localMatched) {
            if (!localItem.cloudSynced) {
              mergedMap.set(localItem.id, { id: localItem.id, data: localItem.data })
            }
          }

          const finalItems = sortAndLimitDocs(Array.from(mergedMap.values()), orders, limitCount)
          return new RestQuerySnapshot(
            finalItems.map(
              (item) =>
                new RestDocumentSnapshot(
                  new RestDocumentReference(this, collectionPath, item.id),
                  true,
                  item.data
                )
            )
          )
        }
      } catch (err) {
        console.warn(`[FirestoreREST] Query fallback for '${collectionPath}':`, err)
      }
    }

    const sortedLocal = sortAndLimitDocs(localMatched, orders, limitCount)
    return new RestQuerySnapshot(
      sortedLocal.map(
        (item) =>
          new RestDocumentSnapshot(
            new RestDocumentReference(this, collectionPath, item.id),
            true,
            item.data
          )
      )
    )
  }

  private applyOpToLocal(op: QueuedBatchOp, cloudSynced: boolean): void {
    const { ref, mode, data } = op
    if (mode === 'delete') {
      deleteLocalDoc(ref.collectionPath, ref.id, { cloudSynced })
    } else if (mode === 'update') {
      updateLocalDoc(ref.collectionPath, ref.id, data || {}, { cloudSynced })
    } else if (mode === 'merge') {
      setLocalDoc(ref.collectionPath, ref.id, data || {}, { merge: true, cloudSynced })
    } else {
      setLocalDoc(ref.collectionPath, ref.id, data || {}, { merge: false, cloudSynced })
    }
  }

  async _writeDocument(
    ref: RestDocumentReference,
    mode: 'set' | 'merge' | 'update' | 'create' | 'delete',
    data?: Record<string, any>
  ): Promise<void> {
    await this._commitBatch([{ ref, mode, data }])
  }

  async _commitBatch(ops: QueuedBatchOp[]): Promise<void> {
    const jwt = await resolveCallerJwt()
    const { apiKey, basePath, baseUrl } = getRestConfig(this.projectId, this.databaseId)

    const allPublicWritable = ops.every((o) =>
      PUBLIC_WRITE_COLLECTIONS.has(o.ref.collectionPath.split('/')[0])
    )
    const canWriteCloud = (Boolean(jwt) || allPublicWritable) && Boolean(apiKey)

    if (canWriteCloud) {
      const writes = ops.map((op) => {
        const fullDocName = `${basePath}/${op.ref.path}`
        return buildCommitWrite(fullDocName, op.mode, op.data).write
      })

      const commitUrl = this.appendApiKey(`${baseUrl}:commit`, apiKey)
      try {
        let res = await fetch(commitUrl, {
          method: 'POST',
          headers: this.buildHeaders(jwt),
          body: JSON.stringify({ writes }),
          cache: 'no-store',
        })

        // If `update` failed with 400 FAILED_PRECONDITION ("No document to update") or 404 NOT_FOUND
        // because doc was created locally in PIN mode, retry `update` ops as `merge`
        if ((res.status === 404 || res.status === 400) && ops.some((o) => o.mode === 'update')) {
          const retryWrites = ops.map((op) => {
            const fullDocName = `${basePath}/${op.ref.path}`
            const retryMode = op.mode === 'update' ? 'merge' : op.mode
            return buildCommitWrite(fullDocName, retryMode, op.data).write
          })
          res = await fetch(commitUrl, {
            method: 'POST',
            headers: this.buildHeaders(jwt),
            body: JSON.stringify({ writes: retryWrites }),
            cache: 'no-store',
          })
        }

        if (res.ok) {
          for (const op of ops) {
            this.applyOpToLocal(op, true)
          }
          return
        } else {
          const errText = await res.text().catch(() => '')
          console.warn(
            `[FirestoreREST] Commit returned HTTP ${res.status}, persisting locally:`,
            errText.slice(0, 300)
          )
        }
      } catch (err) {
        console.warn('[FirestoreREST] Commit network warning, persisting locally:', err)
      }
    }

    for (const op of ops) {
      this.applyOpToLocal(op, false)
    }
  }
}

const adapterCache = new Map<string, FirestoreRestAdapter>()

export function getFirestoreRestAdapter(projectId: string, databaseId?: string): FirestoreRestAdapter {
  const key = `${projectId}::${databaseId || '(default)'}`
  let instance = adapterCache.get(key)
  if (!instance) {
    instance = new FirestoreRestAdapter(projectId, databaseId)
    adapterCache.set(key, instance)
  }
  return instance
}
