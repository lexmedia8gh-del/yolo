import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryReadyEmail, sendDeliveryPaymentRequiredEmail } from '@/lib/services/brevo'
import { appUrl, getDeliveryLink, buildDeliveryUrl, buildPaymentUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/delivery/release
 * Body: { deliveryId: string, release: boolean, reason?: string, adminOverride?: boolean, resendEmail?: boolean }
 *
 * Atomically updates the delivery release state using the Admin SDK.
 * Calculates server-side outstanding balance.
 * If balance > 0 and not adminOverride:
 *   - Deliverables are marked Ready, but delivery access remains locked.
 *   - Creates/retrieves secure payment link.
 *   - Sends Brevo Delivery Payment Required email with "Complete Payment & Access Your Deliverables" button.
 * If balance <= 0 or adminOverride:
 *   - Deliverables are unlocked and marked Delivered.
 *   - Sends Brevo Delivery Ready email with secure delivery link.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const { deliveryId, release, reason, adminOverride: explicitAdminOverride, resendEmail } = body as {
      deliveryId: string
      release: boolean
      reason?: string
      adminOverride?: boolean
      resendEmail?: boolean
    }

    if (!deliveryId) {
      return NextResponse.json({ error: 'Missing deliveryId' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const deliveryRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc(deliveryId)
    const snap = await deliveryRef.get()

    if (!snap.exists) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    const deliveryData = snap.data()!
    const willRelease = release !== false // default true

    // Verify files exist for this delivery record if we are attempting to release/submit
    if (willRelease) {
      const filesSnap = await adminDb.collection(COLLECTIONS.DELIVERY_FILES).where('deliveryId', '==', deliveryId).get()
      if (filesSnap.empty) {
        return NextResponse.json({ error: 'Please upload at least one file before submitting delivery.' }, { status: 400 })
      }
    }

    // ─── Server-Side Balance Calculation ─────────────────────────────
    let projectTotal = 0
    let alreadyPaid = 0
    let outstandingBalance = 0
    let paymentLinkToken = ''

    if (deliveryData.invoiceId) {
      try {
        const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryData.invoiceId).get()
        if (invSnap.exists) {
          const invData = invSnap.data()!
          projectTotal = Number(invData.total || invData.totalAmount || 0)
          alreadyPaid = Number(invData.amountPaid || 0)
          outstandingBalance = Math.max(0, Number(invData.balanceDue !== undefined ? invData.balanceDue : (projectTotal - alreadyPaid)))
          if (invData.paymentLinkToken) paymentLinkToken = invData.paymentLinkToken
        }
      } catch (e) {
        console.warn('[Delivery Release] Error fetching invoice balance:', e)
      }
    } else if (deliveryData.quickJobId) {
      try {
        const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(deliveryData.quickJobId).get()
        if (qjSnap.exists) {
          const qjData = qjSnap.data()!
          projectTotal = Number(qjData.originalAgreedPrice || qjData.amount || 0)
          alreadyPaid = Number(qjData.amountPaid || 0)
          outstandingBalance = Math.max(0, Number(qjData.outstandingBalance !== undefined ? qjData.outstandingBalance : (projectTotal - alreadyPaid)))
          if (qjData.paymentLinkToken) paymentLinkToken = qjData.paymentLinkToken
        }
      } catch (e) {
        console.warn('[Delivery Release] Error fetching quick job balance:', e)
      }
    } else if (deliveryData.projectId) {
      try {
        const projSnap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(deliveryData.projectId).get()
        if (projSnap.exists) {
          const projData = projSnap.data()!
          projectTotal = Number(projData.price || projData.totalAmount || 0)
          alreadyPaid = Number(projData.amountPaid || 0)
          outstandingBalance = Math.max(0, Number(projData.outstandingBalance !== undefined ? projData.outstandingBalance : (projectTotal - alreadyPaid)))
        }
      } catch (e) {
        console.warn('[Delivery Release] Error fetching project balance:', e)
      }
    }

    // Determine if payment is outstanding
    const isPaymentOutstanding = outstandingBalance > 0
    const isAdminOverride = willRelease && Boolean(explicitAdminOverride)
    const adminUser = auth.email || 'Authorized Administrator'

    // Fetch client email from Firestore (server truth)
    let clientEmail = deliveryData.clientEmail || ''
    let clientName = deliveryData.clientName || 'Valued Client'
    let clientLogoUrl = ''

    if (deliveryData.clientId) {
      try {
        const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(deliveryData.clientId).get()
        if (clientSnap.exists) {
          const clientData = clientSnap.data()!
          if (clientData.email) clientEmail = clientData.email
          if (clientData.fullName) clientName = clientData.fullName
          if (clientData.photoURL) clientLogoUrl = clientData.photoURL
        }
      } catch (e) {
        console.warn('[Delivery Release] Error fetching client details:', e)
      }
    }

    // If payment is outstanding and we don't have a token, look up existing active link or create one
    if (isPaymentOutstanding && !paymentLinkToken) {
      try {
        const linksQuery = await adminDb.collection(COLLECTIONS.CLIENT_LINKS)
          .where('active', '==', true)
          .get()

        for (const doc of linksQuery.docs) {
          const lData = doc.data()
          if (
            (deliveryData.invoiceId && lData.invoiceId === deliveryData.invoiceId) ||
            (deliveryData.quickJobId && lData.quickJobId === deliveryData.quickJobId) ||
            (deliveryData.projectId && lData.projectId === deliveryData.projectId) ||
            (lData.deliveryId === deliveryId)
          ) {
            paymentLinkToken = lData.token
            break
          }
        }

        if (!paymentLinkToken) {
          const newToken = `pay_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`
          await adminDb.collection(COLLECTIONS.CLIENT_LINKS).add({
            token: newToken,
            clientId: deliveryData.clientId || null,
            clientName: clientName || deliveryData.clientName || '',
            clientEmail: clientEmail || deliveryData.clientEmail || '',
            projectId: deliveryData.projectId || null,
            projectName: deliveryData.projectName || 'Project Deliverables',
            invoiceId: deliveryData.invoiceId || null,
            quickJobId: deliveryData.quickJobId || null,
            deliveryId: deliveryId,
            deliveryAccessToken: deliveryData.accessToken || null,
            amount: outstandingBalance,
            currency: 'GHS',
            description: `Payment for ${deliveryData.projectName || 'Project Deliverables'}`,
            active: true,
            createdAt: FieldValue.serverTimestamp(),
          })
          paymentLinkToken = newToken
        }
      } catch (e) {
        console.warn('[Delivery Release] Error creating/retrieving client payment link:', e)
      }
    }

    const updates: any = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    let emailNotificationStatus: { sent: boolean; messageId?: string; error?: string; skipped?: boolean } = { sent: false }

    if (willRelease) {
      if (isPaymentOutstanding && !isAdminOverride) {
        // Locked state: deliverables are ready, but full payment is required to unlock downloads
        updates.isReleased = false
        updates.requiresFullPayment = true
        updates.status = 'Ready for Delivery'
        updates.paymentLinkToken = paymentLinkToken || null
      } else {
        // Unlocked state: either paid in full or administrator override granted
        updates.isReleased = true
        updates.requiresFullPayment = false
        updates.releasedAt = FieldValue.serverTimestamp()
        updates.releasedBy = adminUser
        updates.status = 'Delivered'

        if (isAdminOverride) {
          updates.adminOverride = true
          updates.adminOverrideReason = reason?.trim() || 'Manual administrator release override'
          updates.adminOverrideAt = FieldValue.serverTimestamp()
          updates.adminOverrideBy = adminUser
        } else {
          updates.adminOverride = false
          updates.adminOverrideReason = null
          updates.adminOverrideAt = null
          updates.adminOverrideBy = null
        }
      }

      // Check duplicate notification email flag
      if (deliveryData.notifyEmailSent && !resendEmail) {
        emailNotificationStatus = { sent: false, skipped: true, error: 'Email notification was already sent for this delivery' }
      } else {
        // Fetch brand logo
        let lexmediaLogoUrl = ''
        try {
          const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
          if (brandingSnap.exists) {
            const bData = brandingSnap.data()!
            if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
          }
        } catch (e) {
          console.warn('[Delivery Release] Could not fetch branding logo:', e)
        }

        if (clientEmail) {
          const deliveryUrl = buildDeliveryUrl(deliveryData.accessToken, req)

          if (isPaymentOutstanding && !isAdminOverride) {
            // Send Delivery Payment Required email with "Complete Payment & Access Your Deliverables"
            const paymentUrl = buildPaymentUrl(paymentLinkToken, req)
            const emailRes = await sendDeliveryPaymentRequiredEmail({
              toEmail: clientEmail,
              clientName,
              projectName: deliveryData.projectName || 'Your Project',
              amountDue: outstandingBalance,
              amountPaid: alreadyPaid,
              projectTotal: projectTotal,
              currencySymbol: 'GH₵',
              paymentUrl,
              deliveryUrl,
              buttonText: 'Complete Payment & Access Your Deliverables',
              lexmediaLogoUrl,
              clientLogoUrl,
            })

            if (emailRes.success) {
              updates.notifyEmailSent = true
              updates.notifyEmailSentAt = FieldValue.serverTimestamp()
              updates.notifyEmailMessageId = emailRes.messageId || null
              updates.notifyEmailError = null
              emailNotificationStatus = { sent: true, messageId: emailRes.messageId }
            } else {
              updates.notifyEmailSent = false
              updates.notifyEmailError = emailRes.error || 'Failed to send email via Brevo'
              emailNotificationStatus = { sent: false, error: emailRes.error }
              console.warn(`[Delivery Release] Brevo payment email notification failed for delivery ${deliveryId}:`, emailRes.error)
            }
          } else {
            // Send standard Delivery Ready email
            const emailRes = await sendDeliveryReadyEmail({
              toEmail: clientEmail,
              clientName,
              projectName: deliveryData.projectName || 'Your Project',
              deliveryUrl,
              lexmediaLogoUrl,
              clientLogoUrl,
            })

            if (emailRes.success) {
              updates.notifyEmailSent = true
              updates.notifyEmailSentAt = FieldValue.serverTimestamp()
              updates.notifyEmailMessageId = emailRes.messageId || null
              updates.notifyEmailError = null
              emailNotificationStatus = { sent: true, messageId: emailRes.messageId }
            } else {
              updates.notifyEmailSent = false
              updates.notifyEmailError = emailRes.error || 'Failed to send email via Brevo'
              emailNotificationStatus = { sent: false, error: emailRes.error }
              console.warn(`[Delivery Release] Brevo ready email notification failed for delivery ${deliveryId}:`, emailRes.error)
            }
          }
        } else {
          updates.notifyEmailSent = false
          updates.notifyEmailError = 'Client email address is missing'
          emailNotificationStatus = { sent: false, error: 'Client email address is missing' }
          console.warn(`[Delivery Release] No email address found for client ${deliveryData.clientId}`)
        }
      }
    } else {
      // Revert/revoke release
      updates.isReleased = false
      updates.releasedAt = null
      if (deliveryData.status === 'Ready for Delivery' || deliveryData.status === 'Delivered') {
        updates.status = 'Not Ready'
      }
    }

    await deliveryRef.update(updates)

    // Update associated Quick Job status if applicable and fully released
    if (deliveryData.quickJobId && updates.isReleased) {
      try {
        const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(deliveryData.quickJobId)
        await qjRef.update({
          deliveryStatus: 'Sent',
          status: 'Completed',
          updatedAt: FieldValue.serverTimestamp(),
        })
      } catch (e) {
        console.warn('Could not update Quick Job status on delivery release:', e)
      }
    }

    // Log activity
    if (willRelease) {
      const isLocked = updates.isReleased === false
      await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
        event: isLocked ? 'delivery_ready_locked' : 'delivery_released',
        description: isLocked
          ? `Deliverables ready for "${deliveryData.projectName || 'Project'}" — access locked pending payment of GH₵${outstandingBalance.toFixed(2)}${emailNotificationStatus.sent ? ' (Payment notice sent via Brevo)' : ''}`
          : isAdminOverride
            ? `Admin Override: Delivery manually released for "${deliveryData.projectName || 'Project'}" by ${adminUser}${updates.adminOverrideReason ? ` (Reason: ${updates.adminOverrideReason})` : ''}`
            : `Delivery released to client for "${deliveryData.projectName || 'Project'}"${emailNotificationStatus.sent ? ' (Email sent via Brevo)' : ''}`,
        clientId: deliveryData.clientId,
        clientName: deliveryData.clientName,
        entityId: deliveryId,
        entityType: 'delivery',
        metadata: {
          isLocked,
          outstandingBalance,
          alreadyPaid,
          projectTotal,
          adminOverride: isAdminOverride,
          reason: updates.adminOverrideReason || null,
          invoiceId: deliveryData.invoiceId || null,
          projectId: deliveryData.projectId || null,
          releasedBy: adminUser,
        },
        emailNotification: emailNotificationStatus,
        performedBy: adminUser,
        createdAt: FieldValue.serverTimestamp(),
      })
    } else {
      await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
        event: 'delivery_locked',
        description: `Admin locked delivery for "${deliveryData.projectName || 'Project'}" (Release access revoked)`,
        clientId: deliveryData.clientId,
        clientName: deliveryData.clientName,
        entityId: deliveryId,
        entityType: 'delivery',
        metadata: {
          invoiceId: deliveryData.invoiceId || null,
          projectId: deliveryData.projectId || null,
          revokedBy: adminUser,
        },
        performedBy: adminUser,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    const deliveryPublicUrl = buildDeliveryUrl(deliveryData.accessToken, req)
    const paymentPublicUrl = paymentLinkToken ? buildPaymentUrl(paymentLinkToken, req) : null

    return NextResponse.json({
      success: true,
      deliveryId,
      accessToken: deliveryData.accessToken,
      publicUrl: deliveryPublicUrl,
      paymentUrl: paymentPublicUrl,
      paymentLinkToken: paymentLinkToken || null,
      isReleased: Boolean(updates.isReleased),
      isLocked: !updates.isReleased,
      outstandingBalance,
      alreadyPaid,
      projectTotal,
      adminOverride: isAdminOverride,
      adminOverrideReason: updates.adminOverrideReason || null,
      adminOverrideBy: updates.adminOverrideBy || null,
      adminOverrideAt: updates.adminOverrideAt ? new Date().toISOString() : null,
      status: updates.status || deliveryData.status,
      emailNotification: emailNotificationStatus,
    })
  } catch (error: any) {
    console.error('[Delivery Release] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update release status' },
      { status: 500 }
    )
  }
}
