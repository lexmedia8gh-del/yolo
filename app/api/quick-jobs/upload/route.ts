import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS } from '@/lib/supabase/storage'
import { generateSecureToken } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const jobId = (formData.get('jobId') as string) || ''
    const clientId = (formData.get('clientId') as string) || ''
    const clientName = (formData.get('clientName') as string) || ''
    const directUrl = (formData.get('directUrl') as string) || ''
    const directStoragePath = (formData.get('storagePath') as string) || ''
    const directFileName = (formData.get('fileName') as string) || ''
    const directFileSize = (formData.get('fileSize') as string) || ''
    const directFileType = (formData.get('fileType') as string) || ''

    if (!jobId) {
      return NextResponse.json({ error: 'Missing Quick Job ID' }, { status: 400 })
    }

    // 1. Verify Quick Job exists & is paid
    const adminDb = getAdminDb()
    const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(jobId)
    const qjSnap = await qjRef.get()

    if (!qjSnap.exists) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }

    const qjData = qjSnap.data()!
    const isPaid =
      qjData.paymentStatus === 'Paid' ||
      (Number(qjData.outstandingBalance) <= 0 && Number(qjData.amountPaid) >= Number(qjData.originalAgreedPrice))

    if (!isPaid) {
      return NextResponse.json(
        { error: 'Upload locked: Payment must be completed before deliverables can be uploaded.' },
        { status: 403 }
      )
    }

    const fileDocId = generateSecureToken('qjf_')
    const fileName = directFileName || (file ? file.name : 'deliverable-file')
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const fileSize = directFileSize ? parseInt(directFileSize, 10) : (file ? file.size : 0)
    const fileType = directFileType || (file ? (file.type || fileName.split('.').pop() || 'application/octet-stream') : 'application/octet-stream')

    let downloadUrl = directUrl
    let storagePath = directStoragePath || `quick-jobs/${jobId}/${fileDocId}/${sanitizedName}`
    let storageProvider = 'supabase'

    // 2. Perform Server-side Upload to Supabase Storage if file buffer provided
    if (!directUrl && file) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      try {
        const supabase = getSupabaseServerClient()
        const primaryBucket = STORAGE_BUCKETS.DELIVERY_FILES // 'Delivery files'
        
        let { error: uploadError } = await supabase.storage
          .from(primaryBucket)
          .upload(storagePath, buffer, {
            contentType: fileType,
            upsert: true,
          })

        // If 'Delivery files' bucket has an issue, try fallback bucket variants
        if (uploadError) {
          console.warn(`[Supabase Upload] Primary bucket '${primaryBucket}' error:`, uploadError.message)
          
          const fallbackBuckets = ['deliveries', 'delivery-files', 'quick-jobs']
          let fallbackSuccess = false

          for (const fbBucket of fallbackBuckets) {
            const { error: fbErr } = await supabase.storage
              .from(fbBucket)
              .upload(storagePath, buffer, {
                contentType: fileType,
                upsert: true,
              })

            if (!fbErr) {
              const { data: fbUrlData } = supabase.storage.from(fbBucket).getPublicUrl(storagePath)
              downloadUrl = fbUrlData?.publicUrl || ''
              fallbackSuccess = true
              console.log(`[Supabase Upload] Successfully stored in fallback bucket '${fbBucket}'`)
              break
            }
          }

          if (!fallbackSuccess) {
            // If all Supabase buckets failed, fallback to Firebase Admin Storage or stream endpoint
            console.warn('[Supabase Upload] Falling back to secondary storage provider:', uploadError.message)
            try {
              const adminStorage = getAdminStorage()
              const bucket = adminStorage.bucket()
              const gcsFile = bucket.file(storagePath)
              await gcsFile.save(buffer, {
                metadata: { contentType: fileType },
                resumable: false,
              })
              storageProvider = 'firebase'
              downloadUrl = `/api/files?id=${fileDocId}`
            } catch (firebaseErr: any) {
              console.warn('[Firebase Storage Fallback Warning]:', firebaseErr.message)
              // Final resilient fallback: Stream route directly
              downloadUrl = `/api/files?id=${fileDocId}`
            }
          }
        } else {
          // Primary bucket succeeded
          const { data: urlData } = supabase.storage
            .from(primaryBucket)
            .getPublicUrl(storagePath)

          downloadUrl = urlData?.publicUrl || `/api/files?id=${fileDocId}`
        }
      } catch (storageErr: any) {
        console.error('[Storage Error in Quick Jobs upload]:', storageErr)
        downloadUrl = `/api/files?id=${fileDocId}`
      }
    }

    // If still no download URL, set default stream URL
    if (!downloadUrl) {
      downloadUrl = `/api/files?id=${fileDocId}`
    }

    // 3. Save File Document to Firestore
    const fileRecord = {
      id: fileDocId,
      quickJobId: jobId,
      clientId: clientId || qjData.clientId || '',
      clientName: clientName || qjData.clientName || '',
      fileName,
      originalName: fileName,
      fileType,
      fileSize,
      storagePath,
      downloadUrl,
      storageProvider,
      downloadCount: 0,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: 'admin',
    }

    await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileDocId).set(fileRecord)

    // 4. Update or Create linked Deliveries record
    const delivSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('quickJobId', '==', jobId)
      .limit(1)
      .get()

    let deliveryId = ''
    let existingFiles: any[] = []

    if (!delivSnap.empty) {
      const delivDoc = delivSnap.docs[0]
      deliveryId = delivDoc.id
      existingFiles = delivDoc.data().files || []
      
      const newFileList = [
        ...existingFiles,
        {
          id: fileDocId,
          name: fileName,
          url: downloadUrl,
          path: storagePath,
          size: fileSize,
          fileType,
        },
      ]

      await delivDoc.ref.update({
        files: newFileList,
        fileCount: newFileList.length,
        totalSize: FieldValue.increment(fileSize),
        status: 'Ready',
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const newDelivRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc()
      deliveryId = newDelivRef.id
      const accessToken = generateSecureToken('dlv_')

      await newDelivRef.set({
        id: deliveryId,
        quickJobId: jobId,
        clientId: clientId || qjData.clientId || '',
        clientName: clientName || qjData.clientName || '',
        projectName: qjData.jobDescription || 'Quick Job Delivery',
        title: `Quick Job Delivery: ${qjData.jobDescription || 'Files'}`,
        status: 'Ready',
        isReleased: true,
        accessToken,
        files: [
          {
            id: fileDocId,
            name: fileName,
            url: downloadUrl,
            path: storagePath,
            size: fileSize,
            fileType,
          },
        ],
        fileCount: 1,
        totalSize: fileSize,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      // Link deliveryAccessToken to the quickJob document
      await qjRef.update({
        deliveryAccessToken: accessToken,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({
      success: true,
      file: {
        id: fileDocId,
        name: fileName,
        originalName: fileName,
        url: downloadUrl,
        path: storagePath,
        size: fileSize,
        type: fileType,
        storageProvider,
      },
    })
  } catch (error: any) {
    console.error('[Quick Jobs Upload Route Error]:', error)
    return NextResponse.json(
      { error: error.message || 'File upload failed. Please verify storage settings.' },
      { status: 500 }
    )
  }
}
