import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, appUrl, getDeliveryLink } from '@/lib/utils'
import { senderName, getEmailSender } from '@/lib/config/email'
import { sendDeliveryReadyEmail } from '@/lib/services/brevo'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { jobId, clientName, clientEmail, files, resend, origin: clientOrigin } = body

    if (!jobId || !clientEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const baseContext = clientOrigin || req
    const adminDb = getAdminDb()
    
    // 1. Verify Quick Job Payment Status
    const qjRef = adminDb.collection('quickJobs').doc(jobId)
    const qjSnap = await qjRef.get()
    
    if (!qjSnap.exists) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }
    
    const qjData = qjSnap.data()!
    const isPaid =
      qjData.paymentStatus === 'Paid' ||
      (Number(qjData.outstandingBalance) <= 0 && Number(qjData.amountPaid) >= Number(qjData.originalAgreedPrice))

    if (!isPaid) {
      return NextResponse.json({ error: 'Payment must be completed before sending delivery' }, { status: 403 })
    }
    
    if (qjData.deliveryStatus === 'Sent' && !resend) {
      // If already sent and not explicitly a resend, find existing delivery link
      const existingDelivSnap = await adminDb
        .collection('deliveries')
        .where('quickJobId', '==', jobId)
        .limit(1)
        .get()

      if (!existingDelivSnap.empty) {
        const existingToken = existingDelivSnap.docs[0].data().accessToken
        return NextResponse.json({
          success: true,
          deliveryLink: getDeliveryLink(existingToken, baseContext),
          message: 'Delivery already sent.',
        })
      }
    }

    // 2. Create or update delivery record to generate an access token
    let accessToken = generateSecureToken('dlv_')
    let deliveryId = ''

    // Check if delivery already exists for this quick job
    const existingSnap = await adminDb
      .collection('deliveries')
      .where('quickJobId', '==', jobId)
      .limit(1)
      .get()

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0]
      deliveryId = existingDoc.id
      accessToken = existingDoc.data().accessToken || accessToken
    } else {
      const newDelivRef = adminDb.collection('deliveries').doc()
      deliveryId = newDelivRef.id
    }

    // Map uploaded files to delivery files structure
    const deliveryFiles = (files || []).map((f: any) => ({
      id: f.id || generateSecureToken('file_'),
      deliveryId,
      quickJobId: jobId,
      clientId: qjData.clientId || '',
      fileName: f.name || f.fileName || 'file',
      originalName: f.name || f.originalName || 'file',
      url: f.url || f.downloadUrl || '',
      downloadUrl: f.url || f.downloadUrl || '',
      path: f.path || f.storagePath || '',
      storagePath: f.path || f.storagePath || '',
      fileSize: f.size || f.fileSize || 0,
      fileType: (f.name || f.fileName || '').split('.').pop() || 'file',
      downloadCount: 0,
      uploadedAt: new Date().toISOString(),
    }))

    const batch = adminDb.batch()
    const delivDocRef = adminDb.collection('deliveries').doc(deliveryId)

    batch.set(
      delivDocRef,
      {
        id: deliveryId,
        clientId: qjData.clientId || '',
        clientName: qjData.clientName || clientName,
        quickJobId: jobId,
        projectName: qjData.jobDescription || 'Quick Job Delivery',
        title: `Quick Job Delivery: ${qjData.jobDescription || 'Files'}`,
        status: 'Ready',
        isReleased: true,
        accessToken,
        files: deliveryFiles,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // Save each file into deliveryFiles collection
    for (const f of deliveryFiles) {
      const fRef = adminDb.collection('deliveryFiles').doc(f.id)
      batch.set(fRef, {
        id: f.id,
        deliveryId,
        quickJobId: jobId,
        clientId: qjData.clientId || '',
        fileName: f.fileName,
        originalName: f.originalName,
        downloadUrl: f.downloadUrl,
        storagePath: f.storagePath,
        fileSize: f.fileSize,
        fileType: f.fileType,
        downloadCount: 0,
        uploadedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }

    // Activity Log
    const actRef = adminDb.collection('activityLogs').doc()
    batch.set(actRef, {
      event: 'delivery_released',
      description: `Delivery sent for Quick Job: ${qjData.jobDescription}`,
      entityId: jobId,
      entityType: 'quickJob',
      clientId: qjData.clientId || '',
      clientName: qjData.clientName || clientName,
      performedBy: 'admin',
      metadata: { fileCount: deliveryFiles.length, accessToken },
      createdAt: FieldValue.serverTimestamp(),
    })

    // Update Quick Job
    batch.update(qjRef, {
      deliveryStatus: 'Sent',
      status: 'Completed',
      deliveryEmailSentAt: FieldValue.serverTimestamp(),
      deliveryAccessToken: accessToken,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    const deliveryLink = getDeliveryLink(accessToken, baseContext)

    // Fetch brand logo
    let lexmediaLogoUrl = ''
    const brandingSnap = await adminDb.collection('settings').doc('branding').get()
    if (brandingSnap.exists) {
      const bData = brandingSnap.data()!
      if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
    }

    // Fetch client photoURL
    let clientLogoUrl = ''
    if (qjData.clientId) {
      const clientSnap = await adminDb.collection('clients').doc(qjData.clientId).get()
      if (clientSnap.exists) {
        const clientData = clientSnap.data()!
        if (clientData.photoURL) clientLogoUrl = clientData.photoURL
      }
    }

    // 3. Send email via Brevo API directly using the reused premium delivery-ready email template
    const emailRes = await sendDeliveryReadyEmail({
      toEmail: clientEmail,
      clientName,
      projectName: qjData.jobDescription || 'Quick Job Delivery',
      deliveryUrl: deliveryLink,
      lexmediaLogoUrl,
      clientLogoUrl,
    })

    if (!emailRes.success) {
      console.warn('[Quick Jobs Delivery Email] Brevo email notification failed:', emailRes.error)
    }

    return NextResponse.json({ success: true, deliveryLink, accessToken })
  } catch (error: any) {
    console.error('Send Quick Job Delivery Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
