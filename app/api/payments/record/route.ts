import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/record
 * Records a client deposit or payment manually in Ctrl Room.
 * Atomically updates the payment collection, client balances, invoice status,
 * project payment status, activity logs, and in-app notifications.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const {
      clientId,
      clientName,
      projectId,
      projectName,
      invoiceId,
      invoiceNumber,
      amount,
      currency = 'GHS',
      paymentType = 'payment', // 'deposit' | 'payment' | 'part_payment' | 'milestone'
      isDeposit = false,
      channel = 'Mobile Money', // 'Mobile Money' | 'Bank Transfer' | 'Cash' | 'Card' | 'Cheque' | 'POS' | 'Other'
      reference,
      paidAt,
      status = 'success',
      notes = '',
    } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client is required to record a payment' }, { status: 400 })
    }

    const parsedAmount = Number(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Valid payment amount is required' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const batch = adminDb.batch()

    // Determine actual deposit flag
    const effectiveIsDeposit = Boolean(isDeposit || paymentType === 'deposit')

    // Generate unique reference if not provided
    const prefix = effectiveIsDeposit ? 'DEP' : 'PAY'
    const cleanRef = reference?.trim() || `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`

    const paymentDate = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString()
    const recordedBy = auth.email || 'admin'

    // 1. Fetch Client info to verify and update balance
    const clientRef = adminDb.collection(COLLECTIONS.CLIENTS).doc(clientId)
    const clientSnap = await clientRef.get()
    if (!clientSnap.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    const clientData = clientSnap.data()!
    const resolvedClientName = clientName || clientData.fullName || clientData.name || 'Client'

    // 2. Fetch Invoice if linked
    let invoiceData: any = null
    let invoiceRef: any = null
    let resolvedInvoiceNumber = invoiceNumber || ''
    if (invoiceId) {
      invoiceRef = adminDb.collection(COLLECTIONS.INVOICES).doc(invoiceId)
      const invoiceSnap = await invoiceRef.get()
      if (invoiceSnap.exists) {
        invoiceData = invoiceSnap.data()!
        resolvedInvoiceNumber = invoiceData.invoiceNumber || resolvedInvoiceNumber
      }
    }

    // 3. Fetch Project if linked
    let projectData: any = null
    let projectRef: any = null
    let resolvedProjectName = projectName || ''
    if (projectId) {
      projectRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId)
      const projectSnap = await projectRef.get()
      if (projectSnap.exists) {
        projectData = projectSnap.data()!
        resolvedProjectName = projectData.name || resolvedProjectName
      }
    }

    // 4. Create Payment Document
    const paymentRef = adminDb.collection(COLLECTIONS.PAYMENTS).doc()
    const paymentId = paymentRef.id

    const paymentPayload: Record<string, any> = {
      invoiceId: invoiceId || '',
      invoiceNumber: resolvedInvoiceNumber,
      clientId,
      clientName: resolvedClientName,
      projectId: projectId || '',
      projectName: resolvedProjectName,
      paystackReference: cleanRef,
      reference: cleanRef,
      amount: parsedAmount,
      currency,
      paymentType: effectiveIsDeposit ? 'deposit' : paymentType,
      isDeposit: effectiveIsDeposit,
      paymentMethod: channel,
      channel,
      paidAt: paymentDate,
      status, // 'success' | 'pending' | 'failed'
      source: 'manual',
      notes: notes.trim(),
      recordedBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    batch.set(paymentRef, paymentPayload)

    // Only update financial balances if payment is 'success' (completed)
    if (status === 'success') {
      // 5. Update Client Balances
      const currentTotalPaid = Number(clientData.totalPaid || 0)
      const currentOutstanding = Number(clientData.outstandingBalance || 0)
      const newClientTotalPaid = currentTotalPaid + parsedAmount
      const newClientOutstanding = Math.max(0, currentOutstanding - parsedAmount)

      batch.update(clientRef, {
        totalPaid: newClientTotalPaid,
        outstandingBalance: newClientOutstanding,
        lastPaymentDate: FieldValue.serverTimestamp(),
        paymentCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })

      // 6. Update Invoice Balances if linked
      if (invoiceRef && invoiceData) {
        const invTotal = Number(invoiceData.total || 0)
        const invCurrentPaid = Number(invoiceData.amountPaid || 0)
        const newInvPaid = invCurrentPaid + parsedAmount
        const newInvBalance = Math.max(0, invTotal - newInvPaid)
        const newInvStatus = newInvBalance <= 0 ? 'Paid' : 'Partially Paid'

        const invUpdates: Record<string, any> = {
          amountPaid: newInvPaid,
          balanceDue: newInvBalance,
          status: newInvStatus,
          updatedAt: FieldValue.serverTimestamp(),
        }
        if (newInvStatus === 'Paid') {
          invUpdates.paidAt = FieldValue.serverTimestamp()
        }
        batch.update(invoiceRef, invUpdates)
      }

      // 7. Update Project Balances if linked
      if (projectRef && projectData) {
        const projPrice = Number(projectData.price || 0)
        const projCurrentPaid = Number(projectData.amountPaid || 0)
        const newProjPaid = projCurrentPaid + parsedAmount
        const newProjBalance = Math.max(0, projPrice - newProjPaid)
        const newProjPaymentStatus = newProjBalance <= 0 ? 'Paid' : 'Partially Paid'

        const projUpdates: Record<string, any> = {
          amountPaid: newProjPaid,
          outstandingBalance: newProjBalance,
          paymentStatus: newProjPaymentStatus,
          updatedAt: FieldValue.serverTimestamp(),
        }

        if (effectiveIsDeposit) {
          projUpdates.depositAmount = Number(projectData.depositAmount || 0) + parsedAmount
        }

        if (newProjPaymentStatus === 'Paid' && projectData.status === 'Awaiting Payment') {
          projUpdates.status = 'In Progress'
        }

        batch.update(projectRef, projUpdates)
      }

      // 8. Create Activity Log
      const activityRef = adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).doc()
      const formattedAmount = `${currency} ${parsedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const typeLabel = effectiveIsDeposit ? 'Deposit' : 'Payment'

      batch.set(activityRef, {
        event: effectiveIsDeposit ? 'deposit_recorded' : 'payment_completed',
        description: `${typeLabel} of ${formattedAmount} recorded for ${resolvedClientName}${resolvedInvoiceNumber ? ` (Invoice #${resolvedInvoiceNumber})` : ''} via ${channel}`,
        entityId: paymentId,
        entityType: 'payment',
        clientId,
        clientName: resolvedClientName,
        projectId: projectId || null,
        performedBy: recordedBy,
        metadata: {
          paymentId,
          reference: cleanRef,
          channel,
          amount: parsedAmount,
          currency,
          isDeposit: effectiveIsDeposit,
          invoiceId: invoiceId || null,
          invoiceNumber: resolvedInvoiceNumber || null,
          projectId: projectId || null,
        },
        createdAt: FieldValue.serverTimestamp(),
      })

      // 9. Create In-App Notification
      const notifRef = adminDb.collection(COLLECTIONS.NOTIFICATIONS).doc()
      batch.set(notifRef, {
        type: 'payment_received',
        title: `${typeLabel} Recorded`,
        message: `${typeLabel} of ${formattedAmount} recorded for ${resolvedClientName} (${channel}).`,
        isRead: false,
        clientId,
        clientName: resolvedClientName,
        entityId: paymentId,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    // Commit atomic batch
    await batch.commit()

    return NextResponse.json({
      success: true,
      paymentId,
      payment: {
        id: paymentId,
        ...paymentPayload,
        paidAt: paymentDate,
      },
    })
  } catch (error: any) {
    console.error('[API /api/payments/record] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to record payment' }, { status: 500 })
  }
}

/**
 * DELETE /api/payments/record?paymentId=...&revertBalances=true
 * Safely removes a recorded payment and optionally recalculates client/invoice/project balances.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('paymentId')
    const revertBalances = searchParams.get('revertBalances') !== 'false'

    if (!paymentId) {
      return NextResponse.json({ error: 'Missing paymentId' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const paymentRef = adminDb.collection(COLLECTIONS.PAYMENTS).doc(paymentId)
    const snap = await paymentRef.get()

    if (!snap.exists) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
    }

    const paymentData = snap.data()!
    const batch = adminDb.batch()

    if (revertBalances && paymentData.status === 'success') {
      const amount = Number(paymentData.amount || 0)

      // Revert client balances
      if (paymentData.clientId) {
        const clientRef = adminDb.collection(COLLECTIONS.CLIENTS).doc(paymentData.clientId)
        const clientSnap = await clientRef.get()
        if (clientSnap.exists) {
          const clientData = clientSnap.data()!
          const currentTotalPaid = Number(clientData.totalPaid || 0)
          const currentOutstanding = Number(clientData.outstandingBalance || 0)
          batch.update(clientRef, {
            totalPaid: Math.max(0, currentTotalPaid - amount),
            outstandingBalance: currentOutstanding + amount,
            paymentCount: Math.max(0, (clientData.paymentCount || 1) - 1),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      // Revert invoice balances
      if (paymentData.invoiceId) {
        const invoiceRef = adminDb.collection(COLLECTIONS.INVOICES).doc(paymentData.invoiceId)
        const invoiceSnap = await invoiceRef.get()
        if (invoiceSnap.exists) {
          const invoiceData = invoiceSnap.data()!
          const currentPaid = Number(invoiceData.amountPaid || 0)
          const total = Number(invoiceData.total || 0)
          const newPaid = Math.max(0, currentPaid - amount)
          const newBalance = Math.max(0, total - newPaid)
          batch.update(invoiceRef, {
            amountPaid: newPaid,
            balanceDue: newBalance,
            status: newPaid <= 0 ? 'Sent' : 'Partially Paid',
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      // Revert project balances
      if (paymentData.projectId) {
        const projectRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(paymentData.projectId)
        const projectSnap = await projectRef.get()
        if (projectSnap.exists) {
          const projectData = projectSnap.data()!
          const currentPaid = Number(projectData.amountPaid || 0)
          const price = Number(projectData.price || 0)
          const newPaid = Math.max(0, currentPaid - amount)
          const newBalance = Math.max(0, price - newPaid)
          const projUpdates: Record<string, any> = {
            amountPaid: newPaid,
            outstandingBalance: newBalance,
            paymentStatus: newPaid <= 0 ? 'Unpaid' : 'Partially Paid',
            updatedAt: FieldValue.serverTimestamp(),
          }
          if (paymentData.isDeposit) {
            projUpdates.depositAmount = Math.max(0, (projectData.depositAmount || 0) - amount)
          }
          batch.update(projectRef, projUpdates)
        }
      }
    }

    // Delete the payment document
    batch.delete(paymentRef)

    // Log deletion activity
    const activityRef = adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).doc()
    batch.set(activityRef, {
      event: 'payment_deleted',
      description: `Payment record ${paymentData.reference || paymentData.paystackReference || paymentId} for ${paymentData.clientName || 'Client'} was removed by ${auth.email || 'admin'}`,
      entityId: paymentId,
      entityType: 'payment',
      clientId: paymentData.clientId || null,
      clientName: paymentData.clientName || null,
      performedBy: auth.email || 'admin',
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return NextResponse.json({ success: true, message: 'Payment record removed.' })
  } catch (error: any) {
    console.error('[API DELETE /api/payments/record] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to remove payment' }, { status: 500 })
  }
}

