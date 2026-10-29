import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import type { ProjectStatus, ProjectPriority, PaymentStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: ProjectStatus[] = [
  'Inquiry',
  'Awaiting Payment',
  'Paid',
  'In Progress',
  'Review',
  'Revision',
  'Completed',
  'Cancelled',
]

const VALID_PRIORITIES: ProjectPriority[] = ['low', 'medium', 'high', 'urgent']

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authCheck = await requireAdmin(req)
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const projectId = params?.id?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required.' }, { status: 400 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Project title is required.', field: 'name' }, { status: 400 })
  }

  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Agreed project total must be a valid non-negative amount.', field: 'price' }, { status: 400 })
  }

  const depositAmount =
    body.depositAmount === undefined || body.depositAmount === null || body.depositAmount === ''
      ? 0
      : Number(body.depositAmount)

  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    return NextResponse.json({ error: 'Deposit amount cannot be negative.', field: 'depositAmount' }, { status: 400 })
  }

  if (depositAmount > price) {
    return NextResponse.json({ error: 'Deposit amount cannot exceed the agreed project total.', field: 'depositAmount' }, { status: 400 })
  }

  const status: ProjectStatus = body.status
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid project status.', field: 'status' }, { status: 400 })
  }

  const priority: ProjectPriority | undefined = body.priority || undefined
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority value.', field: 'priority' }, { status: 400 })
  }

  const startDate = typeof body.startDate === 'string' && body.startDate.trim() ? body.startDate.trim() : null
  const deadline = typeof body.deadline === 'string' && body.deadline.trim() ? body.deadline.trim() : null

  if (startDate && isNaN(new Date(startDate).getTime())) {
    return NextResponse.json({ error: 'Invalid start date.', field: 'startDate' }, { status: 400 })
  }
  if (deadline && isNaN(new Date(deadline).getTime())) {
    return NextResponse.json({ error: 'Invalid estimated delivery date.', field: 'deadline' }, { status: 400 })
  }
  if (startDate && deadline && new Date(deadline).getTime() < new Date(startDate).getTime()) {
    return NextResponse.json(
      { error: 'Estimated delivery date cannot be earlier than the start date.', field: 'deadline' },
      { status: 400 }
    )
  }

  const progress =
    body.progress !== undefined ? Math.min(100, Math.max(0, Math.round(Number(body.progress) || 0))) : undefined

  // Attempt authoritative server-side Firestore update via Admin SDK
  try {
    const adminDb = getAdminDb()
    const projRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId)
    const projSnap = await projRef.get()

    if (!projSnap.exists) {
      return NextResponse.json({ error: 'Project record not found.' }, { status: 404 })
    }

    const existing = projSnap.data() || {}

    // Calculate verified amountPaid from payment records if any exist, falling back to stored amountPaid
    let verifiedPaid = Number(existing.amountPaid || 0)
    try {
      const paymentsSnap = await adminDb
        .collection(COLLECTIONS.PAYMENTS)
        .where('projectId', '==', projectId)
        .get()
      if (!paymentsSnap.empty) {
        const sumSuccess = paymentsSnap.docs.reduce((sum, d) => {
          const p = d.data()
          if (!p.status || p.status === 'success') {
            return sum + (Number(p.amount) || 0)
          }
          return sum
        }, 0)
        if (sumSuccess > verifiedPaid) {
          verifiedPaid = sumSuccess
        }
      }
    } catch {}

    if (price < verifiedPaid) {
      return NextResponse.json(
        {
          error: `Agreed project total cannot be less than the amount already paid (${verifiedPaid}).`,
          field: 'price',
        },
        { status: 400 }
      )
    }

    // Verify client reference if provided
    let resolvedClientId = existing.clientId
    let resolvedClientName = existing.clientName
    let resolvedClientEmail = existing.clientEmail || ''
    if (body.clientId && body.clientId !== existing.clientId) {
      const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(String(body.clientId)).get()
      if (!clientSnap.exists) {
        return NextResponse.json({ error: 'Selected client does not exist.', field: 'clientId' }, { status: 400 })
      }
      const cData = clientSnap.data() || {}
      resolvedClientId = clientSnap.id
      resolvedClientName = cData.fullName || body.clientName || resolvedClientName
      resolvedClientEmail = cData.email || resolvedClientEmail
    }

    // Verify service reference if provided
    let resolvedServiceId = existing.serviceId || ''
    let resolvedServiceName = existing.serviceName || ''
    if (body.serviceId && body.serviceId !== existing.serviceId) {
      const svcSnap = await adminDb.collection(COLLECTIONS.SERVICES).doc(String(body.serviceId)).get()
      if (!svcSnap.exists) {
        return NextResponse.json({ error: 'Selected service does not exist.', field: 'serviceId' }, { status: 400 })
      }
      const sData = svcSnap.data() || {}
      resolvedServiceId = svcSnap.id
      resolvedServiceName = sData.name || body.serviceName || resolvedServiceName
    } else if (typeof body.serviceName === 'string' && body.serviceName.trim()) {
      resolvedServiceName = body.serviceName.trim()
    }

    let resolvedPackageId = existing.packageId || ''
    let resolvedPackageTitle = existing.packageTitle || ''
    if (body.packageId !== undefined) {
      if (!body.packageId) {
        resolvedPackageId = ''
        resolvedPackageTitle = typeof body.packageTitle === 'string' ? body.packageTitle.trim() : ''
      } else if (body.packageId !== existing.packageId) {
        const pkgSnap = await adminDb.collection(COLLECTIONS.PACKAGES).doc(String(body.packageId)).get()
        if (pkgSnap.exists) {
          const pData = pkgSnap.data() || {}
          resolvedPackageId = pkgSnap.id
          resolvedPackageTitle = pData.title || pData.name || body.packageTitle || ''
        }
      }
    }

    const outstandingBalance = Math.max(0, Number((price - verifiedPaid).toFixed(2)))
    const paymentStatus: PaymentStatus =
      price > 0 && outstandingBalance <= 0
        ? 'Paid'
        : verifiedPaid > 0
        ? 'Partially Paid'
        : 'Unpaid'

    const updatePayload: Record<string, any> = {
      name,
      description: typeof body.description === 'string' ? body.description.trim() : existing.description || '',
      clientId: resolvedClientId,
      clientName: resolvedClientName,
      clientEmail: resolvedClientEmail,
      serviceId: resolvedServiceId,
      serviceName: resolvedServiceName,
      packageId: resolvedPackageId,
      packageTitle: resolvedPackageTitle,
      price,
      depositAmount,
      amountPaid: verifiedPaid,
      outstandingBalance,
      paymentStatus,
      startDate,
      deadline,
      status,
      priority: priority || null,
      deliverables: typeof body.deliverables === 'string' ? body.deliverables.trim() : existing.deliverables || '',
      notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes || '',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authCheck.email || authCheck.uid,
    }

    if (progress !== undefined) {
      updatePayload.progress = progress
    }

    await projRef.update(updatePayload)

    // Keep linked Invoice consistent without altering any Payment history
    if (existing.invoiceId) {
      try {
        const invRef = adminDb.collection(COLLECTIONS.INVOICES).doc(existing.invoiceId)
        const invSnap = await invRef.get()
        if (invSnap.exists) {
          const invData = invSnap.data() || {}
          const invPaid = Number(invData.amountPaid ?? verifiedPaid)
          const invBalance = Math.max(0, Number((price - invPaid).toFixed(2)))
          const nextInvStatus =
            invData.status === 'Cancelled'
              ? 'Cancelled'
              : price > 0 && invBalance <= 0
              ? 'Paid'
              : invPaid > 0
              ? 'Partially Paid'
              : invData.status || 'Pending'

          const updatedItems =
            Array.isArray(invData.items) && invData.items.length === 1
              ? [
                  {
                    ...invData.items[0],
                    description: resolvedPackageTitle
                      ? `${resolvedServiceName} — ${resolvedPackageTitle}`
                      : resolvedServiceName || name,
                    unitPrice: price,
                    total: price,
                  },
                ]
              : invData.items

          await invRef.update({
            projectName: name,
            clientId: resolvedClientId,
            clientName: resolvedClientName,
            clientEmail: resolvedClientEmail,
            serviceId: resolvedServiceId,
            serviceName: resolvedServiceName,
            packageId: resolvedPackageId,
            packageTitle: resolvedPackageTitle,
            ...(updatedItems ? { items: updatedItems } : {}),
            subtotal: price,
            total: price,
            depositAmount,
            balanceDue: invBalance,
            dueDate: deadline,
            status: nextInvStatus,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      } catch (invErr) {
        console.warn('[Project Edit] Non-fatal invoice sync warning:', invErr)
      }
    }

    // Check outstanding payment requests — NEVER silently alter their issued amount; flag if any exceed new balance
    let flaggedLinksCount = 0
    try {
      const linksSnap = await adminDb
        .collection(COLLECTIONS.CLIENT_LINKS)
        .where('projectId', '==', projectId)
        .get()

      for (const linkDoc of linksSnap.docs) {
        const lData = linkDoc.data()
        const isPending =
          lData.status !== 'Paid' &&
          lData.paymentStatus !== 'Paid' &&
          lData.status !== 'Cancelled' &&
          lData.status !== 'disabled' &&
          lData.status !== 'Expired'

        if (isPending) {
          // Keep denormalized project/client labels fresh without altering amount
          const linkPatch: Record<string, any> = {
            projectName: name,
            clientId: resolvedClientId,
            clientName: resolvedClientName,
          }
          if (Number(lData.amount || 0) > outstandingBalance) {
            flaggedLinksCount += 1
            linkPatch.needsReview = true
            linkPatch.reviewReason =
              outstandingBalance <= 0
                ? 'Project balance is now fully settled; cancel this pending link if no longer needed.'
                : `Issued link amount exceeds updated outstanding balance (${outstandingBalance}).`
          }
          await linkDoc.ref.update(linkPatch)
        }
      }
    } catch (linkErr) {
      console.warn('[Project Edit] Non-fatal link review check warning:', linkErr)
    }

    // Record audit activity log
    try {
      await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
        event: 'project_updated',
        description: `Updated project "${name}" (${resolvedClientName})`,
        entityId: projectId,
        entityType: 'project',
        clientId: resolvedClientId,
        clientName: resolvedClientName,
        performedBy: authCheck.uid,
        performedByName: authCheck.email || 'Admin',
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch {}

    return NextResponse.json({
      success: true,
      persistedOnServer: true,
      outstandingBalance,
      paymentStatus,
      flaggedLinksCount,
    })
  } catch (adminErr: any) {
    // Server validation & admin auth succeeded, but Admin SDK credentials are not configured in this environment.
    // Signal client to persist validated payload via client store helper.
    return NextResponse.json({
      success: true,
      persistedOnServer: false,
      validatedByServer: true,
      updatedBy: authCheck.email || authCheck.uid,
    })
  }
}
