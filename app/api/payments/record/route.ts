import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { normalizeEntityId, resolveCanonicalClient } from '@/lib/firebase/client-resolver'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

function roundCurrency(val: number): number {
  if (!Number.isFinite(val)) return 0
  return Math.round(val * 100) / 100
}

/**
 * Sanitizes a browser-cached entity snapshot so it can be safely merged into
 * Firestore without `undefined` values, client-only sentinels, or redundant `id` keys.
 */
function sanitizeSnapshotForFirestore(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const cleanValue = (v: any): any => {
    if (v === undefined) return undefined
    if (v === null || typeof v !== 'object') return v
    if (v instanceof Date) {
      return Number.isFinite(v.getTime()) ? v.toISOString() : new Date().toISOString()
    }
    if (Array.isArray(v)) {
      return v.map(cleanValue).filter((item) => item !== undefined)
    }
    // Convert serialized Firestore Timestamp objects ({ seconds, nanoseconds } or { _seconds, _nanoseconds }) to ISO strings
    if (
      (typeof v.seconds === 'number' || typeof v._seconds === 'number') &&
      Object.keys(v).every(
        (k) =>
          k === 'seconds' ||
          k === 'nanoseconds' ||
          k === '_seconds' ||
          k === '_nanoseconds' ||
          k === 'type'
      )
    ) {
      const sec = typeof v.seconds === 'number' ? v.seconds : v._seconds
      const nano = typeof v.nanoseconds === 'number' ? v.nanoseconds : v._nanoseconds || 0
      const d = new Date(sec * 1000 + Math.floor(nano / 1e6))
      return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString()
    }
    const nested: Record<string, any> = {}
    for (const [nk, nv] of Object.entries(v)) {
      const cleaned = cleanValue(nv)
      if (cleaned !== undefined) {
        nested[nk] = cleaned
      }
    }
    return nested
  }

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (k === 'id' || v === undefined) continue
    const cleaned = cleanValue(v)
    if (cleaned !== undefined) {
      out[k] = cleaned
    }
  }
  return out
}

function doesEntityMatchClient(
  entityClientIdRaw: unknown,
  entityClientEmailRaw: unknown,
  entityClientNameRaw: unknown,
  canonicalClientId: string,
  clientData: Record<string, any>,
  rawSubmittedClientId: string
): boolean {
  const entityClientId = normalizeEntityId(entityClientIdRaw, COLLECTIONS.CLIENTS)
  if (!entityClientId) return true
  if (entityClientId === canonicalClientId) return true
  if (typeof clientData.id === 'string' && entityClientId === clientData.id.trim()) return true
  if (typeof clientData.clientId === 'string' && entityClientId === clientData.clientId.trim()) return true
  if (typeof clientData.legacyId === 'string' && entityClientId === clientData.legacyId.trim()) return true
  if (rawSubmittedClientId && entityClientId === rawSubmittedClientId) return true

  const clientNameLower = String(clientData.fullName || clientData.name || '')
    .trim()
    .toLowerCase()
  const clientEmailLower = String(clientData.email || '')
    .trim()
    .toLowerCase()

  const rawIdStr = typeof entityClientIdRaw === 'string' ? entityClientIdRaw.trim().toLowerCase() : ''
  if (rawIdStr && clientNameLower && rawIdStr === clientNameLower) return true
  if (rawIdStr && clientEmailLower && rawIdStr === clientEmailLower) return true

  const entityEmailLower =
    typeof entityClientEmailRaw === 'string' ? entityClientEmailRaw.trim().toLowerCase() : ''
  if (entityEmailLower && clientEmailLower && entityEmailLower === clientEmailLower) {
    return true
  }

  const entityNameLower =
    typeof entityClientNameRaw === 'string' ? entityClientNameRaw.trim().toLowerCase() : ''
  if (entityNameLower && clientNameLower && entityNameLower === clientNameLower) {
    return true
  }

  return false
}

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
      existingClientSnapshot,
      existingProjectSnapshot,
      existingInvoiceSnapshot,
      amount,
      currency = 'GHS',
      paymentType = 'payment', // 'deposit' | 'payment' | 'part_payment' | 'milestone'
      isDeposit = false,
      channel = 'Mobile Money', // 'Mobile Money' | 'Bank Transfer' | 'Cash' | 'Card' | 'Cheque' | 'POS' | 'Other'
      reference,
      idempotencyKey,
      paidAt,
      status = 'success',
      notes = '',
    } = body

    const rawClientStr = typeof clientId === 'string' ? clientId.trim() : ''
    const normalizedClientId = normalizeEntityId(clientId, COLLECTIONS.CLIENTS)
    const normalizedProjectId = normalizeEntityId(projectId, COLLECTIONS.PROJECTS)
    const normalizedInvoiceId = normalizeEntityId(invoiceId, COLLECTIONS.INVOICES)

    if (!rawClientStr && !normalizedProjectId && !normalizedInvoiceId) {
      return NextResponse.json({ error: 'Client is required to record a payment' }, { status: 400 })
    }

    const parsedAmount = roundCurrency(Number(amount))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Valid payment amount greater than zero is required' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // Determine actual deposit flag
    const effectiveIsDeposit = Boolean(isDeposit || paymentType === 'deposit')

    // Generate unique reference if not provided
    const prefix = effectiveIsDeposit ? 'DEP' : 'PAY'
    const cleanRef =
      (typeof reference === 'string' && reference.trim()) ||
      `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
    const cleanIdempotencyKey =
      typeof idempotencyKey === 'string' && idempotencyKey.trim() ? idempotencyKey.trim() : ''

    // 0. Prevent duplicate payment submissions (by reference or idempotencyKey)
    const paymentsCol = adminDb.collection(COLLECTIONS.PAYMENTS)
    const [existingByPaystackRef, existingByRef] = await Promise.all([
      paymentsCol.where('paystackReference', '==', cleanRef).limit(1).get(),
      paymentsCol.where('reference', '==', cleanRef).limit(1).get(),
    ])

    const duplicateSnap = !existingByPaystackRef.empty
      ? existingByPaystackRef.docs[0]
      : !existingByRef.empty
      ? existingByRef.docs[0]
      : null

    if (duplicateSnap) {
      return NextResponse.json(
        {
          error: `A payment with reference "${cleanRef}" has already been recorded.`,
          duplicate: true,
          existingPaymentId: duplicateSnap.id,
        },
        { status: 409 }
      )
    }

    if (cleanIdempotencyKey) {
      const existingByKey = await paymentsCol
        .where('idempotencyKey', '==', cleanIdempotencyKey)
        .limit(1)
        .get()
      if (!existingByKey.empty) {
        return NextResponse.json(
          {
            error: 'This payment submission was already processed.',
            duplicate: true,
            existingPaymentId: existingByKey.docs[0].id,
          },
          { status: 409 }
        )
      }
    }

    const parsedPaidAt = paidAt ? new Date(paidAt) : new Date()
    const paymentDate = Number.isFinite(parsedPaidAt.getTime())
      ? parsedPaidAt.toISOString()
      : new Date().toISOString()
    const nowIso = new Date().toISOString()
    const recordedBy = auth.email || 'admin'

    // 1. Pre-load explicitly selected Invoice and/or Project (hydrating verified browser
    //    records on server cold-start or PIN-mode local storage sessions if needed).
    let invoiceData: Record<string, any> | null = null
    let invoiceRef: any = null
    let resolvedInvoiceId = ''
    let resolvedInvoiceNumber = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : ''
    let hydratedInvoiceFromSnapshot = false

    if (normalizedInvoiceId) {
      const candidateInvRef = adminDb.collection(COLLECTIONS.INVOICES).doc(normalizedInvoiceId)
      const invoiceSnap = await candidateInvRef.get()
      if (invoiceSnap.exists) {
        const invDocData: Record<string, any> = invoiceSnap.data() || {}
        invoiceRef = candidateInvRef
        invoiceData = invDocData
        resolvedInvoiceId = invoiceSnap.id
        resolvedInvoiceNumber = invDocData.invoiceNumber || resolvedInvoiceNumber
      } else if (
        existingInvoiceSnapshot &&
        typeof existingInvoiceSnapshot === 'object' &&
        normalizeEntityId((existingInvoiceSnapshot as any).id, COLLECTIONS.INVOICES) ===
          normalizedInvoiceId
      ) {
        const hydratedInv = sanitizeSnapshotForFirestore(existingInvoiceSnapshot)
        invoiceRef = candidateInvRef
        invoiceData = hydratedInv
        resolvedInvoiceId = normalizedInvoiceId
        resolvedInvoiceNumber = hydratedInv.invoiceNumber || resolvedInvoiceNumber
        hydratedInvoiceFromSnapshot = true
      } else if (!normalizedProjectId && !rawClientStr) {
        return NextResponse.json({ error: 'Selected invoice not found' }, { status: 404 })
      } else {
        // Stale or previously deleted invoice reference on a project — do not block the client/project payment
        console.warn(
          `[API /api/payments/record] Skipping missing/deleted invoice ${normalizedInvoiceId} while recording payment.`
        )
        resolvedInvoiceId = ''
      }
    }

    let projectData: Record<string, any> | null = null
    let projectRef: any = null
    let resolvedProjectId = ''
    let resolvedProjectName = typeof projectName === 'string' ? projectName.trim() : ''
    let hydratedProjectFromSnapshot = false

    if (normalizedProjectId) {
      const candidateProjRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(normalizedProjectId)
      const projectSnap = await candidateProjRef.get()
      if (projectSnap.exists) {
        const projDocData: Record<string, any> = projectSnap.data() || {}
        projectRef = candidateProjRef
        projectData = projDocData
        resolvedProjectId = projectSnap.id
        resolvedProjectName = projDocData.name || resolvedProjectName
      } else if (
        existingProjectSnapshot &&
        typeof existingProjectSnapshot === 'object' &&
        normalizeEntityId((existingProjectSnapshot as any).id, COLLECTIONS.PROJECTS) ===
          normalizedProjectId &&
        typeof (existingProjectSnapshot as any).name === 'string' &&
        (existingProjectSnapshot as any).name.trim().length > 0
      ) {
        const hydratedProj = sanitizeSnapshotForFirestore(existingProjectSnapshot)
        projectRef = candidateProjRef
        projectData = hydratedProj
        resolvedProjectId = normalizedProjectId
        resolvedProjectName = hydratedProj.name || resolvedProjectName
        hydratedProjectFromSnapshot = true
      } else {
        return NextResponse.json({ error: 'Selected project not found' }, { status: 404 })
      }
    }

    // 2. Resolve canonical Client record (direct doc lookup first, safe fallbacks for legacy IDs,
    //    and verified existing UI client hydration if server instance restarted).
    let resolvedClient = await resolveCanonicalClient(adminDb, {
      clientsCollection: COLLECTIONS.CLIENTS,
      clientId,
      projectClientId: projectData?.clientId,
      invoiceClientId: invoiceData?.clientId || invoiceData?.clientInfo?.id,
      linkedClientEmail:
        invoiceData?.clientEmail || invoiceData?.clientInfo?.email || projectData?.clientEmail,
      linkedClientName:
        invoiceData?.clientName || invoiceData?.clientInfo?.name || projectData?.clientName,
    })

    let hydratedClientFromSnapshot = false
    if (
      !resolvedClient &&
      normalizedClientId &&
      existingClientSnapshot &&
      typeof existingClientSnapshot === 'object' &&
      normalizeEntityId((existingClientSnapshot as any).id, COLLECTIONS.CLIENTS) ===
        normalizedClientId &&
      typeof (existingClientSnapshot as any).fullName === 'string' &&
      (existingClientSnapshot as any).fullName.trim().length > 0
    ) {
      const hydratedClientData = sanitizeSnapshotForFirestore(existingClientSnapshot)
      const hydratedClientRef = adminDb.collection(COLLECTIONS.CLIENTS).doc(normalizedClientId)
      resolvedClient = {
        id: normalizedClientId,
        ref: hydratedClientRef,
        data: hydratedClientData,
        matchedBy: 'doc_id',
      }
      hydratedClientFromSnapshot = true
    }

    if (!resolvedClient) {
      return NextResponse.json(
        {
          error: rawClientStr
            ? `Client not found (ID: ${rawClientStr}). Please verify the client exists in your Clients directory.`
            : 'Client not found. Please select an existing client before recording a payment.',
        },
        { status: 404 }
      )
    }

    const canonicalClientId = resolvedClient.id
    const clientRef = resolvedClient.ref
    const clientData = sanitizeSnapshotForFirestore(resolvedClient.data)
    const resolvedClientName =
      clientData.fullName ||
      clientData.name ||
      (typeof clientName === 'string' ? clientName.trim() : '') ||
      'Client'

    // Validate ownership of explicitly passed project/invoice (allowing orphaned legacy clientIds to heal)
    if (
      projectData &&
      !doesEntityMatchClient(
        projectData.clientId,
        projectData.clientEmail,
        projectData.clientName,
        canonicalClientId,
        clientData,
        rawClientStr
      )
    ) {
      const otherProjClient = projectData.clientId
        ? await resolveCanonicalClient(adminDb, {
            clientsCollection: COLLECTIONS.CLIENTS,
            clientId: projectData.clientId,
          })
        : null
      if (otherProjClient && otherProjClient.id !== canonicalClientId) {
        return NextResponse.json(
          { error: 'The selected project belongs to a different client.' },
          { status: 400 }
        )
      }
    }

    if (
      invoiceData &&
      !doesEntityMatchClient(
        invoiceData.clientId || invoiceData?.clientInfo?.id,
        invoiceData.clientEmail || invoiceData?.clientInfo?.email,
        invoiceData.clientName || invoiceData?.clientInfo?.name,
        canonicalClientId,
        clientData,
        rawClientStr
      )
    ) {
      const otherInvClientId = invoiceData.clientId || invoiceData?.clientInfo?.id
      const otherInvClient = otherInvClientId
        ? await resolveCanonicalClient(adminDb, {
            clientsCollection: COLLECTIONS.CLIENTS,
            clientId: otherInvClientId,
          })
        : null
      if (otherInvClient && otherInvClient.id !== canonicalClientId) {
        return NextResponse.json(
          { error: 'The selected invoice belongs to a different client.' },
          { status: 400 }
        )
      }
    }

    // 3. Auto-resolve linked Invoice <-> Project cross-associations so neither gets out of sync
    if (projectData && !invoiceData && projectData.invoiceId) {
      const autoInvId = normalizeEntityId(projectData.invoiceId, COLLECTIONS.INVOICES)
      if (autoInvId) {
        const autoInvRef = adminDb.collection(COLLECTIONS.INVOICES).doc(autoInvId)
        const autoInvSnap = await autoInvRef.get()
        if (autoInvSnap.exists) {
          const autoInvDocData: Record<string, any> = autoInvSnap.data() || {}
          invoiceRef = autoInvRef
          invoiceData = autoInvDocData
          resolvedInvoiceId = autoInvSnap.id
          resolvedInvoiceNumber = autoInvDocData.invoiceNumber || resolvedInvoiceNumber
        }
      }
    } else if (invoiceData && !projectData) {
      const autoProjId = normalizeEntityId(invoiceData.projectId, COLLECTIONS.PROJECTS)
      if (autoProjId) {
        const autoProjRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(autoProjId)
        const autoProjSnap = await autoProjRef.get()
        if (autoProjSnap.exists) {
          const autoProjDocData: Record<string, any> = autoProjSnap.data() || {}
          projectRef = autoProjRef
          projectData = autoProjDocData
          resolvedProjectId = autoProjSnap.id
          resolvedProjectName = autoProjDocData.name || resolvedProjectName
        }
      } else if (resolvedInvoiceId) {
        const linkedProjQuery = await adminDb
          .collection(COLLECTIONS.PROJECTS)
          .where('invoiceId', '==', resolvedInvoiceId)
          .limit(1)
          .get()
        if (!linkedProjQuery.empty) {
          const pSnap = linkedProjQuery.docs[0]
          const pDocData: Record<string, any> = pSnap.data() || {}
          projectRef = pSnap.ref
          projectData = pDocData
          resolvedProjectId = pSnap.id
          resolvedProjectName = pDocData.name || resolvedProjectName
        }
      }
    }

    const batch = adminDb.batch()

    // Ensure hydrated records are persisted even when payment status === 'pending'
    if (status !== 'success') {
      if (hydratedClientFromSnapshot) {
        batch.set(
          clientRef,
          {
            ...clientData,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
      if (hydratedInvoiceFromSnapshot && invoiceRef && invoiceData) {
        batch.set(
          invoiceRef,
          {
            ...sanitizeSnapshotForFirestore(invoiceData),
            clientId: canonicalClientId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
      if (hydratedProjectFromSnapshot && projectRef && projectData) {
        batch.set(
          projectRef,
          {
            ...sanitizeSnapshotForFirestore(projectData),
            clientId: canonicalClientId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
    }

    // 4. Create Payment Document using canonical identifiers
    const paymentRef = adminDb.collection(COLLECTIONS.PAYMENTS).doc()
    const paymentId = paymentRef.id

    const paymentPayload: Record<string, any> = {
      invoiceId: resolvedInvoiceId,
      invoiceNumber: resolvedInvoiceNumber,
      clientId: canonicalClientId,
      clientName: resolvedClientName,
      projectId: resolvedProjectId,
      projectName: resolvedProjectName,
      paystackReference: cleanRef,
      reference: cleanRef,
      ...(cleanIdempotencyKey ? { idempotencyKey: cleanIdempotencyKey } : {}),
      amount: parsedAmount,
      currency,
      paymentType: effectiveIsDeposit ? 'deposit' : paymentType,
      isDeposit: effectiveIsDeposit,
      paymentMethod: channel,
      channel,
      paidAt: paymentDate,
      status, // 'success' | 'pending' | 'failed'
      source: 'manual',
      notes: typeof notes === 'string' ? notes.trim() : '',
      recordedBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    batch.set(paymentRef, paymentPayload)

    let updatedClientSnapshot: Record<string, any> | null = null
    let updatedInvoiceSnapshot: Record<string, any> | null = null
    let updatedProjectSnapshot: Record<string, any> | null = null

    // Only update financial balances if payment is 'success' (completed)
    if (status === 'success') {
      // 5. Update Client Balances (using set+merge so locally-created clients upsert cleanly)
      const currentTotalPaid = roundCurrency(Number(clientData.totalPaid || 0))
      const currentOutstanding = roundCurrency(Number(clientData.outstandingBalance || 0))
      const currentPaymentCount = Number(clientData.paymentCount || 0)
      const newClientTotalPaid = roundCurrency(currentTotalPaid + parsedAmount)
      const newClientOutstanding = roundCurrency(Math.max(0, currentOutstanding - parsedAmount))
      const newClientPaymentCount = currentPaymentCount + 1

      batch.set(
        clientRef,
        {
          ...clientData,
          totalPaid: newClientTotalPaid,
          outstandingBalance: newClientOutstanding,
          lastPaymentDate: FieldValue.serverTimestamp(),
          paymentCount: newClientPaymentCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      updatedClientSnapshot = {
        ...clientData,
        id: canonicalClientId,
        totalPaid: newClientTotalPaid,
        outstandingBalance: newClientOutstanding,
        lastPaymentDate: nowIso,
        paymentCount: newClientPaymentCount,
        updatedAt: nowIso,
      }

      // 6. Update Invoice Balances if linked
      if (invoiceRef && invoiceData) {
        const cleanInvoiceBase = sanitizeSnapshotForFirestore(invoiceData)
        const invTotal = roundCurrency(Number(cleanInvoiceBase.total || 0))
        const invCurrentPaid = roundCurrency(Number(cleanInvoiceBase.amountPaid || 0))
        const newInvPaid = roundCurrency(invCurrentPaid + parsedAmount)
        const newInvBalance = roundCurrency(Math.max(0, invTotal - newInvPaid))
        const newInvStatus =
          invTotal > 0 && newInvBalance <= 0
            ? 'Paid'
            : newInvPaid > 0
            ? 'Partially Paid'
            : cleanInvoiceBase.status || 'Sent'

        const invUpdates: Record<string, any> = {
          ...cleanInvoiceBase,
          clientId: canonicalClientId,
          amountPaid: newInvPaid,
          balanceDue: newInvBalance,
          status: newInvStatus,
          paymentMethod: channel,
          paymentReference: cleanRef,
          paymentDate,
          updatedAt: FieldValue.serverTimestamp(),
        }
        if (typeof notes === 'string' && notes.trim()) {
          invUpdates.paymentNotes = notes.trim()
        }
        if (newInvStatus === 'Paid') {
          invUpdates.paidAt = FieldValue.serverTimestamp()
        }
        batch.set(invoiceRef, invUpdates, { merge: true })

        updatedInvoiceSnapshot = {
          ...cleanInvoiceBase,
          id: resolvedInvoiceId,
          clientId: canonicalClientId,
          amountPaid: newInvPaid,
          balanceDue: newInvBalance,
          status: newInvStatus,
          paymentMethod: channel,
          paymentReference: cleanRef,
          paymentDate,
          ...(typeof notes === 'string' && notes.trim() ? { paymentNotes: notes.trim() } : {}),
          ...(newInvStatus === 'Paid' ? { paidAt: nowIso } : {}),
          updatedAt: nowIso,
        }

        // If invoice is now fully paid and has an active payment link, mark it Paid
        if (newInvStatus === 'Paid' && cleanInvoiceBase.paymentLinkId) {
          const linkId = normalizeEntityId(cleanInvoiceBase.paymentLinkId, COLLECTIONS.CLIENT_LINKS)
          if (linkId) {
            const linkRef = adminDb.collection(COLLECTIONS.CLIENT_LINKS).doc(linkId)
            const linkSnap = await linkRef.get()
            if (linkSnap.exists && linkSnap.data()?.status !== 'Paid') {
              batch.set(
                linkRef,
                {
                  ...sanitizeSnapshotForFirestore(linkSnap.data()),
                  status: 'Paid',
                  paymentStatus: 'Paid',
                  paystackReference: cleanRef,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              )
            }
          }
        }
      }

      // 7. Update Project Balances if linked
      if (projectRef && projectData) {
        const cleanProjectBase = sanitizeSnapshotForFirestore(projectData)
        const projPrice = roundCurrency(Number(cleanProjectBase.price || 0))
        const projCurrentPaid = roundCurrency(Number(cleanProjectBase.amountPaid || 0))
        const newProjPaid = roundCurrency(projCurrentPaid + parsedAmount)
        const newProjBalance = roundCurrency(Math.max(0, projPrice - newProjPaid))
        const newProjPaymentStatus =
          projPrice > 0 && newProjBalance <= 0 ? 'Paid' : 'Partially Paid'

        const projUpdates: Record<string, any> = {
          ...cleanProjectBase,
          clientId: canonicalClientId,
          amountPaid: newProjPaid,
          outstandingBalance: newProjBalance,
          paymentStatus: newProjPaymentStatus,
          updatedAt: FieldValue.serverTimestamp(),
        }

        if (effectiveIsDeposit) {
          projUpdates.depositPaid = roundCurrency(
            Number(cleanProjectBase.depositPaid || 0) + parsedAmount
          )
          if (
            cleanProjectBase.depositAmount === undefined ||
            cleanProjectBase.depositAmount === null
          ) {
            projUpdates.depositAmount = parsedAmount
          }
        }

        if (newProjPaymentStatus === 'Paid' && cleanProjectBase.status === 'Awaiting Payment') {
          projUpdates.status = 'In Progress'
        }

        batch.set(projectRef, projUpdates, { merge: true })

        updatedProjectSnapshot = {
          ...cleanProjectBase,
          id: resolvedProjectId,
          clientId: canonicalClientId,
          amountPaid: newProjPaid,
          outstandingBalance: newProjBalance,
          paymentStatus: newProjPaymentStatus,
          ...(effectiveIsDeposit ? { depositPaid: projUpdates.depositPaid } : {}),
          ...(projUpdates.status ? { status: projUpdates.status } : {}),
          updatedAt: nowIso,
        }
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
        clientId: canonicalClientId,
        clientName: resolvedClientName,
        projectId: resolvedProjectId || null,
        performedBy: recordedBy,
        metadata: {
          paymentId,
          reference: cleanRef,
          channel,
          amount: parsedAmount,
          currency,
          isDeposit: effectiveIsDeposit,
          invoiceId: resolvedInvoiceId || null,
          invoiceNumber: resolvedInvoiceNumber || null,
          projectId: resolvedProjectId || null,
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
        clientId: canonicalClientId,
        clientName: resolvedClientName,
        invoiceId: resolvedInvoiceId || null,
        projectId: resolvedProjectId || null,
        entityId: paymentId,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    // Commit atomic batch
    await batch.commit()

    return NextResponse.json({
      success: true,
      paymentId,
      clientId: canonicalClientId,
      payment: {
        ...paymentPayload,
        id: paymentId,
        paidAt: paymentDate,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      updatedClient: updatedClientSnapshot,
      updatedInvoice: updatedInvoiceSnapshot,
      updatedProject: updatedProjectSnapshot,
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
    const paymentId = normalizeEntityId(searchParams.get('paymentId'), COLLECTIONS.PAYMENTS)
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
    const nowIso = new Date().toISOString()

    let updatedClientSnapshot: Record<string, any> | null = null
    let updatedInvoiceSnapshot: Record<string, any> | null = null
    let updatedProjectSnapshot: Record<string, any> | null = null

    if (revertBalances && paymentData.status === 'success') {
      const amount = roundCurrency(Number(paymentData.amount || 0))

      // Revert client balances using canonical client resolution
      if (paymentData.clientId) {
        const resolvedClient = await resolveCanonicalClient(adminDb, {
          clientsCollection: COLLECTIONS.CLIENTS,
          clientId: paymentData.clientId,
        })
        if (resolvedClient) {
          const clientData = sanitizeSnapshotForFirestore(resolvedClient.data)
          const currentTotalPaid = roundCurrency(Number(clientData.totalPaid || 0))
          const currentOutstanding = roundCurrency(Number(clientData.outstandingBalance || 0))
          const newTotalPaid = roundCurrency(Math.max(0, currentTotalPaid - amount))
          const newOutstanding = roundCurrency(currentOutstanding + amount)
          const newCount = Math.max(0, Number(clientData.paymentCount || 1) - 1)
          batch.set(
            resolvedClient.ref,
            {
              ...clientData,
              totalPaid: newTotalPaid,
              outstandingBalance: newOutstanding,
              paymentCount: newCount,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          updatedClientSnapshot = {
            ...clientData,
            id: resolvedClient.id,
            totalPaid: newTotalPaid,
            outstandingBalance: newOutstanding,
            paymentCount: newCount,
            updatedAt: nowIso,
          }
        }
      }

      // Revert invoice balances
      const invId = normalizeEntityId(paymentData.invoiceId, COLLECTIONS.INVOICES)
      if (invId) {
        const invoiceRef = adminDb.collection(COLLECTIONS.INVOICES).doc(invId)
        const invoiceSnap = await invoiceRef.get()
        if (invoiceSnap.exists) {
          const invoiceData = sanitizeSnapshotForFirestore(invoiceSnap.data())
          const currentPaid = roundCurrency(Number(invoiceData.amountPaid || 0))
          const total = roundCurrency(Number(invoiceData.total || 0))
          const newPaid = roundCurrency(Math.max(0, currentPaid - amount))
          const newBalance = roundCurrency(Math.max(0, total - newPaid))
          const newStatus = newPaid <= 0 ? 'Sent' : newBalance <= 0 && total > 0 ? 'Paid' : 'Partially Paid'
          batch.set(
            invoiceRef,
            {
              ...invoiceData,
              amountPaid: newPaid,
              balanceDue: newBalance,
              status: newStatus,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          updatedInvoiceSnapshot = {
            ...invoiceData,
            id: invId,
            amountPaid: newPaid,
            balanceDue: newBalance,
            status: newStatus,
            updatedAt: nowIso,
          }
        }
      }

      // Revert project balances
      const projId = normalizeEntityId(paymentData.projectId, COLLECTIONS.PROJECTS)
      if (projId) {
        const projectRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(projId)
        const projectSnap = await projectRef.get()
        if (projectSnap.exists) {
          const projectData = sanitizeSnapshotForFirestore(projectSnap.data())
          const currentPaid = roundCurrency(Number(projectData.amountPaid || 0))
          const price = roundCurrency(Number(projectData.price || 0))
          const newPaid = roundCurrency(Math.max(0, currentPaid - amount))
          const newBalance = roundCurrency(Math.max(0, price - newPaid))
          const newPayStatus = newPaid <= 0 ? 'Unpaid' : newBalance <= 0 && price > 0 ? 'Paid' : 'Partially Paid'
          const projUpdates: Record<string, any> = {
            ...projectData,
            amountPaid: newPaid,
            outstandingBalance: newBalance,
            paymentStatus: newPayStatus,
            updatedAt: FieldValue.serverTimestamp(),
          }
          if (paymentData.isDeposit && projectData.depositPaid !== undefined) {
            projUpdates.depositPaid = roundCurrency(
              Math.max(0, Number(projectData.depositPaid || 0) - amount)
            )
          }
          batch.set(projectRef, projUpdates, { merge: true })
          updatedProjectSnapshot = {
            ...projectData,
            id: projId,
            amountPaid: newPaid,
            outstandingBalance: newBalance,
            paymentStatus: newPayStatus,
            updatedAt: nowIso,
          }
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

    return NextResponse.json({
      success: true,
      deletedPaymentId: paymentId,
      updatedClient: updatedClientSnapshot,
      updatedInvoice: updatedInvoiceSnapshot,
      updatedProject: updatedProjectSnapshot,
      message: 'Payment record removed.',
    })
  } catch (error: any) {
    console.error('[API DELETE /api/payments/record] Error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to remove payment' }, { status: 500 })
  }
}
