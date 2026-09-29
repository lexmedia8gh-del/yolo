import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp as clientServerTimestamp,
  Timestamp as ClientTimestamp,
} from 'firebase/firestore'
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { createDeliveryFileSignedUrl, getDeliveryFilePublicUrl } from '@/lib/supabase/storage'
import { isSupabaseConfigured } from '@/lib/supabase/client'

function toISO(ts: any): string | null {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function parseExpirationDate(expiresAt: any): Date | null {
  if (!expiresAt) return null
  if (expiresAt instanceof AdminTimestamp || expiresAt instanceof ClientTimestamp) {
    return expiresAt.toDate()
  }
  if (typeof expiresAt.toDate === 'function') {
    return expiresAt.toDate()
  }
  if (expiresAt.seconds) {
    return new Date(expiresAt.seconds * 1000)
  }
  const parsed = new Date(expiresAt)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function handleGetClientPreview(
  req: NextRequest,
  params: { token: string }
) {
  try {
    const rawToken = params?.token
    const token = decodeURIComponent(rawToken || '').trim()

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          state: 'invalid',
          error: 'Preview link is invalid.',
          message: 'No preview token provided.',
        },
        { status: 400 }
      )
    }

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const ipSnippet = clientIp.includes('.')
      ? clientIp.split('.').slice(0, 2).join('.') + '.*.*'
      : clientIp.slice(0, 8) + '...'
    const userAgent = req.headers.get('user-agent') || 'Browser'
    const sessionId =
      req.headers.get('x-preview-session') ||
      `ses_${Math.random().toString(36).substring(2, 10)}`

    let previewDoc: any = null
    let previewId: string = ''
    let isFallback = false

    // 1. Try Firebase Admin DB
    try {
      const adminDb = getAdminDb()
      const snap = await adminDb
        .collection(COLLECTIONS.CLIENT_PREVIEWS)
        .where('token', '==', token)
        .limit(1)
        .get()

      if (snap.empty) {
        const docById = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(token).get()
        if (docById.exists) {
          previewDoc = docById.data()
          previewId = docById.id
        }
      } else {
        previewDoc = snap.docs[0].data()
        previewId = snap.docs[0].id
      }
    } catch {
      isFallback = true
    }

    // 2. Client Firestore SDK fallback
    if (!previewDoc) {
      try {
        const previewsRef = collection(db, COLLECTIONS.CLIENT_PREVIEWS)
        const q = query(previewsRef, where('token', '==', token))
        const snap = await getDocs(q)
        if (!snap.empty) {
          previewDoc = snap.docs[0].data()
          previewId = snap.docs[0].id
        }
      } catch (err: any) {
        console.error('[Client Preview GET fallback error]:', err?.message)
      }
    }

    // 3. Token not found -> Invalid Token state
    if (!previewDoc) {
      try {
        if (!isFallback) {
          const adminDb = getAdminDb()
          await adminDb.collection(COLLECTIONS.PREVIEW_LOGS).add({
            token,
            event: 'invalid_token',
            sessionId,
            userAgent,
            ipSnippet,
            timestamp: FieldValue.serverTimestamp(),
          })
        }
      } catch {}

      return NextResponse.json(
        {
          success: false,
          state: 'invalid',
          error: 'Preview link is invalid.',
          message: 'The preview link you followed may be incorrect, mistyped, or has been removed.',
        },
        { status: 404 }
      )
    }

    // 4. Check if Access Revoked
    if (previewDoc.status === 'Revoked') {
      try {
        if (!isFallback) {
          const adminDb = getAdminDb()
          await adminDb.collection(COLLECTIONS.PREVIEW_LOGS).add({
            previewId,
            token,
            clientId: previewDoc.clientId,
            clientName: previewDoc.clientName,
            projectName: previewDoc.projectName,
            event: 'access_revoked',
            sessionId,
            userAgent,
            ipSnippet,
            timestamp: FieldValue.serverTimestamp(),
          })
        }
      } catch {}

      return NextResponse.json(
        {
          success: false,
          state: 'revoked',
          isRevoked: true,
          error: 'Preview Access Revoked',
          message: 'This preview is no longer available.',
          revokedReason: previewDoc.revokedReason || 'Access ended by the studio administrator.',
          title: previewDoc.title || 'Client Deliverable',
          clientName: previewDoc.clientName || 'Client',
        },
        { status: 403 }
      )
    }

    // 5. Check if Expired (STEP 9: Never use 404 for expiration)
    const expiresDate = parseExpirationDate(previewDoc.expiresAt)
    const isPastExpiration = expiresDate !== null && expiresDate.getTime() <= Date.now()
    const isExpiredStatus = previewDoc.status === 'Expired'

    if (isPastExpiration || isExpiredStatus) {
      try {
        if (!isFallback) {
          const adminDb = getAdminDb()
          await adminDb.collection(COLLECTIONS.PREVIEW_LOGS).add({
            previewId,
            token,
            clientId: previewDoc.clientId,
            clientName: previewDoc.clientName,
            projectName: previewDoc.projectName,
            event: 'access_expired',
            sessionId,
            userAgent,
            ipSnippet,
            timestamp: FieldValue.serverTimestamp(),
          })
        }
      } catch {}

      return NextResponse.json(
        {
          success: false,
          state: 'expired',
          isExpired: true,
          error: 'Preview Expired',
          message: 'This preview is no longer available.',
          expiresAt: expiresDate ? expiresDate.toISOString() : null,
          title: previewDoc.title || 'Client Deliverable',
          clientName: previewDoc.clientName || 'Client',
        },
        { status: 410 }
      )
    }

    // 6. Valid Active Preview: Update metrics & record access log
    try {
      if (!isFallback) {
        const adminDb = getAdminDb()
        await adminDb
          .collection(COLLECTIONS.CLIENT_PREVIEWS)
          .doc(previewId)
          .update({
            viewCount: FieldValue.increment(1),
            lastViewedAt: FieldValue.serverTimestamp(),
          })

        await adminDb.collection(COLLECTIONS.PREVIEW_LOGS).add({
          previewId,
          token,
          clientId: previewDoc.clientId || '',
          clientName: previewDoc.clientName || '',
          projectId: previewDoc.projectId || '',
          projectName: previewDoc.projectName || '',
          event: 'access_granted',
          sessionId,
          userAgent,
          ipSnippet,
          timestamp: FieldValue.serverTimestamp(),
        })
      } else {
        const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, previewId)
        await updateDoc(docRef, {
          lastViewedAt: clientServerTimestamp(),
        })
      }
    } catch (metricErr: any) {
      console.warn('[Client Preview Metric Update Warning]:', metricErr?.message)
    }

    // 7. Sanitize and resolve preview asset URLs (prevent leaking private credentials)
    const rawAssets: any[] = Array.isArray(previewDoc.assets) ? previewDoc.assets : []
    const hasSupabase = isSupabaseConfigured()

    const sanitizedAssets = await Promise.all(
      rawAssets.map(async (asset: any, idx: number) => {
        let viewUrl = ''

        if (asset.storagePath) {
          if (hasSupabase) {
            try {
              const signed = await createDeliveryFileSignedUrl(asset.storagePath, 10800)
              if (signed.data?.signedUrl) {
                viewUrl = signed.data.signedUrl
              }
            } catch {}

            if (!viewUrl) {
              viewUrl = getDeliveryFilePublicUrl(asset.storagePath)
            }
          }
        }

        if (!viewUrl && (asset.url || asset.previewUrl || asset.downloadUrl)) {
          viewUrl = asset.url || asset.previewUrl || asset.downloadUrl
        }

        return {
          id: asset.id || `asset_${idx}`,
          name: asset.name || asset.originalName || `Proof Asset ${idx + 1}`,
          originalName: asset.originalName || asset.name || `Proof Asset ${idx + 1}`,
          fileType: asset.fileType || 'application/octet-stream',
          fileSize: asset.fileSize || 0,
          previewUrl: viewUrl,
          width: asset.width || null,
          height: asset.height || null,
          duration: asset.duration || null,
          order: asset.order ?? idx,
        }
      })
    )

    sanitizedAssets.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    const safeWatermark = {
      enabled: previewDoc.watermark?.enabled !== false,
      text:
        previewDoc.watermark?.text ||
        '[CTRL ROOM] CONFIDENTIAL PREVIEW\n{{client_name}} | {{project_name}}\nSession: {{session_id}}\n{{date}}',
      opacity: typeof previewDoc.watermark?.opacity === 'number' ? previewDoc.watermark.opacity : 0.22,
      fontSize: previewDoc.watermark?.fontSize || 14,
      tilePattern: previewDoc.watermark?.tilePattern !== false,
      dynamicPosition: previewDoc.watermark?.dynamicPosition !== false,
    }

    return NextResponse.json({
      success: true,
      state: 'valid',
      sessionId,
      preview: {
        id: previewId,
        token: previewDoc.token || token,
        title: previewDoc.title || 'Client Deliverable Proof',
        description: previewDoc.description || '',
        clientName: previewDoc.clientName || 'Valued Client',
        projectName: previewDoc.projectName || 'Creative Project',
        status: previewDoc.status || 'Active',
        expiresAt: expiresDate ? expiresDate.toISOString() : null,
        watermark: safeWatermark,
        assets: sanitizedAssets,
        createdAt: toISO(previewDoc.createdAt),
      },
    })
  } catch (err: any) {
    console.error('[Client Preview GET Unexpected Error]:', err)
    return NextResponse.json(
      {
        success: false,
        state: 'error',
        error: 'Unable to load preview.',
        message: 'Please try again later.',
      },
      { status: 500 }
    )
  }
}

export async function handleLogClientPreview(
  req: NextRequest,
  params: { token: string }
) {
  try {
    const rawToken = params?.token
    const token = decodeURIComponent(rawToken || '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const { event, assetId, assetName, sessionId, metadata } = body

    if (!event) {
      return NextResponse.json({ error: 'Missing event' }, { status: 400 })
    }

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const ipSnippet = clientIp.includes('.')
      ? clientIp.split('.').slice(0, 2).join('.') + '.*.*'
      : clientIp.slice(0, 8) + '...'
    const userAgent = req.headers.get('user-agent') || 'Browser'

    try {
      const adminDb = getAdminDb()
      let previewId = ''
      let clientName = ''
      let projectName = ''

      const snap = await adminDb
        .collection(COLLECTIONS.CLIENT_PREVIEWS)
        .where('token', '==', token)
        .limit(1)
        .get()

      if (!snap.empty) {
        const docSnap = snap.docs[0]
        previewId = docSnap.id
        clientName = docSnap.data()?.clientName || ''
        projectName = docSnap.data()?.projectName || ''
      }

      await adminDb.collection(COLLECTIONS.PREVIEW_LOGS).add({
        previewId,
        token,
        clientName,
        projectName,
        event,
        assetId: assetId || null,
        assetName: assetName || null,
        sessionId: sessionId || req.headers.get('x-preview-session') || 'unknown',
        userAgent,
        ipSnippet,
        metadata: metadata || null,
        timestamp: FieldValue.serverTimestamp(),
      })

      return NextResponse.json({ success: true })
    } catch {
      return NextResponse.json({ success: true })
    }
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
