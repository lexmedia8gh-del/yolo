import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

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
          await fileDocRef.delete()
        }
      }
    } catch {
      // Admin DB not available
    }

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
        await deleteDoc(fileDocRef)
      }
    }

    if (!fileData) {
      return NextResponse.json({ error: 'File already deleted or not found' }, { status: 404 })
    }

    if (fileData?.deliveryId !== deliveryId) {
      return NextResponse.json({ error: 'File does not belong to this delivery' }, { status: 403 })
    }

    const storagePath = fileData?.storagePath

    // 1. Delete from local server disk
    if (storagePath) {
      try {
        const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)
        if (fs.existsSync(localFilePath)) {
          await fs.promises.unlink(localFilePath)
        }
      } catch (err) {
        console.warn('Failed to delete local file copy:', err)
      }

      // 2. Delete from Supabase Storage
      try {
        const supabase = getSupabaseServerClient()
        const { error: supabaseError } = await supabase.storage
          .from('Delivery files')
          .remove([storagePath])
        if (supabaseError) {
          console.warn('Failed to delete Supabase file:', supabaseError.message)
        }
      } catch (err) {
        console.warn('Failed to delete Supabase file copy:', err)
      }
    }

    // 3. Create Admin Notification and Activity Log upon successful and verified download confirmation
    try {
      const clientName = deliveryData.clientName || 'Client'
      const clientId = deliveryData.clientId || ''
      const fileName = fileData.name || 'a file'

      const now = new Date()
      const formattedDate = now.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }) + ' at ' + now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })

      const adminDb = getAdminDb()
      if (adminDb) {
        // Create Admin Notification
        await adminDb.collection(COLLECTIONS.NOTIFICATIONS).add({
          type: 'delivery_download',
          title: 'File Downloaded',
          message: `${clientName} successfully downloaded ${fileName}`,
          isRead: false,
          read: false,
          clientId,
          clientName,
          deliveryId,
          fileName,
          createdAt: FieldValue.serverTimestamp(),
          metadata: {
            fileId,
            downloadDate: now.toISOString(),
          },
        })

        // Create Activity Log
        await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
          event: 'file_downloaded',
          description: `${clientName} successfully downloaded ${fileName} on ${formattedDate}.`,
          createdAt: FieldValue.serverTimestamp(),
          performedByName: clientName,
          clientId,
          deliveryId,
          metadata: {
            fileId,
            fileName,
          },
        })
      }
    } catch (logErr) {
      console.error('Failed to create download notification or activity log:', logErr)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in confirm-download:', error)
    return NextResponse.json({ error: 'Failed to confirm download and delete file' }, { status: 500 })
  }
}
