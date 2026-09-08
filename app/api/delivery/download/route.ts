import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, fileId } = body

    if (!token || !fileId) {
      return NextResponse.json({ error: 'Missing token or fileId' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // Validate delivery by token
    const deliveriesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('accessToken', '==', token)
      .limit(1)
      .get()

    if (deliveriesSnap.empty) {
      return NextResponse.json({ error: 'Invalid delivery token' }, { status: 404 })
    }

    const deliveryDoc = deliveriesSnap.docs[0]
    const deliveryData = deliveryDoc.data()
    const deliveryId = deliveryDoc.id

    // Check expiration
    if (deliveryData.expiresAt) {
      const expiresDate = (deliveryData.expiresAt as Timestamp).toDate()
      if (expiresDate.getTime() < Date.now()) {
        return NextResponse.json({ error: 'This delivery link has expired.' }, { status: 410 })
      }
    }

    // Check payment lock
    if (deliveryData.requiresFullPayment && !deliveryData.isReleased && deliveryData.invoiceId) {
      const invoiceSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryData.invoiceId).get()
      if (invoiceSnap.exists && invoiceSnap.data()?.status !== 'Paid') {
        return NextResponse.json({ error: 'Payment required to download files.' }, { status: 403 })
      }
    }

    // Fetch file document
    const fileDocRef = adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId)
    const fileSnap = await fileDocRef.get()

    if (!fileSnap.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const fileData = fileSnap.data()
    if (fileData?.deliveryId !== deliveryId) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    // Increment download count and update timestamp
    await fileDocRef.update({
      downloadCount: FieldValue.increment(1),
      lastDownloadedAt: FieldValue.serverTimestamp(),
    })

    // Update delivery status to 'Downloaded'
    await deliveryDoc.ref.update({
      status: 'Downloaded',
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Log download activity
    await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
      event: 'delivery_file_downloaded',
      description: `Client downloaded file: ${fileData.fileName || fileData.originalName}`,
      clientId: deliveryData.clientId,
      entityId: fileId,
      entityType: 'deliveryFile',
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      downloadUrl: fileData.downloadUrl,
      fileName: fileData.fileName || fileData.originalName,
    })
  } catch (error: any) {
    console.error('Error in POST /api/delivery/download:', error)
    return NextResponse.json({ error: 'Failed to process file download' }, { status: 500 })
  }
}
