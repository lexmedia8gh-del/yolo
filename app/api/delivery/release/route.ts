import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryReadyEmail } from '@/lib/services/brevo'

export const dynamic = 'force-dynamic'

/**
 * POST /api/delivery/release
 * Body: { deliveryId: string, release: boolean }
 *
 * Atomically updates the delivery release state using the Admin SDK.
 * Returns the current accessToken so the admin can build the portal URL from server truth.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json()
    const { deliveryId, release, reason, adminOverride: explicitAdminOverride } = body as {
      deliveryId: string
      release: boolean
      reason?: string
      adminOverride?: boolean
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

    // Check if project or invoice has outstanding balance to mark as admin override
    let isPaymentOutstanding = true
    if (deliveryData.invoiceId) {
      try {
        const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryData.invoiceId).get()
        if (invSnap.exists) {
          const invData = invSnap.data()!
          if (invData.status === 'Paid' || (invData.balanceDue !== undefined && invData.balanceDue <= 0)) {
            isPaymentOutstanding = false
          }
        }
      } catch (e) {
        console.warn('Could not verify invoice status for delivery release:', e)
      }
    }

    const isAdminOverride = willRelease && (explicitAdminOverride ?? isPaymentOutstanding)
    const adminUser = auth.email || 'Authorized Administrator'

    const updates: any = {
      isReleased: willRelease,
      updatedAt: FieldValue.serverTimestamp(),
    }

    let emailNotificationStatus: { sent: boolean; messageId?: string; error?: string; skipped?: boolean } = { sent: false }

    if (willRelease) {
      updates.releasedAt = FieldValue.serverTimestamp()
      updates.releasedBy = adminUser
      
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

      // Escalate status if still draft
      if (!deliveryData.status || deliveryData.status === 'Not Ready') {
        updates.status = 'Ready for Delivery'
      }

      // Check duplicate notification email flag
      if (deliveryData.notifyEmailSent) {
        emailNotificationStatus = { sent: false, skipped: true, error: 'Email notification was already sent for this delivery' }
      } else {
        // Fetch client email from Firestore (server truth)
        let clientEmail = deliveryData.clientEmail || ''
        let clientName = deliveryData.clientName || 'Valued Client'
        let clientLogoUrl = ''

        if (deliveryData.clientId) {
          const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(deliveryData.clientId).get()
          if (clientSnap.exists) {
            const clientData = clientSnap.data()!
            if (clientData.email) clientEmail = clientData.email
            if (clientData.fullName) clientName = clientData.fullName
            if (clientData.photoURL) clientLogoUrl = clientData.photoURL
          }
        }

        // Fetch brand logo
        let lexmediaLogoUrl = ''
        const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
        if (brandingSnap.exists) {
          const bData = brandingSnap.data()!
          if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
        }

        if (clientEmail) {
          const publicUrl = `${new URL(req.url).origin}/delivery/${encodeURIComponent(deliveryData.accessToken)}`
          const emailRes = await sendDeliveryReadyEmail({
            toEmail: clientEmail,
            clientName,
            projectName: deliveryData.projectName || 'Your Project',
            deliveryUrl: publicUrl,
            lexmediaLogoUrl,
            clientLogoUrl,
          })

          if (emailRes.success) {
            updates.notifyEmailSent = true
            updates.notifyEmailSentAt = FieldValue.serverTimestamp()
            updates.notifyEmailMessageId = emailRes.messageId || null
            emailNotificationStatus = { sent: true, messageId: emailRes.messageId }
          } else {
            emailNotificationStatus = { sent: false, error: emailRes.error }
            console.warn(`[Delivery Release] Brevo email notification failed for delivery ${deliveryId}:`, emailRes.error)
          }
        } else {
          emailNotificationStatus = { sent: false, error: 'Client email address is missing' }
          console.warn(`[Delivery Release] No email address found for client ${deliveryData.clientId}`)
        }
      }
    } else {
      updates.releasedAt = null
      // Revert status to Not Ready if revoking
      if (deliveryData.status === 'Ready for Delivery') {
        updates.status = 'Not Ready'
      }
    }

    await deliveryRef.update(updates)

    // Log activity
    if (willRelease) {
      await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
        event: 'delivery_released',
        description: isAdminOverride
          ? `Admin Override: Delivery manually released for "${deliveryData.projectName || 'Project'}" by ${adminUser}${updates.adminOverrideReason ? ` (Reason: ${updates.adminOverrideReason})` : ''}`
          : `Delivery released to client for "${deliveryData.projectName || 'Project'}"${emailNotificationStatus.sent ? ' (Email sent via Brevo)' : ''}`,
        clientId: deliveryData.clientId,
        clientName: deliveryData.clientName,
        entityId: deliveryId,
        entityType: 'delivery',
        metadata: {
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

    // Return the accessToken from Firestore (source of truth) so admin builds URL from this
    return NextResponse.json({
      success: true,
      deliveryId,
      accessToken: deliveryData.accessToken,
      publicUrl: `${new URL(req.url).origin}/delivery/${encodeURIComponent(deliveryData.accessToken)}`,
      isReleased: willRelease,
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
