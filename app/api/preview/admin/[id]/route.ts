import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db, isFirebaseConfigured } from '@/lib/firebase/config'
import { doc, getDoc } from 'firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import type { PreviewStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const id = resolvedParams?.id
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    try {
      const adminDb = getAdminDb()
      const snap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
      if (!snap.exists) {
        return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, preview: { id: snap.id, ...snap.data() } })
    } catch {
      if (!isFirebaseConfigured) {
        return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
      }
      const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, id)
      const snap = await getDoc(docRef)
      if (!snap.exists()) {
        return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, preview: { id: snap.id, ...snap.data() } })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch preview' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const id = resolvedParams?.id
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const { status, revokedReason } = body

    const updatePayload: any = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (status) {
      updatePayload.status = status as PreviewStatus
      if (status === 'Revoked') {
        updatePayload.revokedAt = FieldValue.serverTimestamp()
        updatePayload.revokedReason = revokedReason || 'Access revoked by studio admin'
      } else if (status === 'Active') {
        updatePayload.revokedAt = null
        updatePayload.revokedReason = ''
      }
    }

    const adminDb = getAdminDb()
    await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).set(updatePayload, { merge: true })
    const snap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
    return NextResponse.json({ success: true, preview: { id: snap.id, ...(snap.data() || updatePayload) } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update preview' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const id = resolvedParams?.id
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const adminDb = getAdminDb()
    await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).delete()

    return NextResponse.json({ success: true, message: 'Preview deleted' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete preview' }, { status: 500 })
  }
}
