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
        } else if (Array.isArray(deliveryData.files)) {
          const matchedFile = deliveryData.files.find((f: any) => f.id === fileId)
          if (matchedFile) {
            fileData = {
              id: matchedFile.id,
              deliveryId,
              quickJobId: deliveryData.quickJobId,
              fileName: matchedFile.name || matchedFile.fileName || 'file',
              originalName: matchedFile.name || matchedFile.originalName || 'file',
              downloadUrl: matchedFile.url || matchedFile.downloadUrl || '',
              storagePath: matchedFile.path || matchedFile.storagePath || '',
              fileSize: matchedFile.size || matchedFile.fileSize || 0,
              fileType: matchedFile.fileType || 'application/octet-stream',
            }
          }
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

      if (fileSnap.exists()) {
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
      } else if (Array.isArray(deliveryData.files)) {
        const matchedFile = deliveryData.files.find((f: any) => f.id === fileId)
        if (matchedFile) {
          fileData = {
            id: matchedFile.id,
            deliveryId,
            quickJobId: deliveryData.quickJobId,
            fileName: matchedFile.name || matchedFile.fileName || 'file',
            originalName: matchedFile.name || matchedFile.originalName || 'file',
            downloadUrl: matchedFile.url || matchedFile.downloadUrl || '',
            storagePath: matchedFile.path || matchedFile.storagePath || '',
            fileSize: matchedFile.size || matchedFile.fileSize || 0,
            fileType: matchedFile.fileType || 'application/octet-stream',
          }
        }
      }
    }

    if (!fileData) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Check expiration
    if (deliveryData.expiresAt) {
      let expiresDate: Date
      if (
        deliveryData.expiresAt instanceof Timestamp
      ) {
        expiresDate = deliveryData.expiresAt.toDate()
      } else if (deliveryData.expiresAt?.seconds) {
        expiresDate = new Date(deliveryData.expiresAt.seconds * 1000)
      } else {
        expiresDate = new Date(deliveryData.expiresAt)
      }
      if (expiresDate.getTime() < Date.now()) {
        return NextResponse.json(
          { error: 'This delivery link has expired. Please contact LexMedia for a new link.', isExpired: true },
          { status: 410 }
        )
      }
    }

    // Security Gate: Check payment lock before returning download URL
    if (deliveryData.requiresFullPayment && !deliveryData.isReleased) {
      let remainingBalance = 1
      try {
        const adminDb = getAdminDb()
        if (deliveryData.invoiceId) {
          const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryData.invoiceId).get()
          if (invSnap.exists) {
            const inv = invSnap.data()!
            remainingBalance = inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, (inv.total || 0) - (inv.amountPaid || 0))
          }
        } else if (deliveryData.quickJobId) {
          const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(deliveryData.quickJobId).get()
          if (qjSnap.exists) {
            const qj = qjSnap.data()!
            remainingBalance = qj.outstandingBalance !== undefined ? qj.outstandingBalance : Math.max(0, (qj.originalAgreedPrice || 0) - (qj.amountPaid || 0))
          }
        } else if (deliveryData.projectId) {
          const projSnap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(deliveryData.projectId).get()
          if (projSnap.exists) {
            const proj = projSnap.data()!
            remainingBalance = proj.outstandingBalance !== undefined ? proj.outstandingBalance : Math.max(0, (proj.price || 0) - (proj.amountPaid || 0))
          }
        }
      } catch (checkErr) {
        console.warn('[Download] Payment verification error:', checkErr)
      }

      if (remainingBalance > 0) {
        return NextResponse.json(
          {
            error: 'Deliverables are locked. Please complete the remaining payment to download files.',
            isLocked: true,
          },
          { status: 403 }
        )
      }
    }

    // Verify ownership
    const isMatchingDelivery =
      fileData.deliveryId === deliveryId ||
      (fileData.quickJobId && fileData.quickJobId === deliveryData.quickJobId) ||
      (Array.isArray(deliveryData.files) && deliveryData.files.some((f: any) => f.id === fileId || f.path === fileData.storagePath))

    if (!isMatchingDelivery) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    // Clean and normalize download URL to route through streaming API endpoint
    const downloadUrl = `/api/files?id=${fileId}`

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
