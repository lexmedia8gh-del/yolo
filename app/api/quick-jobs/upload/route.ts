import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: any = {}
    const contentType = req.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      body = await req.json()
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      body = {
        jobId: formData.get('jobId'),
        clientId: formData.get('clientId'),
        clientName: formData.get('clientName'),
        fileDocId: formData.get('fileDocId'),
        directUrl: formData.get('directUrl'),
        storagePath: formData.get('storagePath'),
        fileName: formData.get('fileName'),
        fileSize: formData.get('fileSize'),
        fileType: formData.get('fileType'),
      }
    } else {
      body = await req.json().catch(() => ({}))
    }

    const jobId = body.jobId || ''
    const clientId = body.clientId || ''
    const clientName = body.clientName || ''
    const directUrl = body.directUrl || ''
    const storagePath = body.storagePath || ''
    const fileName = body.fileName || body.originalName || 'file'
    const fileSize = parseInt(body.fileSize, 10) || 0
    const fileType = body.fileType || 'application/octet-stream'

    if (!jobId) {
      return NextResponse.json({ error: 'Missing Quick Job ID' }, { status: 400 })
    }

    if (!directUrl || !storagePath) {
      return NextResponse.json(
        { error: 'Upload failed: Files must be uploaded directly to Supabase Storage. Missing direct storage URL.' },
        { status: 400 }
      )
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

    const fileDocId = body.fileDocId || generateSecureToken('qjf_')
    const downloadUrl = directUrl
    const storageProvider = 'supabase'

    // 2. Save File Document to Firestore
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

    // 3. Update or Create linked Deliveries record
    const delivSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('quickJobId', '==', jobId)
      .limit(1)
      .get()

    let deliveryId = ''

    if (!delivSnap.empty) {
      const delivDoc = delivSnap.docs[0]
      deliveryId = delivDoc.id
      const existingFiles = delivDoc.data().files || []
      
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
