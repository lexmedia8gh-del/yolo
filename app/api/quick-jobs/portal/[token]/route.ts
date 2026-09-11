import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, buildDeliveryUrl } from '@/lib/utils'
import { sendDeliveryReadyEmail } from '@/lib/services/brevo'

export const dynamic = 'force-dynamic'

/**
 * Resolves a QuickJob and associated delivery files from a token.
 * Token can be:
 * - QuickJob ID
 * - QuickJob paymentToken
 * - QuickJob deliveryAccessToken
 * - ClientLink token (linking to quickJobId)
 */
async function resolveJobFromToken(token: string) {
  const adminDb = getAdminDb()
  const cleanToken = (token || '').trim()
  if (!cleanToken) return null

  // 1. Direct QuickJob doc ID
  const directSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(cleanToken).get()
  if (directSnap.exists) {
    return { jobDoc: directSnap, jobData: directSnap.data()! }
  }

  // 2. Query by paymentToken
  const byPayToken = await adminDb
    .collection(COLLECTIONS.QUICK_JOBS)
    .where('paymentToken', '==', cleanToken)
    .limit(1)
    .get()
  if (!byPayToken.empty) {
    return { jobDoc: byPayToken.docs[0], jobData: byPayToken.docs[0].data() }
  }

  // 3. Query by deliveryAccessToken
  const byDelivToken = await adminDb
    .collection(COLLECTIONS.QUICK_JOBS)
    .where('deliveryAccessToken', '==', cleanToken)
    .limit(1)
    .get()
  if (!byDelivToken.empty) {
    return { jobDoc: byDelivToken.docs[0], jobData: byDelivToken.docs[0].data() }
  }

  // 4. Query ClientLink by token
  const byClientLink = await adminDb
    .collection(COLLECTIONS.CLIENT_LINKS)
    .where('token', '==', cleanToken)
    .limit(1)
    .get()
  if (!byClientLink.empty) {
    const linkData = byClientLink.docs[0].data()
    if (linkData.quickJobId) {
      const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(linkData.quickJobId).get()
      if (qjSnap.exists) {
        return { jobDoc: qjSnap, jobData: qjSnap.data()!, clientLink: linkData }
      }
    }
  }

  return null
}

/**
 * GET /api/quick-jobs/portal/[token]
 * Public endpoint to fetch Quick Job status, payment state, and files.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const resolved = await resolveJobFromToken(token)
    if (!resolved) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }

    const { jobDoc, jobData } = resolved
    const jobId = jobDoc.id

    const isPaid =
      jobData.paymentStatus === 'Paid' ||
      (Number(jobData.outstandingBalance) <= 0 &&
        Number(jobData.amountPaid) >= Number(jobData.originalAgreedPrice))

    const adminDb = getAdminDb()

    // Fetch existing uploaded files
    const filesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERY_FILES)
      .where('quickJobId', '==', jobId)
      .get()

    const files = filesSnap.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        fileName: d.fileName || d.originalName || 'file',
        fileSize: d.fileSize || 0,
        fileType: d.fileType || '',
        downloadUrl: isPaid ? d.downloadUrl : '', // Lock download URL if unpaid
        uploadedAt: d.uploadedAt ? d.uploadedAt.toDate?.() || d.uploadedAt : null,
      }
    })

    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        clientName: jobData.clientName || 'Client',
        clientEmail: jobData.clientEmail || '',
        jobDescription: jobData.jobDescription || 'Quick Job Deliverables',
        serviceTitle: jobData.serviceSnapshot?.title || '',
        originalAgreedPrice: Number(jobData.originalAgreedPrice) || 0,
        amountPaid: Number(jobData.amountPaid) || 0,
        outstandingBalance: Number(jobData.outstandingBalance) || 0,
        currency: jobData.currency || 'GHS',
        paymentStatus: isPaid ? 'Paid' : jobData.paymentStatus || 'Unpaid',
        deliveryStatus: jobData.deliveryStatus || 'Not Ready',
        isPaid,
        token,
        deliveryAccessToken: jobData.deliveryAccessToken || jobId,
        paymentToken: jobData.paymentToken || (resolved as any).clientLink?.token || token,
      },
      files,
    })
  } catch (error: any) {
    console.error('Error fetching quick job portal details:', error)
    return NextResponse.json({ error: 'Failed to load Quick Job details' }, { status: 500 })
  }
}

/**
 * POST /api/quick-jobs/portal/[token]
 * Submits deliverables for a paid Quick Job, marks delivery, and triggers Brevo notification.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const resolved = await resolveJobFromToken(token)
    if (!resolved) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }

    const { jobDoc, jobData } = resolved
    const jobId = jobDoc.id

    // Check payment status - MUST be paid
    const isPaid =
      jobData.paymentStatus === 'Paid' ||
      (Number(jobData.outstandingBalance) <= 0 &&
        Number(jobData.amountPaid) >= Number(jobData.originalAgreedPrice))

    if (!isPaid) {
      return NextResponse.json(
        { error: 'Payment must be verified before submitting deliverables.' },
        { status: 403 }
      )
    }

    const adminDb = getAdminDb()

    // Ensure at least one delivery file exists
    const filesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERY_FILES)
      .where('quickJobId', '==', jobId)
      .get()

    if (filesSnap.empty && (!Array.isArray(jobData.fileIds) || jobData.fileIds.length === 0)) {
      return NextResponse.json(
        { error: 'Please upload at least one deliverable file before submitting.' },
        { status: 400 }
      )
    }

    let accessToken = jobData.deliveryAccessToken || ''
    if (!accessToken) {
      accessToken = generateSecureToken(24)
    }

    const deliveryLink = buildDeliveryUrl(accessToken, req)
    const now = new Date().toISOString()

    // 1. Update Quick Job in Firestore
    await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(jobId).update({
      deliveryStatus: 'Released',
      deliveryReleasedAt: now,
      deliveryAccessToken: accessToken,
      deliveryLink,
      deliveryEmailSent: true,
      deliveryEmailSentAt: now,
      status: 'Delivered',
      updatedAt: now,
    })

    // 2. Update or create delivery record
    await adminDb.collection(COLLECTIONS.DELIVERIES).doc(jobId).set(
      {
        id: jobId,
        quickJobId: jobId,
        clientId: jobData.clientId || '',
        clientName: jobData.clientName || 'Client',
        clientEmail: jobData.clientEmail || '',
        title: jobData.jobDescription || 'Quick Job Deliverables',
        projectName: `Quick Job: ${jobData.jobDescription || 'Deliverables'}`,
        status: 'Released',
        isReleased: true,
        accessToken,
        deliveryLink,
        releasedAt: now,
        notifyEmailSent: true,
        notifyEmailSentAt: now,
        updatedAt: now,
      },
      { merge: true }
    )

    // 3. Send Brevo Delivery Notification if client email is available
    let emailSent = false
    if (jobData.clientEmail) {
      try {
        const emailRes = await sendDeliveryReadyEmail({
          toEmail: jobData.clientEmail,
          clientName: jobData.clientName || 'Valued Client',
          projectName: jobData.jobDescription || 'Your Quick Job Deliverables',
          deliveryUrl: deliveryLink,
          subject: `Deliverables Ready: ${jobData.jobDescription || 'Your Project'}`,
        })
        emailSent = emailRes.success
      } catch (eErr) {
        console.warn('Brevo email notification warning:', eErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Deliverables submitted and released successfully!',
      deliveryLink,
      emailSent,
    })
  } catch (error: any) {
    console.error('Error submitting quick job deliverables:', error)
    return NextResponse.json({ error: 'Failed to submit deliverables' }, { status: 500 })
  }
}
