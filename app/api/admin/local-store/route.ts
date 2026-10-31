import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, hasAdminCredentials, requireAdmin } from '@/lib/firebase/admin'
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

function hasDirectCloudAccess(req: NextRequest): boolean {
  if (hasAdminCredentials() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return true
  }
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  const cookieToken = req.cookies.get('__session')?.value?.trim() || ''
  const token = bearer || cookieToken
  return Boolean(token && token !== 'active-admin-session' && token.split('.').length === 3)
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const { searchParams } = new URL(req.url)
  const col = sanitizeCollection(searchParams.get('collection') || searchParams.get('collectionName'))
  const docId = sanitizeDocId(searchParams.get('id') || searchParams.get('docId'))

  if (!col) {
    return NextResponse.json({ error: 'Invalid collection name.' }, { status: 400 })
  }

  const isDirectAdminSdk = hasAdminCredentials() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)

  // First try fetching directly from Cloud Firestore when cloud credentials or user JWT are present
  if (hasDirectCloudAccess(req)) {
    try {
      const adminDb = getAdminDb()
      if (docId) {
        const snap = await adminDb.collection(col).doc(docId).get()
        if (snap.exists) {
          const data = snap.data() || {}
          if (isDirectAdminSdk) {
            setLocalDoc(col, docId, data, { merge: true, cloudSynced: true })
          }
          return NextResponse.json({
            ok: true,
            doc: { ...dehydrateForJsonResponse(data), id: docId },
          })
        }
      } else {
        const colSnap = await adminDb.collection(col).get()
        if (!colSnap.empty) {
          const cloudDocs: any[] = []
          colSnap.forEach((d) => {
            const data = d.data() || {}
            if (isDirectAdminSdk) {
              setLocalDoc(col, d.id, data, { merge: true, cloudSynced: true })
            }
            cloudDocs.push({ ...dehydrateForJsonResponse(data), id: d.id })
          })
          return NextResponse.json({ ok: true, docs: cloudDocs })
        }
      }
    } catch (err) {
      console.warn(`[LocalStore API] Cloud Firestore query fallback for ${col}:`, err)
    }
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
    const col = sanitizeCollection(body?.collection || body?.collectionName)
    const cloudSynced = Boolean(body?.cloudSynced)
    const canMirrorCloud = hasDirectCloudAccess(req)
    const adminDb = canMirrorCloud ? getAdminDb() : null

    if (action === 'batch' && Array.isArray(body?.operations)) {
      for (const op of body.operations) {
        const opCol = sanitizeCollection(op?.collection || op?.collectionName)
        const opId = sanitizeDocId(op?.id || op?.docId)
        if (!opCol || !opId) continue
        if (op.type === 'delete') {
          deleteLocalDoc(opCol, opId, { cloudSynced: Boolean(op.cloudSynced) })
          if (adminDb) {
            try { await adminDb.collection(opCol).doc(opId).delete() } catch {}
          }
        } else if (op.type === 'update') {
          const updated = updateLocalDoc(opCol, opId, op.data || {}, { cloudSynced: Boolean(op.cloudSynced) })
          if (adminDb) {
            try { await adminDb.collection(opCol).doc(opId).set(updated, { merge: true }) } catch {}
          }
        } else {
          const saved = setLocalDoc(opCol, opId, op.data || {}, {
            merge: Boolean(op.merge),
            cloudSynced: Boolean(op.cloudSynced),
          })
          if (adminDb) {
            try { await adminDb.collection(opCol).doc(opId).set(saved, { merge: Boolean(op.merge) }) } catch {}
          }
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
        const itemId = sanitizeDocId(item?.id || item?.docId)
        if (!itemId) continue
        const { id: _ignored, ...rest } = item
        const saved = setLocalDoc(col, itemId, rest, { merge: true, cloudSynced: defaultCloudSynced })
        if (adminDb && !defaultCloudSynced) {
          try { await adminDb.collection(col).doc(itemId).set(saved, { merge: true }) } catch {}
        }
      }
      return NextResponse.json({ ok: true })
    }

    const docId = sanitizeDocId(body?.id || body?.docId)
    if (!docId) {
      return NextResponse.json({ error: 'Invalid document ID.' }, { status: 400 })
    }

    if (action === 'set' || action === 'add') {
      const data = body?.data && typeof body.data === 'object' ? body.data : {}
      const saved = setLocalDoc(col, docId, data, {
        merge: Boolean(body?.merge),
        cloudSynced,
      })
      if (adminDb && !cloudSynced) {
        try {
          await adminDb.collection(col).doc(docId).set(saved, { merge: Boolean(body?.merge) })
        } catch (e) {
          console.warn(`[LocalStore API] Failed to mirror set to Cloud Firestore for ${col}/${docId}:`, e)
        }
      }
      return NextResponse.json({
        ok: true,
        id: docId,
        doc: { ...dehydrateForJsonResponse(saved), id: docId },
      })
    }

    if (action === 'update') {
      const data = body?.data && typeof body.data === 'object' ? body.data : {}
      const updated = updateLocalDoc(col, docId, data, { cloudSynced })
      if (adminDb && !cloudSynced) {
        try {
          await adminDb.collection(col).doc(docId).set(updated, { merge: true })
        } catch (e) {
          console.warn(`[LocalStore API] Failed to mirror update to Cloud Firestore for ${col}/${docId}:`, e)
        }
      }
      return NextResponse.json({
        ok: true,
        id: docId,
        doc: { ...dehydrateForJsonResponse(updated), id: docId },
      })
    }

    if (action === 'delete') {
      deleteLocalDoc(col, docId, { cloudSynced })
      if (adminDb && !cloudSynced) {
        try {
          await adminDb.collection(col).doc(docId).delete()
        } catch (e) {
          console.warn(`[LocalStore API] Failed to mirror delete to Cloud Firestore for ${col}/${docId}:`, e)
        }
      }
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
