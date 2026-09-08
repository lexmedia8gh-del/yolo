import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import nodePath from 'path'
import nodeFs from 'fs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/delivery/cleanup
 * Server-side cleanup of expired delivery files.
 * Protected by a secret key so it can be called from a cron job / scheduled task.
 * Also callable from the admin UI for manual cleanup.
 */
export async function POST(req: NextRequest) {
  // Verify secret key so random people can't trigger this
  const body = await req.json().catch(() => ({}))
  const secret = body?.secret || req.headers.get('x-cleanup-secret')
  const expectedSecret = process.env.CLEANUP_SECRET || 'lexmedia-cleanup-secret'
  
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Timestamp.now()
  const adminDb = getAdminDb()
  let adminStorage: any
  try { adminStorage = getAdminStorage() } catch { /* no bucket configured */ }

  const results = {
    scanned: 0,
    deleted: 0,
    errors: [] as string[],
  }

  try {
    // Find all deliveries with expiresAt <= now
    const expiredSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('expiresAt', '<=', now)
      .get()

    results.scanned = expiredSnap.size

    for (const deliveryDoc of expiredSnap.docs) {
      const deliveryData = deliveryDoc.data()
      const deliveryId = deliveryDoc.id

      // Skip if already marked expired
      if (deliveryData.status === 'Expired') continue

      try {
        // Get all files for this delivery
        const filesSnap = await adminDb
          .collection(COLLECTIONS.DELIVERY_FILES)
          .where('deliveryId', '==', deliveryId)
          .get()

        const batch = adminDb.batch()

        for (const fileDoc of filesSnap.docs) {
          const fileData = fileDoc.data()
          const storagePath = fileData?.storagePath

          if (storagePath) {
            // 1. Delete from local disk
            try {
              const localPath = nodePath.join(process.cwd(), 'public', 'uploads', storagePath)
              if (nodeFs.existsSync(localPath)) {
                await nodeFs.promises.unlink(localPath)
              }
            } catch (e: any) {
              console.warn(`[Cleanup] Local delete failed for ${storagePath}:`, e.message)
            }

            // 2. Delete from Firebase Storage
            if (adminStorage) {
              try {
                await adminStorage.bucket().file(storagePath).delete()
              } catch (e: any) {
                if (e.code !== 404) {
                  console.warn(`[Cleanup] Storage delete failed for ${storagePath}:`, e.message)
                }
              }
            }
          }

          // 3. Delete Firestore file record
          batch.delete(fileDoc.ref)
          results.deleted++
        }

        // 4. Mark delivery as Expired (do NOT delete delivery doc — keep audit trail)
        batch.update(deliveryDoc.ref, {
          status: 'Expired',
          expiredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        await batch.commit()

        console.log(`[Cleanup] Expired delivery ${deliveryId}: ${filesSnap.size} file(s) deleted.`)
      } catch (e: any) {
        const msg = `Failed to cleanup delivery ${deliveryId}: ${e.message}`
        console.error('[Cleanup]', msg)
        results.errors.push(msg)
      }
    }

    return NextResponse.json({
      success: true,
      scanned: results.scanned,
      deleted: results.deleted,
      errors: results.errors,
    })
  } catch (error: any) {
    console.error('[Cleanup] Fatal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/delivery/cleanup
 * Returns count of expired (but not yet cleaned) deliveries.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cleanup-secret')
  const expectedSecret = process.env.CLEANUP_SECRET || 'lexmedia-cleanup-secret'
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Timestamp.now()
  const adminDb = getAdminDb()
  
  const snap = await adminDb
    .collection(COLLECTIONS.DELIVERIES)
    .where('expiresAt', '<=', now)
    .where('status', '!=', 'Expired')
    .get()

  return NextResponse.json({ pendingCleanup: snap.size })
}
