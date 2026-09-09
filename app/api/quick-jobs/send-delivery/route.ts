import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, appUrl, getDeliveryLink } from '@/lib/utils'
import { senderName, getEmailSender } from '@/lib/config/email'

export async function POST(req: NextRequest) {
  try {
    const { jobId, clientName, clientEmail, files, resend } = await req.json()

    if (!jobId || !clientEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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
          deliveryLink: getDeliveryLink(existingToken),
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

    const deliveryLink = getDeliveryLink(accessToken)

    // 3. Send email via Brevo API directly using centralized sender configuration
    const apiKey = process.env.BREVO_API_KEY
    const sender = getEmailSender()

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
          <h2 style="margin: 0; color: #4338ca; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">${senderName}</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Project & Deliverable Management</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hello <strong>${clientName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Great news! 🎉 Your payment has been confirmed, and your deliverables for <strong>${qjData.jobDescription}</strong> are now ready for download.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569;">Access your secure deliverables anytime:</p>
          <a href="${deliveryLink}" style="display: inline-block; background-color: #4338ca; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(67, 56, 202, 0.2);">
            Open Delivery Portal & Download Files
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">Direct Link: <br><a href="${deliveryLink}" style="color: #4338ca; word-break: break-all;">${deliveryLink}</a></p>
        
        <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; font-size: 13px; color: #94a3b8;">
          <p style="margin: 0 0 4px 0;">Thank you for choosing ${senderName}.</p>
          <p style="margin: 0;">Best regards,<br><strong style="color: #475569;">${senderName}</strong></p>
        </div>
      </div>
    `

    if (apiKey) {
      const brevoPayload = {
        sender: { name: senderName, email: sender.email },
        to: [{ email: clientEmail, name: clientName }],
        replyTo: { name: senderName, email: sender.email },
        subject: `Your Deliverables Are Ready – ${senderName}`,
        htmlContent,
      }

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(brevoPayload),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        console.error('Brevo Error:', errText)
        throw new Error('Failed to send email via Brevo')
      }
    } else {
      console.log(`[Quick Jobs Delivery Email - Preview Mode] Continuing without Brevo API key:`)
      console.log(`  To: ${clientName} <${clientEmail}>`)
      console.log(`  From: ${senderName} <${sender.email}>`)
      console.log(`  Subject: Your Deliverables Are Ready – ${senderName}`)
    }

    return NextResponse.json({ success: true, deliveryLink, accessToken })
  } catch (error: any) {
    console.error('Send Quick Job Delivery Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
