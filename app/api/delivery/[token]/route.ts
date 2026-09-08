import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token
    if (!token) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // Find delivery matching accessToken
    // NOTE: This query requires ONLY a single-field index on deliveries.accessToken
    // which Firestore creates automatically. No composite index needed.
    const deliveriesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('accessToken', '==', token)
      .limit(1)
      .get()

    if (deliveriesSnap.empty) {
      console.warn(`[Delivery] Token not found in Firestore: ${token.slice(0, 8)}...`)
      return NextResponse.json({ error: 'Delivery not found or link is invalid' }, { status: 404 })
    }

    const deliveryDoc = deliveriesSnap.docs[0]
    const deliveryData = deliveryDoc.data()
    const deliveryId = deliveryDoc.id

    // Check expiration
    if (deliveryData.expiresAt) {
      let expiresDate: Date
      if (deliveryData.expiresAt instanceof Timestamp) {
        expiresDate = deliveryData.expiresAt.toDate()
      } else if (deliveryData.expiresAt?.seconds) {
        expiresDate = new Date(deliveryData.expiresAt.seconds * 1000)
      } else {
        expiresDate = new Date(deliveryData.expiresAt)
      }
      if (expiresDate.getTime() < Date.now()) {
        return NextResponse.json({
          error: 'This delivery link has expired. Please contact LexMedia for a new link.',
          isExpired: true,
        }, { status: 410 })
      }
    }

    // Check payment lock
    // If admin has manually released → ALWAYS allow access
    // If requiresFullPayment AND not released AND has invoiceId → check invoice
    let isLocked = false
    let lockReason = ''

    if (deliveryData.requiresFullPayment && !deliveryData.isReleased && deliveryData.invoiceId) {
      try {
        const invoiceSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryData.invoiceId).get()
        if (invoiceSnap.exists) {
          const invData = invoiceSnap.data()
          if (invData && invData.status !== 'Paid') {
            isLocked = true
            lockReason = 'Delivery files will become available once the project payment is completed. Please contact LexMedia if you believe this is an error.'
          }
        }
        // If invoice doesn't exist → don't lock
      } catch (invErr) {
        console.warn('[Delivery] Could not fetch invoice for lock check:', invErr)
        // On invoice fetch error, allow access (don't block client)
      }
    }

    if (isLocked) {
      return NextResponse.json({
        isLocked: true,
        lockReason,
        delivery: {
          title: deliveryData.title,
          projectName: deliveryData.projectName,
          clientName: deliveryData.clientName,
        }
      }, { status: 403 })
    }

    // Fetch delivery files — NO orderBy (avoids composite index requirement)
    // Sort in memory instead
    const filesSnap = await adminDb
      .collection(COLLECTIONS.DELIVERY_FILES)
      .where('deliveryId', '==', deliveryId)
      .get()

    const files = filesSnap.docs
      .map((d) => {
        const fd = d.data()
        let uploadedAtISO: string | null = null
        if (fd.uploadedAt instanceof Timestamp) {
          uploadedAtISO = fd.uploadedAt.toDate().toISOString()
        } else if (fd.uploadedAt?.seconds) {
          uploadedAtISO = new Date(fd.uploadedAt.seconds * 1000).toISOString()
        } else if (fd.uploadedAt) {
          uploadedAtISO = new Date(fd.uploadedAt).toISOString()
        }
        return {
          id: d.id,
          fileName: fd.fileName,
          originalName: fd.originalName,
          fileType: fd.fileType,
          fileSize: fd.fileSize,
          downloadUrl: fd.downloadUrl,
          downloadCount: fd.downloadCount || 0,
          uploadedAt: uploadedAtISO,
          _uploadedAtMs: uploadedAtISO ? new Date(uploadedAtISO).getTime() : 0,
        }
      })
      // Sort descending by uploadedAt in memory
      .sort((a, b) => b._uploadedAtMs - a._uploadedAtMs)
      .map(({ _uploadedAtMs, ...f }) => f) // remove temp sort field

    // Track access
    const isFirstAccess = !deliveryData.firstAccessedAt
    const updates: any = {
      lastAccessedAt: FieldValue.serverTimestamp(),
      accessCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (isFirstAccess) {
      updates.firstAccessedAt = FieldValue.serverTimestamp()
      if (deliveryData.status === 'Ready for Delivery' || deliveryData.status === 'Not Ready') {
        updates.status = 'Delivered'
      }
    } else if (deliveryData.status === 'Delivered') {
      // If any files were downloaded, escalate to Downloaded (tracked separately in /download route)
    }

    try {
      await deliveryDoc.ref.update(updates)
    } catch (updateErr) {
      console.warn('[Delivery] Non-fatal: Could not update access tracking:', updateErr)
    }

    // Log activity for first access
    if (isFirstAccess) {
      try {
        await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
          event: 'delivery_opened',
          description: `Client opened delivery for "${deliveryData.projectName || deliveryData.title}"`,
          clientId: deliveryData.clientId,
          clientName: deliveryData.clientName,
          entityId: deliveryId,
          entityType: 'delivery',
          performedBy: 'client',
          createdAt: FieldValue.serverTimestamp(),
        })
      } catch (logErr) {
        console.warn('[Delivery] Non-fatal: Could not create activity log:', logErr)
      }
    }

    // Normalize timestamps for response
    const toISO = (ts: any): string | null => {
      if (!ts) return null
      if (ts instanceof Timestamp) return ts.toDate().toISOString()
      if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString()
      return null
    }

    const totalSize = files.reduce((s, f) => s + (f.fileSize || 0), 0)

    return NextResponse.json({
      delivery: {
        id: deliveryId,
        title: deliveryData.title,
        projectName: deliveryData.projectName,
        clientName: deliveryData.clientName,
        status: deliveryData.status,
        isReleased: deliveryData.isReleased || false,
        expiresAt: toISO(deliveryData.expiresAt),
        releasedAt: toISO(deliveryData.releasedAt),
        notes: deliveryData.notes || '',
        fileCount: files.length,
        totalSize: deliveryData.totalSize || totalSize,
      },
      files,
    })
  } catch (error: any) {
    const message = error?.message || 'Unknown delivery lookup error'
    const isConfigurationError = /Admin SDK is not configured|Failed to initialize Firebase Admin SDK/i.test(message)
    console.error('[Delivery] Lookup failure:', { code: error?.code, message })
    return NextResponse.json(
      {
        error: isConfigurationError
          ? 'Delivery service is temporarily unavailable. Please contact LexMedia.'
          : 'Delivery records are temporarily unavailable. Please try again later.',
        code: isConfigurationError ? 'DELIVERY_CONFIGURATION_ERROR' : 'DELIVERY_DATABASE_ERROR',
      },
      { status: isConfigurationError ? 503 : 500 }
    )
  }
}
