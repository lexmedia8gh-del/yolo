import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, query, where, getDocs, doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, fileId } = body

    if (!token || !fileId) {
      return NextResponse.json({ error: 'Missing token or fileId' }, { status: 400 })
    }

    let deliveryData: any = null
    let deliveryId = ''
    let fileData: any = null
    let adminUsed = false

    try {
      const adminDb = getAdminDb()
      const deliveriesSnap = await adminDb
        .collection(COLLECTIONS.DELIVERIES)
        .where('accessToken', '==', token)
        .limit(1)
        .get()

      if (!deliveriesSnap.empty) {
        adminUsed = true
        const deliveryDoc = deliveriesSnap.docs[0]
        deliveryData = deliveryDoc.data()
        deliveryId = deliveryDoc.id

        const fileDocRef = adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId)
        const fileSnap = await fileDocRef.get()

        if (fileSnap.exists) {
          fileData = fileSnap.data()
          // Update file count
          try {
            await fileDocRef.update({
              downloadCount: FieldValue.increment(1),
              lastDownloadedAt: FieldValue.serverTimestamp(),
            })
            await deliveryDoc.ref.update({
              status: 'Downloaded',
              updatedAt: FieldValue.serverTimestamp(),
            })
          } catch {}
        }
      }
    } catch {
      // Admin SDK not available
    }

    // Fallback if Admin DB was not used
    if (!deliveryData || !fileData) {
      const deliveriesRef = collection(db, COLLECTIONS.DELIVERIES)
      const q = query(deliveriesRef, where('accessToken', '==', token))
      const snap = await getDocs(q)

      if (snap.empty) {
        return NextResponse.json({ error: 'Invalid delivery token' }, { status: 404 })
      }

      const deliveryDoc = snap.docs[0]
      deliveryData = deliveryDoc.data()
      deliveryId = deliveryDoc.id

      const fileDocRef = doc(db, COLLECTIONS.DELIVERY_FILES, fileId)
      const fileSnap = await getDoc(fileDocRef)

      if (!fileSnap.exists()) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      fileData = fileSnap.data()
      try {
        await updateDoc(fileDocRef, {
          downloadCount: increment(1),
          lastDownloadedAt: serverTimestamp(),
        })
        await updateDoc(doc(db, COLLECTIONS.DELIVERIES, deliveryId), {
          status: 'Downloaded',
          updatedAt: serverTimestamp(),
        })
      } catch {}
    }

    if (fileData?.deliveryId !== deliveryId) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    const downloadUrl = fileData.downloadUrl || `/api/files?id=${fileId}`

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: fileData.fileName || fileData.originalName || 'file',
    })
  } catch (error: any) {
    console.error('Error in POST /api/delivery/download:', error)
    return NextResponse.json(
      { error: 'Unable to download this delivery file. The file may no longer be available.' },
      { status: 500 }
    )
  }
}
