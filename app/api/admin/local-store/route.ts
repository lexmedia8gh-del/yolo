import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import {
  clearLocalCollection,
  dehydrateForJsonResponse,
  deleteLocalDoc,
  getLocalDocHydrated,
  listAllLocalDocsJson,
  setLocalDoc,
  updateLocalDoc,
} from '@/lib/firebase/local-server-store'

export const dynamic = 'force-dynamic'

function sanitizeCollection(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return ''
  const clean = raw.trim().replace(/^\/+|\/+$/g, '')
  if (!clean || clean.includes('..') || !/^[a-zA-Z0-9_/-]+$/.test(clean)) return ''
  return clean
}

function sanitizeDocId(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return ''
  const clean = raw.trim()
  if (!clean || clean.includes('/') || clean.includes('..') || clean.length > 256) return ''
  return clean
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { searchParams } = new URL(req.url)
  const col = sanitizeCollection(searchParams.get('collection'))
  const docId = sanitizeDocId(searchParams.get('id'))

  if (!col) {
    return NextResponse.json({ error: 'Invalid collection name.' }, { status: 400 })
  }

  if (docId) {
    const found = getLocalDocHydrated(col, docId)
    if (!found.exists || !found.data) {
      return NextResponse.json({ ok: true, doc: null })
    }
    return NextResponse.json({
      ok: true,
      doc: { ...dehydrateForJsonResponse(found.data), id: docId },
    })
  }

  const docs = listAllLocalDocsJson(col)
  return NextResponse.json({ ok: true, docs })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json()
    const action = String(body?.action || '')
    const col = sanitizeCollection(body?.collection)
    const cloudSynced = Boolean(body?.cloudSynced)

    if (action === 'batch' && Array.isArray(body?.operations)) {
      for (const op of body.operations) {
        const opCol = sanitizeCollection(op?.collection)
        const opId = sanitizeDocId(op?.id)
        if (!opCol || !opId) continue
        if (op.type === 'delete') {
          deleteLocalDoc(opCol, opId, { cloudSynced: Boolean(op.cloudSynced) })
        } else if (op.type === 'update') {
          updateLocalDoc(opCol, opId, op.data || {}, { cloudSynced: Boolean(op.cloudSynced) })
        } else {
          setLocalDoc(opCol, opId, op.data || {}, {
            merge: Boolean(op.merge),
            cloudSynced: Boolean(op.cloudSynced),
          })
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (!col) {
      return NextResponse.json({ error: 'Invalid collection name.' }, { status: 400 })
    }

    if (action === 'clearCollection') {
      const deleted = clearLocalCollection(col)
      return NextResponse.json({ ok: true, deleted })
    }

    if (action === 'syncCollection' && Array.isArray(body?.docs)) {
      const defaultCloudSynced = body?.cloudSynced !== undefined ? Boolean(body.cloudSynced) : true
      for (const item of body.docs) {
        const itemId = sanitizeDocId(item?.id)
        if (!itemId) continue
        const { id: _ignored, ...rest } = item
        setLocalDoc(col, itemId, rest, { merge: true, cloudSynced: defaultCloudSynced })
      }
      return NextResponse.json({ ok: true })
    }

    const docId = sanitizeDocId(body?.id)
    if (!docId) {
      return NextResponse.json({ error: 'Invalid document ID.' }, { status: 400 })
    }

    if (action === 'set' || action === 'add') {
      const data = body?.data && typeof body.data === 'object' ? body.data : {}
      const saved = setLocalDoc(col, docId, data, {
        merge: Boolean(body?.merge),
        cloudSynced,
      })
      return NextResponse.json({
        ok: true,
        id: docId,
        doc: { ...dehydrateForJsonResponse(saved), id: docId },
      })
    }

    if (action === 'update') {
      const data = body?.data && typeof body.data === 'object' ? body.data : {}
      const updated = updateLocalDoc(col, docId, data, { cloudSynced })
      return NextResponse.json({
        ok: true,
        id: docId,
        doc: { ...dehydrateForJsonResponse(updated), id: docId },
      })
    }

    if (action === 'delete') {
      deleteLocalDoc(col, docId, { cloudSynced })
      return NextResponse.json({ ok: true, id: docId })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (err: any) {
    console.error('[LocalStore API Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to process local store operation.' },
      { status: 500 }
    )
  }
}
