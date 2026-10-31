import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { buildDeliveryUrl } from '@/lib/utils'
import { sendPaymentConfirmedDeliveryEmail } from '@/lib/services/brevo'

export const dynamic = 'force-dynamic'

// Must read raw body for HMAC validation
export async function POST(req: NextRequest) {
  try {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY
    if (!paystackSecret || paystackSecret.includes('xxxxxxxx')) {
      console.warn('[Webhook] PAYSTACK_SECRET_KEY not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    // Read raw body as text for HMAC
    const rawBody = await req.text()
    const signature = req.headers.get('x-paystack-signature') || ''

    // Validate HMAC-SHA512 signature
    const expectedSig = crypto
      .createHmac('sha512', paystackSecret)
      .update(rawBody)
      .digest('hex')

    if (signature !== expectedSig) {
      console.warn('[Webhook] Invalid Paystack signature — possible spoofed request')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: any
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Only process charge.success events
    if (event.event !== 'charge.success') {
      // Acknowledge other events without processing
      return NextResponse.json({ received: true })
    }

    const txData = event.data
    const reference = txData?.reference
    const amountPaid = (txData?.amount || 0) / 100 // Convert kobo/pesewas to main unit
    const currency = txData?.currency || 'GHS'
    const channel = txData?.channel || 'card'
    const paidAt = txData?.paid_at || new Date().toISOString()

    // Extract metadata — token is stored in metadata.token on initialize
    const metadata = txData?.metadata || {}
    const token = metadata.token || metadata.deliveryAccessToken || ''
    const metadataDeliveryId = metadata.deliveryId || ''
    const metadataInvoiceId = metadata.invoiceId || ''
    const metadataQuickJobId = metadata.quickJobId || ''
    const metadataProjectId = metadata.projectId || ''

    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // ── IDEMPOTENCY CHECK ──────────────────────────────────────────────
    // If a payment with this reference was already recorded, skip processing
    const existingPayments = await adminDb
      .collection('payments')
      .where('paystackReference', '==', reference)
      .limit(1)
      .get()

    if (!existingPayments.empty) {
      console.log(`[Webhook] Reference ${reference} already processed — skipping`)
      return NextResponse.json({ received: true, duplicate: true })
    }
    // ─────────────────────────────────────────────────────────────────

    // Look up the ClientLink by token
    let linkData: any = null
    let linkRef: any = null

    if (token) {
      const linksSnap = await adminDb
        .collection('clientLinks')
        .where('token', '==', token)
        .limit(1)
        .get()

      if (!linksSnap.empty) {
        linkRef = linksSnap.docs[0].ref
        linkData = linksSnap.docs[0].data()
      }
    }

    // If no clientLink by token, try matching by reference (if link was already partially updated)
    if (!linkData && reference) {
      const linksSnap2 = await adminDb
        .collection('clientLinks')
        .where('paystackReference', '==', reference)
        .limit(1)
        .get()
      if (!linksSnap2.empty) {
        linkRef = linksSnap2.docs[0].ref
        linkData = linksSnap2.docs[0].data()
      }
    }

    // If still no clientLink, try by paymentRequestId from metadata
    if (!linkData && metadata.paymentRequestId) {
      const prDoc = await adminDb.collection('clientLinks').doc(metadata.paymentRequestId).get()
      if (prDoc.exists) {
        linkRef = prDoc.ref
        linkData = prDoc.data()
      }
    }

    // Build the batch
    const batch = adminDb.batch()

    let invoiceNumber = linkData?.invoiceNumber || metadata.invoiceNumber || ''
    let clientName = linkData?.clientName || metadata.clientName || txData?.customer?.name || ''
    let clientEmail = linkData?.clientEmail || txData?.customer?.email || ''
    let clientId = linkData?.clientId || metadata.clientId || ''
    let projectId = linkData?.projectId || metadataProjectId || ''
    let quickJobId = linkData?.quickJobId || metadataQuickJobId || ''
    let projectName = linkData?.projectName || ''
    const invoiceId = linkData?.invoiceId || metadataInvoiceId || ''

    let computedTotalAmount = Number(linkData?.amount || amountPaid)
    let computedTotalPaid = amountPaid
    let computedRemainingBalance = 0
    let hasAuthoritativeBalance = false

    // Update Invoice
    if (invoiceId) {
      const invoiceRef = adminDb.collection('invoices').doc(invoiceId)
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
          amountPaid: newPaid,
          balanceDue: newBalance,
          status: newStatus,
          paystackReference: reference,
          updatedAt: FieldValue.serverTimestamp(),
          ...(newStatus === 'Paid' ? { paidAt: FieldValue.serverTimestamp() } : {}),
        })
      }
    }

    // Update Project
    if (projectId) {
      const projectRef = adminDb.collection('projects').doc(projectId)
      const projectSnap = await projectRef.get()
      if (projectSnap.exists) {
        const proj = projectSnap.data()!
        projectName = proj.name || projectName
        clientName = proj.clientName || clientName
        clientEmail = proj.clientEmail || clientEmail
        if (!invoiceNumber) {
          invoiceNumber = proj.reference || `PROJ-${String(projectId).slice(0, 8).toUpperCase()}`
        }
        const projTotal = Number(proj.price ?? 0)

        const existingPmtsSnap = await adminDb
          .collection('payments')
          .where('projectId', '==', projectId)
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

    // Update Quick Job
    if (quickJobId) {
      const quickJobRef = adminDb.collection('quickJobs').doc(quickJobId)
      const qjSnap = await quickJobRef.get()
      if (qjSnap.exists) {
        const qj = qjSnap.data()!
        projectName = qj.jobDescription || qj.title || projectName
        clientName = qj.clientName || clientName
        clientEmail = qj.clientEmail || clientEmail
        if (!invoiceNumber) {
          invoiceNumber = qj.jobCode || `QJ-${String(quickJobId).slice(0, 8).toUpperCase()}`
        }
        const qjTotal = Number(qj.originalAgreedPrice ?? 0)

        const existingPmtsSnap = await adminDb
          .collection('payments')
          .where('quickJobId', '==', quickJobId)
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
      : amountPaid + 0.01 >= Number(linkData?.amount || amountPaid)

    // Update ClientLink if found
    if (linkRef && linkData) {
      const requestedLinkAmount = Number(linkData.amount || 0)
      const isLinkSatisfied = requestedLinkAmount <= 0 || amountPaid + 0.01 >= requestedLinkAmount
      batch.update(linkRef, {
        status: isLinkSatisfied ? 'Paid' : 'Partially Paid',
        paymentStatus: isLinkSatisfied ? 'Paid' : 'Partially Paid',
        paystackReference: reference,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // Update Client
    if (clientId) {
      const clientRef = adminDb.collection('clients').doc(clientId)
      const clientSnap = await clientRef.get()
      if (clientSnap.exists) {
        const cl = clientSnap.data()!
        if (!clientName) clientName = cl.name || ''
        if (!clientEmail) clientEmail = cl.email || ''
        const newClientPaid = Number(((cl.totalPaid ?? 0) + amountPaid).toFixed(2))
        const newClientOutstanding = Math.max(
          0,
          Number(((cl.outstandingBalance ?? 0) - amountPaid).toFixed(2))
        )
        const prevPaymentCount = cl.paymentCount ?? 0
        batch.update(clientRef, {
          totalPaid: newClientPaid,
          outstandingBalance: newClientOutstanding,
          lastPaymentDate: FieldValue.serverTimestamp(),
          paymentCount: prevPaymentCount + 1,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // ── UNLOCK ASSOCIATED DELIVERY (ONLY WHEN PERMITTED) ──────────────────
    let resolvedDeliveryAccessToken = linkData?.deliveryAccessToken || metadata.deliveryAccessToken || ''
    let deliveryDocToUnlock: any = null

    const targetDeliveryId = linkData?.deliveryId || metadataDeliveryId
    if (targetDeliveryId) {
      const dRef = adminDb.collection('deliveries').doc(targetDeliveryId)
      const dSnap = await dRef.get()
      if (dSnap.exists) {
        deliveryDocToUnlock = dSnap
        resolvedDeliveryAccessToken = dSnap.data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && invoiceId) {
      const dSnap = await adminDb.collection('deliveries').where('invoiceId', '==', invoiceId).limit(1).get()
      if (!dSnap.empty) {
        deliveryDocToUnlock = dSnap.docs[0]
        resolvedDeliveryAccessToken = dSnap.docs[0].data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && quickJobId) {
      const dSnap = await adminDb.collection('deliveries').where('quickJobId', '==', quickJobId).limit(1).get()
      if (!dSnap.empty) {
        deliveryDocToUnlock = dSnap.docs[0]
        resolvedDeliveryAccessToken = dSnap.docs[0].data()?.accessToken || resolvedDeliveryAccessToken
      }
    }

    if (!deliveryDocToUnlock && projectId) {
      const dSnap = await adminDb.collection('deliveries').where('projectId', '==', projectId).limit(1).get()
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
          unlockedBy: 'paystack_webhook',
          paystackReference: reference,
          updatedAt: FieldValue.serverTimestamp(),
        })

        const deliveryActivityRef = adminDb.collection('activityLogs').doc()
        batch.set(deliveryActivityRef, {
          event: 'delivery_unlocked',
          description: `Deliverables automatically unlocked following verified payment of ${currency} ${amountPaid.toLocaleString()}`,
          entityId: deliveryDocToUnlock.id,
          entityType: 'delivery',
          clientId,
          clientName,
          projectId,
          quickJobId,
          performedBy: 'system',
          metadata: { reference, amountPaid, deliveryAccessToken: resolvedDeliveryAccessToken },
          createdAt: FieldValue.serverTimestamp(),
        })
      } else {
        batch.update(deliveryDocToUnlock.ref, {
          amountPaid: computedTotalPaid,
          remainingBalance: computedRemainingBalance,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    const resolvedPaymentToken =
      linkData?.token || token || invoiceId || projectId || quickJobId || ''
    const receiptClean = reference.replace(/^LXM_/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    const receiptNumber = `RCP-${receiptClean.slice(-10) || '000001'}`

    // Create Payment Record
    const paymentRef = adminDb.collection('payments').doc()
    const paymentId = paymentRef.id
    batch.set(paymentRef, {
      invoiceId,
      invoiceNumber,
      clientId,
      clientName,
      clientEmail,
      projectId,
      projectName,
      quickJobId,
      paymentRequestId: metadata.paymentRequestId || linkRef?.id || linkData?.id || token || '',
      paymentToken: resolvedPaymentToken,
      deliveryId: deliveryDocToUnlock?.id || targetDeliveryId || '',
      deliveryAccessToken: resolvedDeliveryAccessToken,
      paystackReference: reference,
      reference,
      receiptNumber,
      amount: amountPaid,
      totalAmount: computedTotalAmount,
      totalPaid: computedTotalPaid,
      remainingBalance: computedRemainingBalance,
      isFullyPaid,
      currency,
      channel,
      paymentMethod: channel,
      paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
      status: 'success',
      verificationStatus: 'verified',
      source: 'webhook',
      createdAt: FieldValue.serverTimestamp(),
    })

    // Create Activity Log
    const activityRef = adminDb.collection('activityLogs').doc()
    batch.set(activityRef, {
      event: 'payment_completed',
      description: `Payment of ${currency} ${amountPaid.toLocaleString()} received${invoiceNumber ? ` for Invoice #${invoiceNumber}` : ''}`,
      entityId: invoiceId || paymentId,
      entityType: 'payment',
      clientId,
      clientName,
      projectId,
      quickJobId,
      performedBy: 'system',
      metadata: { reference, channel, amount: amountPaid, currency, isFullyPaid },
      createdAt: FieldValue.serverTimestamp(),
    })

    // Create Notification
    const notifRef = adminDb.collection('notifications').doc()
    const amountFormatted = `GH₵${amountPaid.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    batch.set(notifRef, {
      type: 'payment_received',
      title: 'Payment Received',
      message: `${clientName || 'A client'} paid ${amountFormatted}${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}.`,
      isRead: false,
      clientId,
      clientName,
      invoiceId,
      invoiceNumber,
      projectId,
      quickJobId,
      paymentId,
      amount: amountPaid,
      currency,
      paystackReference: reference,
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    console.log(`[Webhook] Payment processed: ${reference} — ${currency} ${amountPaid} from ${clientName}`)

    // ── DISPATCH BREVO CONFIRMATION EMAIL (ONLY WHEN DELIVERABLES UNLOCKED) ──
    if (resolvedDeliveryAccessToken && shouldUnlockDeliverables) {
      try {
        let recipientEmail = clientEmail || ''
        if (!recipientEmail && clientId) {
          const cSnap = await adminDb.collection('clients').doc(clientId).get()
          if (cSnap.exists) recipientEmail = cSnap.data()?.email || ''
        }

        if (recipientEmail) {
          const deliveryUrl = buildDeliveryUrl(resolvedDeliveryAccessToken, req)

          let lexmediaLogoUrl = ''
          const bSnap = await adminDb.collection('settings').doc('branding').get()
          if (bSnap.exists) lexmediaLogoUrl = bSnap.data()?.logoUrl || ''

          await sendPaymentConfirmedDeliveryEmail({
            toEmail: recipientEmail,
            clientName: clientName || 'Valued Client',
            projectName: projectName || 'Your LexMedia Project',
            deliveryUrl,
            amountPaid,
            invoiceNumber,
            lexmediaLogoUrl,
          })
          console.log(`[Webhook] Confirmation email sent to ${recipientEmail}`)
        }
      } catch (emailErr) {
        console.warn('[Webhook] Post-payment confirmation email warning (non-blocking):', emailErr)
      }
    }

    return NextResponse.json({ received: true, success: true })
  } catch (error: any) {
    console.error('[Webhook] Unhandled error:', error?.message)
    // Return 200 to prevent Paystack from retrying (we'll investigate via logs)
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 })
  }
}

