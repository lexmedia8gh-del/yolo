import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import type { PreviewStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    try {
      const adminDb = getAdminDb()
      const snap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
      if (!snap.exists) {
        return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, preview: { id: snap.id, ...snap.data() } })
    } catch {
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
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id
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

    try {
      const adminDb = getAdminDb()
      await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).update(updatePayload)
      const snap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
      return NextResponse.json({ success: true, preview: { id: snap.id, ...snap.data() } })
    } catch {
      const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, id)
      const clientPayload: any = {}
      if (status) clientPayload.status = status
      if (status === 'Revoked') clientPayload.revokedReason = revokedReason || 'Access revoked'
      await updateDoc(docRef, clientPayload)
      const snap = await getDoc(docRef)
      return NextResponse.json({ success: true, preview: { id: snap.id, ...snap.data() } })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update preview' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    try {
      const adminDb = getAdminDb()
      await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).delete()
    } catch {
      const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, id)
      await deleteDoc(docRef)
    }

    return NextResponse.json({ success: true, message: 'Preview deleted' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete preview' }, { status: 500 })
  }
}
