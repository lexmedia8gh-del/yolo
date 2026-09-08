import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

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
    const token = metadata.token || ''

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

    // Build the batch
    const batch = adminDb.batch()

    // Update ClientLink if found
    if (linkRef && linkData) {
      batch.update(linkRef, {
        status: 'Paid',
        paymentStatus: 'Paid',
        paystackReference: reference,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // Update Invoice
    let invoiceNumber = linkData?.invoiceNumber || ''
    let clientName = linkData?.clientName || txData?.customer?.name || ''
    let clientId = linkData?.clientId || ''
    let projectId = linkData?.projectId || ''

    if (linkData?.invoiceId) {
      const invoiceRef = adminDb.collection('invoices').doc(linkData.invoiceId)
      const invoiceSnap = await invoiceRef.get()
      if (invoiceSnap.exists) {
        const inv = invoiceSnap.data()!
        invoiceNumber = inv.invoiceNumber || invoiceNumber
        const prevPaid = inv.amountPaid ?? 0
        const invTotal = inv.total ?? 0
        const newPaid = prevPaid + amountPaid
        const newBalance = Math.max(0, invTotal - newPaid)
        const newStatus = newPaid >= invTotal ? 'Paid' : 'Partially Paid'
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
        const projTotal = proj.price ?? 0
        const prevProjPaid = proj.amountPaid ?? 0
        const newProjPaid = prevProjPaid + amountPaid
        const newProjBalance = Math.max(0, projTotal - newProjPaid)
        const newProjPayStatus = newProjPaid >= projTotal ? 'Paid' : 'Partially Paid'
        batch.update(projectRef, {
          amountPaid: newProjPaid,
          outstandingBalance: newProjBalance,
          paymentStatus: newProjPayStatus,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // Update Client
    if (clientId) {
      const clientRef = adminDb.collection('clients').doc(clientId)
      const clientSnap = await clientRef.get()
      if (clientSnap.exists) {
        const cl = clientSnap.data()!
        const newClientPaid = (cl.totalPaid ?? 0) + amountPaid
        const newClientOutstanding = Math.max(0, (cl.outstandingBalance ?? 0) - amountPaid)
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

    // Create Payment Record
    const paymentRef = adminDb.collection('payments').doc()
    const paymentId = paymentRef.id
    batch.set(paymentRef, {
      invoiceId: linkData?.invoiceId || '',
      invoiceNumber,
      clientId,
      clientName,
      projectId,
      paystackReference: reference,
      amount: amountPaid,
      currency,
      channel,
      paymentMethod: channel,
      paidAt: paidAt ? new Date(paidAt).toISOString() : FieldValue.serverTimestamp(),
      status: 'success',
      source: 'webhook',
      createdAt: FieldValue.serverTimestamp(),
    })

    // Create Activity Log
    const activityRef = adminDb.collection('activityLogs').doc()
    batch.set(activityRef, {
      event: 'payment_completed',
      description: `Payment of ${currency} ${amountPaid.toLocaleString()} received${invoiceNumber ? ` for Invoice #${invoiceNumber}` : ''}`,
      entityId: linkData?.invoiceId || paymentId,
      entityType: 'payment',
      clientId,
      clientName,
      projectId,
      performedBy: 'system',
      metadata: { reference, channel, amount: amountPaid, currency },
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
      invoiceId: linkData?.invoiceId || '',
      invoiceNumber,
      projectId,
      paymentId,
      amount: amountPaid,
      currency,
      paystackReference: reference,
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    console.log(`[Webhook] ✅ Payment processed: ${reference} — ${currency} ${amountPaid} from ${clientName}`)

    return NextResponse.json({ received: true, success: true })
  } catch (error: any) {
    console.error('[Webhook] Unhandled error:', error?.message)
    // Return 200 to prevent Paystack from retrying (we'll investigate via logs)
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 })
  }
}
