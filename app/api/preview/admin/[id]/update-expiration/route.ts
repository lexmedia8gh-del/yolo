import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import type { PreviewExpirationOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

function calculateExpiration(option: PreviewExpirationOption, customDate?: string): AdminTimestamp | null {
  const now = Date.now()
  if (option === 'never') return null
  if (option === '1_hour') return AdminTimestamp.fromMillis(now + 60 * 60 * 1000)
  if (option === '24_hours') return AdminTimestamp.fromMillis(now + 24 * 60 * 60 * 1000)
  if (option === '3_days') return AdminTimestamp.fromMillis(now + 3 * 24 * 60 * 60 * 1000)
  if (option === '7_days') return AdminTimestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000)
  if (option === 'custom' && customDate) {
    const millis = new Date(customDate).getTime()
    return isNaN(millis) ? null : AdminTimestamp.fromMillis(millis)
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id
    if (!id) {
      return NextResponse.json({ error: 'Preview ID is required' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const { expirationOption = '7_days', customExpirationDate } = body

    const expiresAt = calculateExpiration(expirationOption as PreviewExpirationOption, customExpirationDate)

    try {
      const adminDb = getAdminDb()
      await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).update({
        expirationOption,
        expiresAt,
        status: 'Active',
        updatedAt: FieldValue.serverTimestamp(),
      })

      const snap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
      return NextResponse.json({
        success: true,
        preview: { id, ...snap.data() },
      })
    } catch {
      // Client SDK fallback
      const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, id)
      await updateDoc(docRef, {
        expirationOption,
        expiresAt: expiresAt ? expiresAt.toDate() : null,
        status: 'Active',
      })
      const snap = await getDoc(docRef)
      return NextResponse.json({
        success: true,
        preview: { id, ...snap.data() },
      })
    }
  } catch (err: any) {
    console.error('[Update Preview Expiration Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to update preview expiration' },
      { status: 500 }
    )
  }
}
