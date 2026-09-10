import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, getDeliveryLink } from '@/lib/utils'
import { sendDeliveryPaymentRequiredEmail } from '@/lib/services/brevo'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await req.json()
    const { jobId, clientName, clientEmail, files, resend } = body

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    
    // 1. Verify Quick Job Payment Status
    const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(jobId)
    const qjSnap = await qjRef.get()
    
    if (!qjSnap.exists) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }
    
    const qjData = qjSnap.data()!
    const isPaid =
      qjData.paymentStatus === 'Paid' ||
      (Number(qjData.outstandingBalance) <= 0 && Number(qjData.amountPaid) >= Number(qjData.originalAgreedPrice))
    const amountDue = isPaid ? 0 : Number(qjData.outstandingBalance || qjData.originalAgreedPrice || 0)

    const isAlreadyReleased =
      (qjData.deliveryStatus === 'Released' || qjData.deliveryStatus === 'Sent') &&
      Boolean(qjData.deliveryEmailSent)

    // 2. Access token resolution
    let accessToken = qjData.deliveryAccessToken || ''
    let deliveryId = jobId

    const existingDelivSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).doc(jobId).get()
    if (existingDelivSnap.exists) {
      const data = existingDelivSnap.data()!
      accessToken = data.accessToken || accessToken
    }

    if (!accessToken) {
      accessToken = generateSecureToken(24)
    }

    const deliveryLink = getDeliveryLink(accessToken, req)

    if (isAlreadyReleased && !resend) {
      return NextResponse.json({
        success: true,
        alreadyReleased: true,
        deliveryLink,
        message: 'Delivery has already been released.',
      })
    }

    // 3. Resolve client email
    let resolvedEmail = clientEmail || qjData.clientEmail || ''
    let resolvedName = clientName || qjData.clientName || 'Valued Client'
    let clientLogoUrl = ''

    if (qjData.clientId) {
      try {
        const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(qjData.clientId).get()
        if (clientSnap.exists) {
          const clientData = clientSnap.data()!
          if (!resolvedEmail && clientData.email) resolvedEmail = clientData.email
          if (!resolvedName && clientData.fullName) resolvedName = clientData.fullName
          if (clientData.photoURL) clientLogoUrl = clientData.photoURL
        }
      } catch {}
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: 'Missing client email for delivery dispatch' }, { status: 400 })
    }

    // 4. Fetch brand logo
    let lexmediaLogoUrl = ''
    try {
      const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
      if (brandingSnap.exists) {
        const bData = brandingSnap.data()!
        if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
      }
    } catch {}

    // 5. Send Brevo email
    const emailRes = await sendDeliveryPaymentRequiredEmail({
      toEmail: resolvedEmail,
      clientName: resolvedName,
      projectName: qjData.jobDescription || 'Quick Job Deliverables',
      amountDue,
      currencySymbol: qjData.currency || 'GH₵',
      paymentUrl: deliveryLink,
      deliveryUrl: deliveryLink,
      lexmediaLogoUrl,
      clientLogoUrl,
    })

    if (!emailRes.success) {
      console.error('[Quick Jobs Delivery Email] Brevo send failed:', emailRes.error)
      return NextResponse.json(
        { error: `Brevo email failed to send: ${emailRes.error || 'Unknown error'}. Delivery not released.`, emailFailed: true },
        { status: 502 }
      )
    }

    // 6. Atomically persist release state
    const batch = adminDb.batch()
    const delivDocRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc(deliveryId)

    batch.set(
      delivDocRef,
      {
        id: deliveryId,
        clientId: qjData.clientId || '',
        clientName: resolvedName,
        quickJobId: jobId,
        projectName: qjData.jobDescription || 'Quick Job Delivery',
        title: `Quick Job Delivery: ${qjData.jobDescription || 'Files'}`,
        status: 'Ready',
        isReleased: true,
        accessToken,
        releasedAt: FieldValue.serverTimestamp(),
        notifyEmailSent: true,
        notifyEmailSentAt: FieldValue.serverTimestamp(),
        notifyEmailMessageId: emailRes.messageId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // Update Quick Job
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

    // Activity Log
    const actRef = adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).doc()
    batch.set(actRef, {
      event: 'delivery_released',
      description: `${resend ? 'Resent delivery' : 'Released delivery'} and sent email via Brevo to ${resolvedEmail} for Quick Job: ${qjData.jobDescription}`,
      entityId: jobId,
      entityType: 'quickJob',
      clientId: qjData.clientId || '',
      clientName: resolvedName,
      performedBy: auth.email || 'admin',
      metadata: { deliveryLink, accessToken, isResend: !!resend },
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return NextResponse.json({
      success: true,
      deliveryLink,
      accessToken,
      emailSentTo: resolvedEmail,
      releasedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Send Quick Job Delivery Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
