import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const reference = searchParams.get('reference')
    const token = searchParams.get('token')

    if (!reference) {
      return NextResponse.json({ error: 'Missing transaction reference' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: 'Missing payment link token' }, { status: 400 })
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY
    if (!paystackSecret || paystackSecret.includes('xxxxxxxx')) {
      return NextResponse.json({ error: 'Paystack Secret Key is not configured correctly on the server.' }, { status: 500 })
    }

    // 1. Verify with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
        },
      }
    )
    const data = await response.json()

    if (!response.ok || !data.status || data.data?.status !== 'success') {
      console.error('Paystack transaction was not successful:', data)
      return NextResponse.json({ error: data.message || 'Transaction was not successful' }, { status: 400 })
    }

    const amountPaid = data.data.amount / 100
    const currency = data.data.currency
    const channel = data.data.channel || 'card'
    const paidAt = data.data.paid_at || new Date().toISOString()

    const adminDb = getAdminDb()

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────
    const existingPayments = await adminDb
      .collection('payments')
      .where('paystackReference', '==', reference)
      .limit(1)
      .get()

    if (!existingPayments.empty) {
      console.log(`[Verify] Reference ${reference} already processed — skipping`)
      return NextResponse.json({
        status: 'success',
        message: 'Transaction already verified and processed',
        reference,
      })
    }
    // ─────────────────────────────────────────────────────────

    // 2. Look up the ClientLink by token
    const linksRef = adminDb.collection('clientLinks')
    const linksSnapshot = await linksRef.where('token', '==', token).limit(1).get()

    if (linksSnapshot.empty) {
      return NextResponse.json({ error: 'Invalid payment link' }, { status: 404 })
    }

    const linkDoc = linksSnapshot.docs[0]
    const linkData = linkDoc.data()

    // 3. Secondary duplicate check
    if (linkData.status === 'Paid' && linkData.paystackReference === reference) {
      return NextResponse.json({
        status: 'success',
        message: 'Transaction already verified and processed',
        reference,
      })
    }

    // 4. Build the batch
    const batch = adminDb.batch()

    // Update ClientLink
    batch.update(linkDoc.ref, {
      status: 'Paid',
      paymentStatus: 'Paid',
      paystackReference: reference,
      updatedAt: FieldValue.serverTimestamp(),
    })

    let invoiceNumber = linkData.invoiceNumber || ''

    // 5. Update Invoice
    if (linkData.invoiceId) {
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
          status: newStatus,
          amountPaid: newPaid,
          balanceDue: newBalance,
          paystackReference: reference,
          updatedAt: FieldValue.serverTimestamp(),
          ...(newStatus === 'Paid' ? { paidAt: FieldValue.serverTimestamp() } : {}),
        })
      }
    }

    // 6. Update Project
    if (linkData.projectId) {
      const projectRef = adminDb.collection('projects').doc(linkData.projectId)
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

    // 7. Update Client
    if (linkData.clientId) {
      const clientRef = adminDb.collection('clients').doc(linkData.clientId)
      const clientSnap = await clientRef.get()
      if (clientSnap.exists) {
        const cl = clientSnap.data()!
        batch.update(clientRef, {
          totalPaid: (cl.totalPaid ?? 0) + amountPaid,
          outstandingBalance: Math.max(0, (cl.outstandingBalance ?? 0) - amountPaid),
          lastPaymentDate: FieldValue.serverTimestamp(),
          paymentCount: (cl.paymentCount ?? 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    // 8. Create Payment Record
    const paymentRef = adminDb.collection('payments').doc()
    const paymentId = paymentRef.id
    batch.set(paymentRef, {
      invoiceId: linkData.invoiceId || '',
      invoiceNumber,
      clientId: linkData.clientId || '',
      clientName: linkData.clientName || '',
      projectId: linkData.projectId || '',
      paystackReference: reference,
      amount: amountPaid,
      currency: currency || linkData.currency || 'GHS',
      channel,
      paymentMethod: channel,
      paidAt: paidAt || new Date().toISOString(),
      status: 'success',
      source: 'verify',
      createdAt: FieldValue.serverTimestamp(),
    })

    // 9. Create Activity Log
    const activityRef = adminDb.collection('activityLogs').doc()
    batch.set(activityRef, {
      event: 'payment_completed',
      description: `Payment of ${currency || 'GHS'} ${amountPaid.toLocaleString()} received${invoiceNumber ? ` for Invoice #${invoiceNumber}` : ''}`,
      entityId: linkData.invoiceId || paymentId,
      entityType: 'payment',
      clientId: linkData.clientId || '',
      clientName: linkData.clientName || '',
      projectId: linkData.projectId || '',
      performedBy: 'system',
      metadata: { reference, channel, amount: amountPaid, currency },
      createdAt: FieldValue.serverTimestamp(),
    })

    // 10. Create In-App Notification
    const notifRef = adminDb.collection('notifications').doc()
    const amountFormatted = `GH₵${amountPaid.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    batch.set(notifRef, {
      type: 'payment_received',
      title: 'Payment Received',
      message: `${linkData.clientName || 'A client'} paid ${amountFormatted}${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}.`,
      isRead: false,
      clientId: linkData.clientId || '',
      clientName: linkData.clientName || '',
      invoiceId: linkData.invoiceId || '',
      invoiceNumber,
      projectId: linkData.projectId || '',
      paymentId,
      amount: amountPaid,
      currency: currency || 'GHS',
      paystackReference: reference,
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return NextResponse.json({
      status: 'success',
      reference,
      amount: amountPaid,
    })
  } catch (error: any) {
    console.error('Paystack verification error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to verify transaction' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
