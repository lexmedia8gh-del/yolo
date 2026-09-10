import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, getDeliveryLink } from '@/lib/utils'
import { sendDeliveryReadyEmail } from '@/lib/services/brevo'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quick-jobs/release-delivery
 * Releases delivery files to the client for a completed Quick Job and sends a secure delivery email via Brevo.
 */
export async function POST(req: NextRequest) {
  // 1. Admin authentication check
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await req.json()
    const { jobId, resend } = body as { jobId: string; resend?: boolean }

    if (!jobId) {
      return NextResponse.json({ error: 'Missing required parameter: jobId' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(jobId)
    const qjSnap = await qjRef.get()

    if (!qjSnap.exists) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }

    const qjData = qjSnap.data()!

    // 2. Determine payment status and admin override release
    const isPaid =
      qjData.paymentStatus === 'Paid' ||
      (Number(qjData.outstandingBalance) <= 0 && Number(qjData.amountPaid) >= Number(qjData.originalAgreedPrice))

    // 3. Find canonical delivery record or initialize one
    const deliveryRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc(jobId)
    const deliverySnap = await deliveryRef.get()

    let deliveryData = deliverySnap.exists ? deliverySnap.data()! : null
    let accessToken = deliveryData?.accessToken || qjData.deliveryAccessToken || ''

    if (!accessToken) {
      accessToken = generateSecureToken(24)
    }

    // 4. Verify delivery files exist for this Quick Job
    let filesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERY_FILES)
      .where('deliveryId', '==', jobId)
      .get()

    let fileCount = filesSnap.size

    // Fallback: check quickJobId if deliveryId didn't return files
    if (fileCount === 0) {
      const qjFilesSnap = await adminDb
        .collection(COLLECTIONS.DELIVERY_FILES)
        .where('quickJobId', '==', jobId)
        .get()
      fileCount = qjFilesSnap.size
    }

    // Fallback: check embedded files array
    if (fileCount === 0 && Array.isArray(deliveryData?.files) && deliveryData.files.length > 0) {
      fileCount = deliveryData.files.length
    }

    // Fallback: check Quick Job fileIds array
    if (fileCount === 0 && Array.isArray(qjData.fileIds) && qjData.fileIds.length > 0) {
      fileCount = qjData.fileIds.length
    }

    if (fileCount === 0) {
      return NextResponse.json(
        { error: 'Please upload delivery files before releasing this job.' },
        { status: 400 }
      )
    }

    // 5. Prevent accidental duplicate releases
    const isAlreadyReleased =
      (qjData.deliveryStatus === 'Released' || deliveryData?.isReleased === true) &&
      Boolean(qjData.deliveryEmailSent || deliveryData?.notifyEmailSent)

    if (isAlreadyReleased && !resend) {
      const deliveryLink = getDeliveryLink(accessToken, req)
      return NextResponse.json({
        success: true,
        alreadyReleased: true,
        deliveryLink,
        releasedAt: qjData.deliveryReleasedAt || null,
        message: 'Delivery has already been released to the client. Use resend to send another notification.',
      })
    }

    // 6. Resolve client email and details
    let clientEmail = qjData.clientEmail || ''
    let clientName = qjData.clientName || 'Valued Client'
    let clientLogoUrl = ''

    if (qjData.clientId) {
      try {
        const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(qjData.clientId).get()
        if (clientSnap.exists) {
          const clientData = clientSnap.data()!
          if (!clientEmail && clientData.email) clientEmail = clientData.email
          if (!clientName && clientData.fullName) clientName = clientData.fullName
          if (clientData.photoURL) clientLogoUrl = clientData.photoURL
        }
      } catch (err) {
        console.warn('Could not fetch client details for Quick Job delivery release:', err)
      }
    }

    if (!clientEmail) {
      return NextResponse.json(
        { error: 'Client email address is missing. Please ensure the client or Quick Job has an email address.' },
        { status: 400 }
      )
    }

    // 7. Generate secure production delivery portal link
    const deliveryLink = getDeliveryLink(accessToken, req)

    // 8. Fetch LEXMEDIA branding logo if available
    let lexmediaLogoUrl = ''
    try {
      const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
      if (brandingSnap.exists) {
        const bData = brandingSnap.data()!
        if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
      }
    } catch {}

    // 9. Dispatch Brevo Email using server-side configuration
    const jobServiceName = qjData.serviceSnapshot?.name || qjData.jobDescription || 'Quick Job'
    const emailRes = await sendDeliveryReadyEmail({
      toEmail: clientEmail,
      clientName,
      projectName: qjData.jobDescription || jobServiceName,
      deliveryUrl: deliveryLink,
      lexmediaLogoUrl,
      clientLogoUrl,
      subject: 'Your deliverables are ready!',
      introText: `Your files for <strong>${jobServiceName}</strong> are now ready for you.<br><br>Click the button below to securely access and download your deliverables.<br><br><span style="color: #475569; font-size: 13px;">Thank you for choosing LEXMEDIA.GH.</span>`,
      primaryButtonText: 'Access Your Files',
    })

    // If Brevo email fails: DO NOT mark as successfully sent
    if (!emailRes.success) {
      console.error('[Quick Job Release] Brevo email dispatch failed:', emailRes.error)
      return NextResponse.json(
        {
          error: `Failed to send delivery email via Brevo: ${emailRes.error || 'Unknown email service error'}. Please verify Brevo configuration and retry.`,
          emailFailed: true,
        },
        { status: 502 }
      )
    }

    // 10. Email succeeded! Atomically persist release state to Firestore
    const batch = adminDb.batch()

    // Upsert canonical delivery record
    batch.set(
      deliveryRef,
      {
        id: jobId,
        quickJobId: jobId,
        clientId: qjData.clientId || '',
        clientName: qjData.clientName || clientName,
        projectName: qjData.jobDescription || 'Quick Job Delivery',
        title: `Quick Job Delivery: ${qjData.jobDescription || 'Files'}`,
        status: 'Ready',
        isReleased: true,
        requiresFullPayment: false,
        adminOverride: !isPaid,
        accessToken,
        fileCount,
        releasedAt: FieldValue.serverTimestamp(),
        releasedBy: auth.email || 'Admin',
        notifyEmailSent: true,
        notifyEmailSentAt: FieldValue.serverTimestamp(),
        notifyEmailMessageId: emailRes.messageId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // Update Quick Job document
    batch.update(qjRef, {
      deliveryStatus: 'Released',
      status: 'Completed',
      deliveryReleasedAt: FieldValue.serverTimestamp(),
      deliveryEmailSent: true,
      deliveryEmailSentAt: FieldValue.serverTimestamp(),
      deliveryAccessToken: accessToken,
      deliveryLink,
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Log Activity
    const actRef = adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).doc()
    batch.set(actRef, {
      event: 'delivery_released',
      description: `${resend ? 'Resent delivery' : 'Released delivery'} and sent email via Brevo to ${clientEmail} for Quick Job: ${qjData.jobDescription}`,
      entityId: jobId,
      entityType: 'quickJob',
      clientId: qjData.clientId || '',
      clientName: qjData.clientName || clientName,
      performedBy: auth.email || 'admin',
      metadata: {
        fileCount,
        deliveryLink,
        accessToken,
        isResend: !!resend,
        emailMessageId: emailRes.messageId || null,
      },
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return NextResponse.json({
      success: true,
      deliveryLink,
      accessToken,
      releasedAt: new Date().toISOString(),
      emailSentTo: clientEmail,
      message: resend ? 'Delivery notification email resent via Brevo!' : 'Delivery released and email sent successfully via Brevo!',
    })
  } catch (error: any) {
    console.error('Quick Job Release Delivery Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
