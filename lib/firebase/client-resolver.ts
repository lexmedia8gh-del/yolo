import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore'

const INVALID_ID_TOKENS = new Set(['', 'undefined', 'null', 'nan', 'new', 'none'])

/**
 * Safely normalizes a Firestore document identifier without mutating valid
 * case-sensitive Firestore document IDs.
 * - Trims leading/trailing whitespace and accidental wrapping quotes
 * - Extracts the trailing document ID if a collection/document path was stored
 *   (e.g. "clients/abc123" or "projects/.../documents/clients/abc123")
 * - Rejects placeholder tokens ("undefined", "null", "new", etc.) and invalid path segments
 */
export function normalizeEntityId(raw: unknown, expectedCollection?: string): string {
  if (typeof raw !== 'string') return ''

  let value = raw.trim()
  if (!value) return ''

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  if (!value || INVALID_ID_TOKENS.has(value.toLowerCase())) {
    return ''
  }

  if (value.includes('..')) {
    return ''
  }

  // Handle full or relative Firestore document paths (e.g. "clients/docId")
  if (value.includes('/')) {
    const cleanSegments = value
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)

    if (cleanSegments.length >= 2) {
      const parentCol = cleanSegments[cleanSegments.length - 2]
      const leafId = cleanSegments[cleanSegments.length - 1]
      if (!expectedCollection || parentCol === expectedCollection) {
        if (leafId && !INVALID_ID_TOKENS.has(leafId.toLowerCase())) {
          return leafId
        }
      }
    }
    return ''
  }

  if (value.length > 256) {
    return ''
  }

  return value
}

export interface ResolveClientOptions {
  clientsCollection?: string
  /** Primary client identifier sent by the payment form / caller */
  clientId?: unknown
  /** Client ID stored on the linked project document, if any */
  projectClientId?: unknown
  /** Client ID stored on the linked invoice document, if any */
  invoiceClientId?: unknown
  /** Email stored on the linked invoice or project (used only when clientId is omitted/legacy) */
  linkedClientEmail?: unknown
  /** Full name stored on the linked invoice or project (used only when clientId is omitted/legacy) */
  linkedClientName?: unknown
}

export interface ResolvedClientRecord {
  id: string
  ref: DocumentReference<DocumentData>
  data: DocumentData
  matchedBy:
    | 'doc_id'
    | 'legacy_id_field'
    | 'legacy_clientId_field'
    | 'legacy_email_as_id'
    | 'legacy_name_as_id'
    | 'linked_entity_doc_id'
    | 'linked_entity_legacy_field'
    | 'linked_entity_email'
    | 'linked_entity_name'
}

async function lookupClientByIdOrLegacyFields(
  adminDb: Firestore,
  clientsCol: string,
  candidateId: string
): Promise<{
  id: string
  ref: DocumentReference<DocumentData>
  data: DocumentData
  source: 'doc_id' | 'legacy_id_field' | 'legacy_clientId_field'
} | null> {
  if (!candidateId) return null

  const colRef = adminDb.collection(clientsCol)

  // 1. Direct canonical document lookup: O(1)
  const directRef = colRef.doc(candidateId)
  const directSnap = await directRef.get()
  if (directSnap.exists) {
    return {
      id: directSnap.id,
      ref: directRef,
      data: directSnap.data() || {},
      source: 'doc_id',
    }
  }

  // 2. Legacy records where a custom 'id', 'clientId', or 'legacyId' field differs from doc.id
  for (const fieldName of ['id', 'clientId', 'legacyId'] as const) {
    const snap = await colRef.where(fieldName, '==', candidateId).limit(2).get()
    if (snap.size === 1) {
      const docSnap = snap.docs[0]
      return {
        id: docSnap.id,
        ref: docSnap.ref,
        data: docSnap.data() || {},
        source: fieldName === 'id' ? 'legacy_id_field' : 'legacy_clientId_field',
      }
    }
  }

  return null
}

async function lookupUniqueClientByEmail(
  adminDb: Firestore,
  clientsCol: string,
  rawEmail: string
): Promise<{ id: string; ref: DocumentReference<DocumentData>; data: DocumentData } | null> {
  const trimmed = rawEmail.trim()
  if (!trimmed || !trimmed.includes('@')) return null

  const colRef = adminDb.collection(clientsCol)
  const lower = trimmed.toLowerCase()

  const lowerSnap = await colRef.where('email', '==', lower).limit(2).get()
  if (lowerSnap.size === 1) {
    const d = lowerSnap.docs[0]
    return { id: d.id, ref: d.ref, data: d.data() || {} }
  }
  if (lowerSnap.size > 1) return null

  if (trimmed !== lower) {
    const exactSnap = await colRef.where('email', '==', trimmed).limit(2).get()
    if (exactSnap.size === 1) {
      const d = exactSnap.docs[0]
      return { id: d.id, ref: d.ref, data: d.data() || {} }
    }
  }

  return null
}

async function lookupUniqueClientByFullName(
  adminDb: Firestore,
  clientsCol: string,
  rawName: string
): Promise<{ id: string; ref: DocumentReference<DocumentData>; data: DocumentData } | null> {
  const trimmed = rawName.trim()
  if (!trimmed) return null

  const colRef = adminDb.collection(clientsCol)
  const snap = await colRef.where('fullName', '==', trimmed).limit(2).get()
  if (snap.size === 1) {
    const d = snap.docs[0]
    return { id: d.id, ref: d.ref, data: d.data() || {} }
  }

  return null
}

/**
 * Resolves a client using the canonical Firestore document ID first, with safe
 * and unambiguous fallbacks for legacy records.
 *
 * IMPORTANT SAFETY GUARANTEES:
 * - Never creates duplicate or placeholder client records.
 * - If an explicit `clientId` is supplied and does NOT resolve to any existing
 *   client record (by doc ID, legacy ID field, or legacy name/email stored in `clientId`),
 *   this function returns `null` so the caller returns a clear 404 error without
 *   recording an orphaned payment.
 */
export async function resolveCanonicalClient(
  adminDb: Firestore,
  options: ResolveClientOptions
): Promise<ResolvedClientRecord | null> {
  const clientsCol = options.clientsCollection || 'clients'
  const rawClientStr = typeof options.clientId === 'string' ? options.clientId.trim() : ''
  const normalizedClientId = normalizeEntityId(options.clientId, clientsCol)

  // ── CASE A: Caller explicitly provided a clientId ──────────────────────────
  if (normalizedClientId) {
    const byId = await lookupClientByIdOrLegacyFields(adminDb, clientsCol, normalizedClientId)
    if (byId) {
      return {
        id: byId.id,
        ref: byId.ref,
        data: byId.data,
        matchedBy: byId.source,
      }
    }

    // Legacy bug check: caller passed client's email address inside `clientId`
    if (rawClientStr.includes('@')) {
      const byEmail = await lookupUniqueClientByEmail(adminDb, clientsCol, rawClientStr)
      if (byEmail) {
        return {
          ...byEmail,
          matchedBy: 'legacy_email_as_id',
        }
      }
    }

    // Legacy bug check: caller passed client's exact fullName inside `clientId`
    const byName = await lookupUniqueClientByFullName(adminDb, clientsCol, rawClientStr)
    if (byName) {
      return {
        ...byName,
        matchedBy: 'legacy_name_as_id',
      }
    }

    // Explicit clientId did not match any existing client record -> fail cleanly (no false fallback)
    return null
  }

  // ── CASE B: clientId was empty/placeholder (e.g. recording payment directly from an invoice/project) ──
  const candidateLinkedIds = Array.from(
    new Set(
      [
        normalizeEntityId(options.projectClientId, clientsCol),
        normalizeEntityId(options.invoiceClientId, clientsCol),
      ].filter(Boolean)
    )
  )

  for (const linkedId of candidateLinkedIds) {
    const byLinkedId = await lookupClientByIdOrLegacyFields(adminDb, clientsCol, linkedId)
    if (byLinkedId) {
      return {
        id: byLinkedId.id,
        ref: byLinkedId.ref,
        data: byLinkedId.data,
        matchedBy:
          byLinkedId.source === 'doc_id' ? 'linked_entity_doc_id' : 'linked_entity_legacy_field',
      }
    }
  }

  // Unambiguous email match from the linked invoice/project document
  const linkedEmail = typeof options.linkedClientEmail === 'string' ? options.linkedClientEmail.trim() : ''
  if (linkedEmail) {
    const byEmail = await lookupUniqueClientByEmail(adminDb, clientsCol, linkedEmail)
    if (byEmail) {
      return {
        ...byEmail,
        matchedBy: 'linked_entity_email',
      }
    }
  }

  // Unambiguous exact fullName match from the linked invoice/project document
  const linkedName = typeof options.linkedClientName === 'string' ? options.linkedClientName.trim() : ''
  if (linkedName) {
    const byName = await lookupUniqueClientByFullName(adminDb, clientsCol, linkedName)
    if (byName) {
      return {
        ...byName,
        matchedBy: 'linked_entity_name',
      }
    }
  }

  return null
}
