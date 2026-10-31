import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { buildDeliveryUrl } from '@/lib/utils'
import {
  sendPaymentConfirmedDeliveryEmail,
  resolvePublicBrandAssetUrl,
} from '@/lib/services/brevo'
import {
  AUTHORITATIVE_LEXMEDIA_LOGO,
  sanitizeBrandingLogoUrlIsomorphic,
} from '@/lib/branding/logo-resolver'

export const dynamic = 'force-dynamic'

const SAFE_REFERENCE_RE = /^[A-Za-z0-9._:-]{4,128}$/

function formatReceiptNumber(reference: string): string {
  const clean = reference.replace(/^LXM_/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return `RCP-${clean.slice(-10) || '000001'}`
}

async function resolvePublicEmailLogo(adminDb: FirebaseFirestore.Firestore): Promise<string> {
  try {
    const [bSnap, bizSnap] = await Promise.all([
      adminDb.collection('settings').doc('branding').get(),
      adminDb.collection('settings').doc('business').get(),
    ])
    const bData = bSnap.exists ? bSnap.data() || {} : {}
    const bizData = bizSnap.exists ? bizSnap.data() || {} : {}
    const rawLogo =
      sanitizeBrandingLogoUrlIsomorphic(bData.logoUrl, bData.logoStoragePath) ||
      sanitizeBrandingLogoUrlIsomorphic(bizData.logoURL, bizData.logoStoragePath) ||
      AUTHORITATIVE_LEXMEDIA_LOGO
    return resolvePublicBrandAssetUrl(rawLogo)
  } catch {
    return ''
  }
}

async function buildIdempotentPaymentResponse(
  adminDb: FirebaseFirestore.Firestore,
  req: NextRequest,
  reference: string,
  paymentData: FirebaseFirestore.DocumentData,
  fallbackToken: string
) {
  let invoiceNumber = paymentData.invoiceNumber || ''
  let projectName = paymentData.projectName || ''
  let clientName = paymentData.clientName || ''
  let clientEmail = paymentData.clientEmail || ''
  let totalAmount = Number(paymentData.totalAmount || 0)
  let totalPaid = Number(paymentData.totalPaid || paymentData.amount || 0)
  let remainingBalance =
    paymentData.remainingBalance !== undefined ? Number(paymentData.remainingBalance) : 0
  let isFullyPaid =
    paymentData.isFullyPaid !== undefined ? Boolean(paymentData.isFullyPaid) : remainingBalance <= 0.01
  let resolvedPaymentToken = fallbackToken || paymentData.paymentToken || ''

  // Enrich from Invoice if present
  if (paymentData.invoiceId) {
    try {
      const invSnap = await adminDb.collection('invoices').doc(paymentData.invoiceId).get()
      if (invSnap.exists) {
        const inv = invSnap.data()!
        invoiceNumber = inv.invoiceNumber || invoiceNumber
        projectName = inv.projectName || projectName
        clientName = inv.clientName || clientName
        clientEmail = inv.clientEmail || clientEmail
        totalAmount = Number(inv.total ?? totalAmount)
        totalPaid = Number(inv.amountPaid ?? totalPaid)
        remainingBalance = Math.max(
          0,
          inv.balanceDue !== undefined ? Number(inv.balanceDue) : totalAmount - totalPaid
        )
        isFullyPaid = inv.status === 'Paid' || remainingBalance <= 0.01
        if (!resolvedPaymentToken && inv.paymentLinkToken) {
          resolvedPaymentToken = inv.paymentLinkToken
        }
      }
    } catch {}
  }

  // Enrich from Project if present
  if (paymentData.projectId) {
    try {
      const projSnap = await adminDb.collection('projects').doc(paymentData.projectId).get()
      if (projSnap.exists) {
        const proj = projSnap.data()!
        projectName = proj.name || projectName
        clientName = proj.clientName || clientName
        clientEmail = proj.clientEmail || clientEmail
        if (!invoiceNumber) {
          invoiceNumber = proj.reference || `PROJ-${String(paymentData.projectId).slice(0, 8).toUpperCase()}`
        }
        if (!totalAmount && proj.price) {
          totalAmount = Number(proj.price || 0)
          totalPaid = Number(proj.amountPaid || totalPaid)
          remainingBalance = Math.max(
            0,
            proj.outstandingBalance !== undefined
              ? Number(proj.outstandingBalance)
              : totalAmount - totalPaid
          )
          isFullyPaid = proj.paymentStatus === 'Paid' || remainingBalance <= 0.01
        }
        if (!resolvedPaymentToken) {
          resolvedPaymentToken = paymentData.projectId
        }
      }
    } catch {}
  }

  // Enrich from Quick Job if present
  let quickJobPortalToken = ''
  if (paymentData.quickJobId) {
    try {
      const qjSnap = await adminDb.collection('quickJobs').doc(paymentData.quickJobId).get()
      if (qjSnap.exists) {
        const qj = qjSnap.data()!
        projectName = qj.jobDescription || qj.title || projectName
        clientName = qj.clientName || clientName
        clientEmail = qj.clientEmail || clientEmail
        quickJobPortalToken = qj.paymentToken || paymentData.quickJobId
        if (!invoiceNumber) {
          invoiceNumber = qj.jobCode || `QJ-${String(paymentData.quickJobId).slice(0, 8).toUpperCase()}`
        }
        if (!totalAmount && qj.originalAgreedPrice) {
          totalAmount = Number(qj.originalAgreedPrice || 0)
          totalPaid = Number(qj.amountPaid || totalPaid)
          remainingBalance = Math.max(
            0,
            qj.outstandingBalance !== undefined
              ? Number(qj.outstandingBalance)
              : totalAmount - totalPaid
          )
          isFullyPaid = qj.paymentStatus === 'Paid' || remainingBalance <= 0.01
        }
        if (!resolvedPaymentToken) {
          resolvedPaymentToken = qj.paymentToken || paymentData.quickJobId
        }
      }
    } catch {}
  }

  // Resolve clientLink token if still empty
  if (!resolvedPaymentToken && paymentData.paymentRequestId) {
    try {
      const clDoc = await adminDb.collection('clientLinks').doc(paymentData.paymentRequestId).get()
      if (clDoc.exists) {
        resolvedPaymentToken = clDoc.data()?.token || ''
      }
    } catch {}
  }
  if (!resolvedPaymentToken && paymentData.invoiceId) {
    try {
      const clSnap = await adminDb
        .collection('clientLinks')
        .where('invoiceId', '==', paymentData.invoiceId)
        .limit(1)
        .get()
      if (!clSnap.empty) {
        resolvedPaymentToken = clSnap.docs[0].data()?.token || ''
      }
    } catch {}
  }

  // Resolve associated Delivery & check release permission
  let rawDeliveryToken = paymentData.deliveryAccessToken || ''
  let deliveryDocData: FirebaseFirestore.DocumentData | null = null

  if (paymentData.deliveryId) {
    try {
      const dSnap = await adminDb.collection('deliveries').doc(paymentData.deliveryId).get()
      if (dSnap.exists) {
        deliveryDocData = dSnap.data() || null
        rawDeliveryToken = deliveryDocData?.accessToken || rawDeliveryToken
      }
    } catch {}
  }
  if (!deliveryDocData && rawDeliveryToken) {
    try {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('accessToken', '==', rawDeliveryToken)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocData = dSnap.docs[0].data()
      }
    } catch {}
  }
  if (!deliveryDocData && paymentData.invoiceId) {
    try {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('invoiceId', '==', paymentData.invoiceId)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocData = dSnap.docs[0].data()
        rawDeliveryToken = deliveryDocData?.accessToken || rawDeliveryToken
      }
    } catch {}
  }
  if (!deliveryDocData && paymentData.projectId) {
    try {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('projectId', '==', paymentData.projectId)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocData = dSnap.docs[0].data()
        rawDeliveryToken = deliveryDocData?.accessToken || rawDeliveryToken
      }
    } catch {}
  }

  if (deliveryDocData && !projectName) {
    projectName = deliveryDocData.projectName || deliveryDocData.title || ''
  }

  const requiresFullPayment = deliveryDocData ? deliveryDocData.requiresFullPayment !== false : true
  const isDeliveryReleased = Boolean(deliveryDocData?.isReleased)
  const canAccessDeliverables = Boolean(
    rawDeliveryToken && (isFullyPaid || !requiresFullPayment || isDeliveryReleased)
  )
  const lockedDeliveryExists = Boolean(rawDeliveryToken && !canAccessDeliverables)
  const safeDeliveryToken = canAccessDeliverables ? rawDeliveryToken : ''

  const paidAtValue = paymentData.paidAt
    ? typeof paymentData.paidAt?.toDate === 'function'
      ? paymentData.paidAt.toDate().toISOString()
      : String(paymentData.paidAt)
    : new Date().toISOString()

  const amount = Number(paymentData.amount || 0)
  const currency = String(paymentData.currency || 'GHS').toUpperCase()

  return NextResponse.json({
    status: 'success',
    paymentState: 'success',
    message: 'Transaction verified',
    reference,
    receiptNumber: paymentData.receiptNumber || formatReceiptNumber(reference),
    amount,
    currency,
    paidAt: paidAtValue,
    channel: paymentData.channel || paymentData.paymentMethod || 'card',
    invoiceId: paymentData.invoiceId || '',
    invoiceNumber,
    projectName,
    clientName,
    clientEmail,
    paymentStatus: isFullyPaid ? 'Paid' : 'Partially Paid',
    totalAmount: totalAmount || amount,
    totalPaid: totalPaid || amount,
    remainingBalance,
    isFullyPaid,
    token: resolvedPaymentToken,
    canAccessDeliverables,
    lockedDeliveryExists,
    deliveryAccessToken: safeDeliveryToken,
    deliveryUrl: safeDeliveryToken ? buildDeliveryUrl(safeDeliveryToken, req) : null,
    quickJobPortalToken: isFullyPaid ? quickJobPortalToken : '',
  })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const reference = (searchParams.get('reference') || searchParams.get('trxref') || '').trim()
    const queryToken = (searchParams.get('token') || '').trim()

    if (!reference) {
      return NextResponse.json(
        {
          status: 'invalid_reference',
          paymentState: 'invalid_reference',
          error: 'No payment transaction reference was provided.',
        },
        { status: 400 }
      )
    }

    if (!SAFE_REFERENCE_RE.test(reference)) {
      return NextResponse.json(
        {
          status: 'invalid_reference',
          paymentState: 'invalid_reference',
          error: 'The provided payment reference is invalid.',
        },
        { status: 400 }
      )
    }

    const adminDb = getAdminDb()

    // ── 1. IDEMPOTENCY CHECK (Already Verified Payment) ──────────────────────
    const existingPayments = await adminDb
      .collection('payments')
      .where('paystackReference', '==', reference)
      .limit(1)
      .get()

    if (!existingPayments.empty) {
      const existingData = existingPayments.docs[0].data()
      if (existingData.status === 'success') {
        console.log(`[Verify] Reference ${reference} already verified — returning enriched receipt`)
        return buildIdempotentPaymentResponse(adminDb, req, reference, existingData, queryToken)
      }
    }

    // Look up optional server-recorded paymentIntent for this reference
    let intentData: FirebaseFirestore.DocumentData | null = null
    try {
      const intentSnap = await adminDb.collection('paymentIntents').doc(reference).get()
      if (intentSnap.exists) {
        intentData = intentSnap.data() || null
      }
    } catch {}

    const paystackSecret = (process.env.PAYSTACK_SECRET_KEY || '').trim()
    const hasLivePaystackSecret = Boolean(
      paystackSecret &&
        !paystackSecret.includes('xxxxxxxx') &&
        !paystackSecret.includes('placeholder')
    )

    let amountPaid = 0
    let currency = 'GHS'
    let channel = 'card'
    let paidAt = new Date().toISOString()
    let token = queryToken || (intentData?.token as string) || ''
    let paystackMetadata: Record<string, any> | null = null

    // ── 2. GATEWAY VERIFICATION ──────────────────────────────────────────────
    if (hasLivePaystackSecret) {
      // Production Security: ALWAYS verify directly with Paystack API when secret key is configured.
      // Never allow ?sandbox=true or URL query parameters to bypass live gateway verification.
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
          },
          cache: 'no-store',
        }
      )

      const data = await response.json().catch(() => null)

      if (response.status >= 500 || !data) {
        return NextResponse.json(
          {
            status: 'pending',
            paymentState: 'pending',
            reference,
            token,
            message:
              'Payment provider verification is temporarily delayed. Please recheck your payment status shortly.',
          },
          { status: 502 }
        )
      }

      if (!response.ok || !data.status || !data.data) {
        const msgLower = String(data.message || '').toLowerCase()
        const isNotFound =
          response.status === 404 ||
          msgLower.includes('not found') ||
          msgLower.includes('invalid')
        return NextResponse.json(
          {
            status: isNotFound ? 'invalid_reference' : 'failed',
            paymentState: isNotFound ? 'invalid_reference' : 'failed',
            reference,
            token,
            error: isNotFound
              ? 'We could not find a valid payment transaction matching this reference.'
              : data.message || 'Transaction verification could not be completed.',
          },
          { status: 400 }
        )
      }

      paystackMetadata = data.data.metadata || null
      if (!token && paystackMetadata) {
        token =
          String(paystackMetadata.token || '') ||
          String(paystackMetadata.deliveryAccessToken || '') ||
          token
      }

      const txStatus = String(data.data.status || '').toLowerCase()

      if (['pending', 'ongoing', 'processing', 'queued'].includes(txStatus)) {
        return NextResponse.json(
          {
            status: 'pending',
            paymentState: 'pending',
            gatewayStatus: txStatus,
            reference,
            token,
            message:
              'Your payment is still being processed by your bank or mobile money provider. Please wait a moment and recheck.',
          },
          { status: 202 }
        )
      }

      if (['failed', 'abandoned', 'reversed'].includes(txStatus)) {
        return NextResponse.json(
          {
            status: 'failed',
            paymentState: 'failed',
            gatewayStatus: txStatus,
            reference,
            token,
            error:
              txStatus === 'abandoned'
                ? 'This payment session was closed before completion. No funds were charged.'
                : data.data.gateway_response ||
                  'This payment could not be completed or was declined by the payment provider.',
          },
          { status: 400 }
        )
      }

      if (txStatus !== 'success') {
        return NextResponse.json(
          {
            status: 'failed',
            paymentState: 'failed',
            gatewayStatus: txStatus,
            reference,
            token,
            error: data.message || 'Payment transaction was not successful.',
          },
          { status: 400 }
        )
      }

      amountPaid = Number(data.data.amount || 0) / 100
      if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
        return NextResponse.json(
          {
            status: 'failed',
            paymentState: 'failed',
            reference,
            token,
            error: 'Verified transaction amount is invalid.',
          },
          { status: 400 }
        )
      }

      currency = String(data.data.currency || 'GHS').toUpperCase()
      channel = String(data.data.channel || 'card')
      paidAt = data.data.paid_at || new Date().toISOString()
    } else {
      // Sandbox / Non-Live Mode (ONLY active when PAYSTACK_SECRET_KEY is not configured)
      console.log(
        `[Paystack Verify - Sandbox Mode] Processing reference ${reference} without live Paystack key.`
      )

      const intentStatus = String(intentData?.status || '').toLowerCase()
      if (intentStatus === 'pending' || reference.startsWith('LXM_PENDING_')) {
        return NextResponse.json(
          {
            status: 'pending',
            paymentState: 'pending',
            gatewayStatus: 'pending',
            reference,
            token,
            message:
              'Your payment is still being processed by your bank or mobile money provider. Please wait a moment and recheck.',
          },
          { status: 202 }
        )
      }

      if (
        intentStatus === 'failed' ||
        intentStatus === 'abandoned' ||
        reference.startsWith('LXM_FAILED_')
      ) {
        return NextResponse.json(
          {
            status: 'failed',
            paymentState: 'failed',
            gatewayStatus: intentStatus || 'failed',
            reference,
            token,
            error:
              intentData?.failureReason ||
              'This payment was not completed or was declined by the payment provider.',
          },
          { status: 400 }
        )
      }

      // Reject arbitrary/unrecognized references in sandbox mode
      if (!intentData && !reference.startsWith('LXM_')) {
        return NextResponse.json(
          {
            status: 'invalid_reference',
            paymentState: 'invalid_reference',
            reference,
            error: 'We could not find a valid payment transaction matching this reference.',
          },
          { status: 400 }
        )
      }

      if (intentData?.expectedAmount && Number(intentData.expectedAmount) > 0) {
        amountPaid = Number(intentData.expectedAmount)
      }
      if (intentData?.currency) {
        currency = String(intentData.currency).toUpperCase()
      }
    }

    // ── 3. RESOLVE ASSOCIATED PAYMENT REQUEST / ENTITY ──────────────────────
    const linksRef = adminDb.collection('clientLinks')
    let linkDoc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null =
      null
    let linkData: Record<string, any> | null = null

    if (token) {
      const linksSnapshot = await linksRef.where('token', '==', token).limit(1).get()
      if (!linksSnapshot.empty) {
        linkDoc = linksSnapshot.docs[0]
        linkData = linkDoc.data() || null
      }
    }

    const fallbackPaymentRequestId =
      paystackMetadata?.paymentRequestId || intentData?.paymentRequestId || ''
    if (!linkData && fallbackPaymentRequestId) {
      const prDoc = await linksRef.doc(fallbackPaymentRequestId).get()
      if (prDoc.exists) {
        linkDoc = prDoc
        linkData = prDoc.data() || null
        if (!token && linkData?.token) token = linkData.token
      }
    }

    // Check deliveries by accessToken if token was a delivery token
    if (!linkData && token) {
      const deliveriesSnap = await adminDb
        .collection('deliveries')
        .where('accessToken', '==', token)
        .limit(1)
        .get()
      if (!deliveriesSnap.empty) {
        const deliveryData = deliveriesSnap.docs[0].data()
        if (deliveryData.invoiceId) {
          const invLinks = await linksRef
            .where('invoiceId', '==', deliveryData.invoiceId)
            .limit(1)
            .get()
          if (!invLinks.empty) {
            linkDoc = invLinks.docs[0]
            linkData = linkDoc.data() || null
          }
        }
        if (!linkData && deliveryData.quickJobId) {
          const qjLinks = await linksRef
            .where('quickJobId', '==', deliveryData.quickJobId)
            .limit(1)
            .get()
          if (!qjLinks.empty) {
            linkDoc = qjLinks.docs[0]
            linkData = linkDoc.data() || null
          }
        }
        if (!linkData) {
          linkData = {
            invoiceId: deliveryData.invoiceId || null,
            quickJobId: deliveryData.quickJobId || null,
            projectId: deliveryData.projectId || null,
            deliveryId: deliveriesSnap.docs[0].id,
            deliveryAccessToken: deliveryData.accessToken || token,
            clientId: deliveryData.clientId || '',
            clientName: deliveryData.clientName || 'Client',
            clientEmail: deliveryData.clientEmail || '',
            projectName: deliveryData.projectName || deliveryData.title || '',
            invoiceNumber: deliveryData.invoiceNumber || '',
            status: 'Pending',
          }
        }
      }
    }

    // Check quickJobs by paymentToken or doc id (or metadata/intent quickJobId)
    const candidateQuickJobId =
      paystackMetadata?.quickJobId || intentData?.quickJobId || token || ''
    if (!linkData && candidateQuickJobId) {
      const qjByToken = await adminDb
        .collection('quickJobs')
        .where('paymentToken', '==', candidateQuickJobId)
        .limit(1)
        .get()
      if (!qjByToken.empty) {
        const qjData = qjByToken.docs[0].data()
        linkData = {
          quickJobId: qjByToken.docs[0].id,
          deliveryAccessToken: qjData.deliveryAccessToken || '',
          clientId: qjData.clientId || '',
          clientName: qjData.clientName || 'Client',
          clientEmail: qjData.clientEmail || '',
          projectName: qjData.jobDescription || qjData.title || '',
          amount:
            qjData.outstandingBalance !== undefined
              ? qjData.outstandingBalance
              : qjData.originalAgreedPrice || 0,
          currency: qjData.currency || 'GHS',
          status: 'Pending',
        }
      } else {
        const qjDoc = await adminDb.collection('quickJobs').doc(candidateQuickJobId).get()
        if (qjDoc.exists) {
          const qjData = qjDoc.data()!
          linkData = {
            quickJobId: qjDoc.id,
            deliveryAccessToken: qjData.deliveryAccessToken || '',
            clientId: qjData.clientId || '',
            clientName: qjData.clientName || 'Client',
            clientEmail: qjData.clientEmail || '',
            projectName: qjData.jobDescription || qjData.title || '',
            amount:
              qjData.outstandingBalance !== undefined
                ? qjData.outstandingBalance
                : qjData.originalAgreedPrice || 0,
            currency: qjData.currency || 'GHS',
            status: 'Pending',
          }
        }
      }
    }

    // Check invoices by paymentLinkToken or doc id (from metadata/intent)
    const candidateInvoiceId = paystackMetadata?.invoiceId || intentData?.invoiceId || ''
    if (!linkData && (token || candidateInvoiceId)) {
      if (token) {
        const invByToken = await adminDb
          .collection('invoices')
          .where('paymentLinkToken', '==', token)
          .limit(1)
          .get()
        if (!invByToken.empty) {
          const invData = invByToken.docs[0].data()
          linkData = {
            invoiceId: invByToken.docs[0].id,
            invoiceNumber: invData.invoiceNumber || '',
            projectName: invData.projectName || '',
            clientId: invData.clientId || '',
            clientName: invData.clientName || 'Client',
            clientEmail: invData.clientEmail || '',
            amount: invData.balanceDue !== undefined ? invData.balanceDue : invData.total || 0,
            currency: invData.currency || 'GHS',
            status: 'Pending',
          }
        }
      }
      if (!linkData && candidateInvoiceId) {
        const invDoc = await adminDb.collection('invoices').doc(candidateInvoiceId).get()
        if (invDoc.exists) {
          const invData = invDoc.data()!
          linkData = {
            invoiceId: invDoc.id,
            invoiceNumber: invData.invoiceNumber || '',
            projectName: invData.projectName || '',
            clientId: invData.clientId || '',
            clientName: invData.clientName || 'Client',
            clientEmail: invData.clientEmail || '',
            amount: invData.balanceDue !== undefined ? invData.balanceDue : invData.total || 0,
            currency: invData.currency || 'GHS',
            status: 'Pending',
          }
        }
      }
    }

    // Check projects by doc id
    const candidateProjectId = paystackMetadata?.projectId || intentData?.projectId || token || ''
    if (!linkData && candidateProjectId) {
      const projDoc = await adminDb.collection('projects').doc(candidateProjectId).get()
      if (projDoc.exists) {
        const pData = projDoc.data()!
        linkData = {
          projectId: projDoc.id,
          projectName: pData.name || '',
          clientId: pData.clientId || '',
          clientName: pData.clientName || 'Client',
          clientEmail: pData.clientEmail || '',
          amount:
            pData.outstandingBalance !== undefined ? pData.outstandingBalance : pData.price || 0,
          currency: pData.currency || 'GHS',
          status: 'Pending',
        }
      }
    }

    if (!linkData) {
      return NextResponse.json(
        {
          status: 'invalid_reference',
          paymentState: 'invalid_reference',
          reference,
          error: 'Invalid payment reference or associated payment link not found.',
        },
        { status: 404 }
      )
    }

    // Verify expected currency matches in live mode
    const expectedCurrency = String(linkData.currency || intentData?.currency || 'GHS').toUpperCase()
    if (hasLivePaystackSecret && currency !== expectedCurrency) {
      return NextResponse.json(
        {
          status: 'failed',
          paymentState: 'failed',
          reference,
          token,
          error: `Transaction currency (${currency}) does not match invoice currency (${expectedCurrency}).`,
        },
        { status: 400 }
      )
    }

    // Populate sandbox amount from authoritative server record if not already set from paymentIntents
    if (!hasLivePaystackSecret && amountPaid <= 0) {
      amountPaid = Number(linkData.amount || linkData.outstandingBalance || 0)
      if (amountPaid <= 0 && linkData.invoiceId) {
        const invSnap = await adminDb.collection('invoices').doc(linkData.invoiceId).get()
        if (invSnap.exists) {
          const inv = invSnap.data()!
          amountPaid = Number(inv.balanceDue !== undefined ? inv.balanceDue : inv.total || 0)
        }
      }
      if (amountPaid <= 0) {
        return NextResponse.json(
          {
            status: 'invalid_reference',
            paymentState: 'invalid_reference',
            reference,
            token,
            error: 'No payable balance was found for this payment reference.',
          },
          { status: 400 }
        )
      }
    }

    // Secondary duplicate check on clientLink
    if (linkData.status === 'Paid' && linkData.paystackReference === reference) {
      return buildIdempotentPaymentResponse(
        adminDb,
        req,
        reference,
        {
          invoiceId: linkData.invoiceId || '',
          invoiceNumber: linkData.invoiceNumber || '',
          projectId: linkData.projectId || '',
          quickJobId: linkData.quickJobId || '',
          deliveryId: linkData.deliveryId || '',
          deliveryAccessToken: linkData.deliveryAccessToken || '',
          clientName: linkData.clientName || '',
          clientEmail: linkData.clientEmail || '',
          projectName: linkData.projectName || '',
          amount: amountPaid,
          currency: currency || expectedCurrency,
          paidAt,
          channel,
          paymentToken: linkData.token || token,
        },
        token
      )
    }

    // ── 4. ATOMIC BATCH UPDATE & FINANCIAL SETTLEMENT ────────────────────────
    const batch = adminDb.batch()

    let invoiceNumber =
      linkData.invoiceNumber ||
      paystackMetadata?.invoiceNumber ||
      intentData?.invoiceNumber ||
      ''
    let projectName = linkData.projectName || ''
    let clientName =
      linkData.clientName || paystackMetadata?.clientName || intentData?.clientName || ''
    let clientEmail = linkData.clientEmail || intentData?.clientEmail || ''

    let computedTotalAmount = Number(linkData.amount || 0)
    let computedTotalPaid = amountPaid
    let computedRemainingBalance = 0
    let hasAuthoritativeBalance = false

    // 5. Update Invoice
    if (linkData.invoiceId) {
      const invoiceRef = adminDb.collection('invoices').doc(linkData.invoiceId)
      const invoiceSnap = await invoiceRef.get()
      if (invoiceSnap.exists) {
        const inv = invoiceSnap.data()!
        invoiceNumber = inv.invoiceNumber || invoiceNumber
        projectName = inv.projectName || projectName
        clientName = inv.clientName || clientName
        clientEmail = inv.clientEmail || clientEmail
        const prevPaid = Number(inv.amountPaid ?? 0)
        const invTotal = Number(inv.total ?? 0)
        const newPaid = Number((prevPaid + amountPaid).toFixed(2))
        const newBalance = Math.max(0, Number((invTotal - newPaid).toFixed(2)))
        const newStatus = newBalance <= 0.01 ? 'Paid' : 'Partially Paid'

        computedTotalAmount = invTotal
        computedTotalPaid = newPaid
        computedRemainingBalance = newBalance
        hasAuthoritativeBalance = true

        batch.update(invoiceRef, {
          status: newStatus,
          amountPaid: newPaid,
          balanceDue: newBalance,
          paystackReference: reference,
          updatedAt: FieldValue.serverTimestamp(),
          ...(newStatus === 'Paid' ? { paidAt: FieldValue.serverTimestamp() } : {}),
        })

        if (!token && inv.paymentLinkToken) {
          token = inv.paymentLinkToken
        }
      }
    }

    // 6. Update Project
    if (linkData.projectId) {
      const projectRef = adminDb.collection('projects').doc(linkData.projectId)
      const projectSnap = await projectRef.get()
      if (projectSnap.exists) {
        const proj = projectSnap.data()!
        projectName = proj.name || projectName
        clientName = proj.clientName || clientName
        clientEmail = proj.clientEmail || clientEmail
        if (!invoiceNumber) {
          invoiceNumber =
            proj.reference || `PROJ-${String(linkData.projectId).slice(0, 8).toUpperCase()}`
        }
        const projTotal = Number(proj.price ?? 0)

        const existingPmtsSnap = await adminDb
          .collection('payments')
          .where('projectId', '==', linkData.projectId)
          .where('status', '==', 'success')
          .get()
        const existingPaidFromPmts = existingPmtsSnap.docs.reduce(
          (sum, doc) => sum + (Number(doc.data().amount) || 0),
          0
        )
        const prevProjPaid = Math.max(existingPaidFromPmts, Number(proj.amountPaid || 0))
        const newProjPaid = Number((prevProjPaid + amountPaid).toFixed(2))
        const newProjBalance = Math.max(0, Number((projTotal - newProjPaid).toFixed(2)))
        const newProjPayStatus = newProjBalance <= 0.01 ? 'Paid' : 'Partially Paid'

        if (!hasAuthoritativeBalance && projTotal > 0) {
          computedTotalAmount = projTotal
          computedTotalPaid = newProjPaid
          computedRemainingBalance = newProjBalance
          hasAuthoritativeBalance = true
        }

        batch.update(projectRef, {
          amountPaid: newProjPaid,
          outstandingBalance: newProjBalance,
          paymentStatus: newProjPayStatus,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // 6.5 Update Quick Job
    let quickJobPortalToken = ''
    if (linkData.quickJobId) {
      const quickJobRef = adminDb.collection('quickJobs').doc(linkData.quickJobId)
      const qjSnap = await quickJobRef.get()
      if (qjSnap.exists) {
        const qj = qjSnap.data()!
        projectName = qj.jobDescription || qj.title || projectName
        clientName = qj.clientName || clientName
        clientEmail = qj.clientEmail || clientEmail
        quickJobPortalToken = qj.paymentToken || linkData.quickJobId
        if (!invoiceNumber) {
          invoiceNumber =
            qj.jobCode || `QJ-${String(linkData.quickJobId).slice(0, 8).toUpperCase()}`
        }
        const qjTotal = Number(qj.originalAgreedPrice ?? 0)

        const existingPmtsSnap = await adminDb
          .collection('payments')
          .where('quickJobId', '==', linkData.quickJobId)
          .where('status', '==', 'success')
          .get()
        const existingPaidFromPmts = existingPmtsSnap.docs.reduce(
          (sum, doc) => sum + (Number(doc.data().amount) || 0),
          0
        )
        const prevQjPaid = Math.max(existingPaidFromPmts, Number(qj.amountPaid || 0))
        const newQjPaid = Number((prevQjPaid + amountPaid).toFixed(2))
        const newQjBalance = Math.max(0, Number((qjTotal - newQjPaid).toFixed(2)))
        const newQjPayStatus = newQjBalance <= 0.01 ? 'Paid' : 'Partially Paid'

        if (!hasAuthoritativeBalance && qjTotal > 0) {
          computedTotalAmount = qjTotal
          computedTotalPaid = newQjPaid
          computedRemainingBalance = newQjBalance
          hasAuthoritativeBalance = true
        }

        batch.update(quickJobRef, {
          amountPaid: newQjPaid,
          outstandingBalance: newQjBalance,
          paymentStatus: newQjPayStatus,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    const isFullyPaid = hasAuthoritativeBalance
      ? computedRemainingBalance <= 0.01
      : amountPaid + 0.01 >= Number(linkData.amount || amountPaid)

    // Update ClientLink if linkDoc exists
    const requestedLinkAmount = Number(linkData.amount || 0)
    const isLinkRequestSatisfied =
      requestedLinkAmount <= 0 || amountPaid + 0.01 >= requestedLinkAmount
    if (linkDoc) {
      batch.update(linkDoc.ref, {
        status: isLinkRequestSatisfied ? 'Paid' : 'Partially Paid',
        paymentStatus: isLinkRequestSatisfied ? 'Paid' : 'Partially Paid',
        paystackReference: reference,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // 7. Update Client
    if (linkData.clientId) {
      const clientRef = adminDb.collection('clients').doc(linkData.clientId)
      const clientSnap = await clientRef.get()
      if (clientSnap.exists) {
        const cl = clientSnap.data()!
        if (!clientName) clientName = cl.name || ''
        if (!clientEmail) clientEmail = cl.email || ''
        batch.update(clientRef, {
          totalPaid: Number(((cl.totalPaid ?? 0) + amountPaid).toFixed(2)),
          outstandingBalance: Math.max(
            0,
            Number(((cl.outstandingBalance ?? 0) - amountPaid).toFixed(2))
          ),
          lastPaymentDate: FieldValue.serverTimestamp(),
          paymentCount: (cl.paymentCount ?? 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // ── 7.5 EVALUATE & UNLOCK ASSOCIATED DELIVERY (ONLY WHEN PERMITTED) ──────
    let resolvedDeliveryAccessToken =
      linkData.deliveryAccessToken ||
      paystackMetadata?.deliveryAccessToken ||
      intentData?.deliveryAccessToken ||
      ''
    let deliveryDocToUnlock:
      | FirebaseFirestore.DocumentSnapshot
      | FirebaseFirestore.QueryDocumentSnapshot
      | null = null

    const targetDeliveryId =
      linkData.deliveryId || paystackMetadata?.deliveryId || intentData?.deliveryId || ''
    if (targetDeliveryId) {
      const dRef = adminDb.collection('deliveries').doc(targetDeliveryId)
      const dSnap = await dRef.get()
      if (dSnap.exists) {
        deliveryDocToUnlock = dSnap
        resolvedDeliveryAccessToken = dSnap.data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && linkData.invoiceId) {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('invoiceId', '==', linkData.invoiceId)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocToUnlock = dSnap.docs[0]
        resolvedDeliveryAccessToken = dSnap.docs[0].data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && linkData.quickJobId) {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('quickJobId', '==', linkData.quickJobId)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocToUnlock = dSnap.docs[0]
        resolvedDeliveryAccessToken = dSnap.docs[0].data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && linkData.projectId) {
      const dSnap = await adminDb
        .collection('deliveries')
        .where('projectId', '==', linkData.projectId)
        .limit(1)
        .get()
      if (!dSnap.empty) {
        deliveryDocToUnlock = dSnap.docs[0]
        resolvedDeliveryAccessToken = dSnap.docs[0].data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    const deliveryDocData = deliveryDocToUnlock?.data() || null
    if (deliveryDocData && !projectName) {
      projectName = deliveryDocData.projectName || deliveryDocData.title || ''
    }

    const deliveryRequiresFullPayment = deliveryDocData
      ? deliveryDocData.requiresFullPayment !== false
      : true
    const deliveryAlreadyReleased = Boolean(deliveryDocData?.isReleased)
    const shouldUnlockDeliverables =
      isFullyPaid || !deliveryRequiresFullPayment || deliveryAlreadyReleased

    if (deliveryDocToUnlock) {
      if (shouldUnlockDeliverables) {
        batch.update(deliveryDocToUnlock.ref, {
          isReleased: true,
          status: 'Delivered',
          amountPaid: computedTotalPaid,
          remainingBalance: computedRemainingBalance,
          releasedAt: FieldValue.serverTimestamp(),
          releasedBy: 'payment_verified',
          unlockedAt: FieldValue.serverTimestamp(),
          unlockedBy: 'paystack_verification',
          paystackReference: reference,
          updatedAt: FieldValue.serverTimestamp(),
        })

        const deliveryActivityRef = adminDb.collection('activityLogs').doc()
        batch.set(deliveryActivityRef, {
          event: 'delivery_unlocked',
          description: `Deliverables automatically unlocked following verified payment of ${currency} ${amountPaid.toLocaleString()}`,
          entityId: deliveryDocToUnlock.id,
          entityType: 'delivery',
          clientId: linkData.clientId || '',
          clientName: clientName || '',
          projectId: linkData.projectId || '',
          quickJobId: linkData.quickJobId || '',
          performedBy: 'system',
          metadata: { reference, amountPaid, deliveryAccessToken: resolvedDeliveryAccessToken },
          createdAt: FieldValue.serverTimestamp(),
        })
      } else {
        // Partial payment received on a full-payment-gated delivery: update financials ONLY, keep locked
        batch.update(deliveryDocToUnlock.ref, {
          amountPaid: computedTotalPaid,
          remainingBalance: computedRemainingBalance,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // Resolve best payment/receipt portal token
    const resolvedPaymentToken =
      (linkDoc?.data()?.token as string) ||
      linkData.token ||
      token ||
      linkData.invoiceId ||
      linkData.projectId ||
      linkData.quickJobId ||
      ''

    const receiptNumber = formatReceiptNumber(reference)

    // 8. Create Payment Record
    const paymentRef = adminDb.collection('payments').doc()
    const paymentId = paymentRef.id
    batch.set(paymentRef, {
      invoiceId: linkData.invoiceId || '',
      invoiceNumber,
      clientId: linkData.clientId || '',
      clientName,
      clientEmail,
      projectId: linkData.projectId || '',
      projectName,
      quickJobId: linkData.quickJobId || '',
      paymentRequestId: linkDoc?.id || linkData?.id || fallbackPaymentRequestId || '',
      paymentToken: resolvedPaymentToken,
      deliveryId: deliveryDocToUnlock?.id || linkData.deliveryId || '',
      deliveryAccessToken: resolvedDeliveryAccessToken,
      paystackReference: reference,
      reference,
      receiptNumber,
      amount: amountPaid,
      totalAmount: computedTotalAmount,
      totalPaid: computedTotalPaid,
      remainingBalance: computedRemainingBalance,
      isFullyPaid,
      currency: currency || expectedCurrency || 'GHS',
      channel,
      paymentMethod: channel,
      paidAt: paidAt || new Date().toISOString(),
      status: 'success',
      verificationStatus: 'verified',
      source: 'verify',
      createdAt: FieldValue.serverTimestamp(),
    })

    // Mark server paymentIntent verified if present
    if (intentData) {
      batch.set(
        adminDb.collection('paymentIntents').doc(reference),
        {
          status: 'verified',
          verifiedAt: new Date().toISOString(),
          paymentId,
        },
        { merge: true }
      )
    }

    // 9. Create Activity Log
    const activityRef = adminDb.collection('activityLogs').doc()
    batch.set(activityRef, {
      event: 'payment_completed',
      description: `Payment of ${currency || 'GHS'} ${amountPaid.toLocaleString()} received${invoiceNumber ? ` for Invoice #${invoiceNumber}` : ''}`,
      entityId: linkData.invoiceId || paymentId,
      entityType: 'payment',
      clientId: linkData.clientId || '',
      clientName,
      projectId: linkData.projectId || '',
      quickJobId: linkData.quickJobId || '',
      performedBy: 'system',
      metadata: { reference, channel, amount: amountPaid, currency, isFullyPaid },
      createdAt: FieldValue.serverTimestamp(),
    })

    // 10. Create In-App Notification
    const notifRef = adminDb.collection('notifications').doc()
    const amountFormatted = `GH₵${amountPaid.toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    batch.set(notifRef, {
      type: 'payment_received',
      title: 'Payment Received',
      message: `${clientName || 'A client'} paid ${amountFormatted}${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}.`,
      isRead: false,
      clientId: linkData.clientId || '',
      clientName,
      invoiceId: linkData.invoiceId || '',
      invoiceNumber,
      projectId: linkData.projectId || '',
      quickJobId: linkData.quickJobId || '',
      paymentId,
      amount: amountPaid,
      currency: currency || 'GHS',
      paystackReference: reference,
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    const canAccessDeliverables = Boolean(
      resolvedDeliveryAccessToken && shouldUnlockDeliverables
    )
    const lockedDeliveryExists = Boolean(
      resolvedDeliveryAccessToken && !shouldUnlockDeliverables
    )
    const safeDeliveryToken = canAccessDeliverables ? resolvedDeliveryAccessToken : ''

    // ── 11. DISPATCH BREVO PAYMENT CONFIRMED EMAIL (ONLY WHEN DELIVERABLES UNLOCKED) ──
    if (canAccessDeliverables && safeDeliveryToken) {
      try {
        let recipientEmail = clientEmail || ''
        if (!recipientEmail && linkData.clientId) {
          const cSnap = await adminDb.collection('clients').doc(linkData.clientId).get()
          if (cSnap.exists) recipientEmail = cSnap.data()?.email || ''
        }

        if (recipientEmail) {
          const deliveryUrl = buildDeliveryUrl(safeDeliveryToken, req)
          const lexmediaLogoUrl = await resolvePublicEmailLogo(adminDb)

          await sendPaymentConfirmedDeliveryEmail({
            toEmail: recipientEmail,
            clientName: clientName || 'Valued Client',
            projectName: projectName || 'Your LexMedia Project',
            deliveryUrl,
            amountPaid,
            invoiceNumber,
            lexmediaLogoUrl,
          })
          console.log(`[Verify] Payment confirmation email sent to ${recipientEmail}`)
        }
      } catch (emailErr) {
        console.warn('[Verify] Post-payment confirmation email warning (non-blocking):', emailErr)
      }
    }

    const finalDeliveryUrl = safeDeliveryToken ? buildDeliveryUrl(safeDeliveryToken, req) : null

    return NextResponse.json({
      status: 'success',
      paymentState: 'success',
      reference,
      receiptNumber,
      amount: amountPaid,
      currency: currency || 'GHS',
      paidAt,
      channel,
      invoiceId: linkData.invoiceId || '',
      invoiceNumber,
      projectName,
      clientName,
      clientEmail,
      paymentStatus: isFullyPaid ? 'Paid' : 'Partially Paid',
      totalAmount: computedTotalAmount,
      totalPaid: computedTotalPaid,
      remainingBalance: computedRemainingBalance,
      isFullyPaid,
      token: resolvedPaymentToken,
      canAccessDeliverables,
      lockedDeliveryExists,
      deliveryAccessToken: safeDeliveryToken,
      deliveryUrl: finalDeliveryUrl,
      quickJobPortalToken: isFullyPaid ? quickJobPortalToken : '',
    })
  } catch (error: any) {
    console.error('Paystack verification error:', error)
    return NextResponse.json(
      {
        status: 'error',
        paymentState: 'failed',
        error: 'Unable to verify payment status at this moment. Please retry shortly.',
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
