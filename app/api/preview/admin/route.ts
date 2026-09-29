import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp as ClientTimestamp } from 'firebase/firestore'
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { generateSecureToken } from '@/lib/utils'
import type { PreviewExpirationOption, PreviewStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

function calculateExpiration(option: PreviewExpirationOption, customDate?: string): AdminTimestamp | null {
  const now = Date.now()
  if (option === 'never') return null
  if (option === '1_hour') return AdminTimestamp.fromMillis(now + 60 * 60 * 1000)
  if (option === '24_hours') return AdminTimestamp.fromMillis(now + 24 * 60 * 60 * 1000)
  if (option === '3_days') return AdminTimestamp.fromMillis(now + 3 * 24 * 60 * 60 * 1000)
  if (option === '7_days') return AdminTimestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000)
  if (option === 'custom' && customDate) {
    const millis = new Date(customDate).getTime()
    return isNaN(millis) ? null : AdminTimestamp.fromMillis(millis)
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const clientId = searchParams.get('clientId')

    let previews: any[] = []

    try {
      const adminDb = getAdminDb()
      let ref: any = adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS)

      if (projectId) {
        ref = ref.where('projectId', '==', projectId)
      } else if (clientId) {
        ref = ref.where('clientId', '==', clientId)
      }

      const snap = await ref.orderBy('createdAt', 'desc').get()
      previews = snap.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
      }))
    } catch {
      // Client SDK fallback
      const snap = await getDocs(collection(db, COLLECTIONS.CLIENT_PREVIEWS))
      previews = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      if (projectId) {
        previews = previews.filter((p) => p.projectId === projectId)
      } else if (clientId) {
        previews = previews.filter((p) => p.clientId === clientId)
      }
    }

    return NextResponse.json({ success: true, previews })
  } catch (err: any) {
    console.error('[Preview Admin GET Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to list previews' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      id,
      clientId,
      clientName,
      clientEmail,
      projectId,
      projectName,
      quickJobId,
      title,
      description,
      status = 'Active',
      expirationOption = '7_days',
      customExpirationDate,
      watermark,
      assets = [],
    } = body

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required for the client preview' }, { status: 400 })
    }

    if (!clientId && !clientName) {
      return NextResponse.json({ error: 'Client selection is required' }, { status: 400 })
    }

    const expiresAt = calculateExpiration(expirationOption as PreviewExpirationOption, customExpirationDate)

    const watermarkConfig = {
      enabled: watermark?.enabled !== false,
      text:
        watermark?.text?.trim() ||
        '[CTRL ROOM] CONFIDENTIAL PREVIEW\n{{client_name}} | {{project_name}}\nSession: {{session_id}}\n{{date}}',
      opacity: typeof watermark?.opacity === 'number' ? watermark.opacity : 0.22,
      fontSize: watermark?.fontSize || 14,
      tilePattern: watermark?.tilePattern !== false,
      dynamicPosition: watermark?.dynamicPosition !== false,
    }

    const formattedAssets = assets.map((a: any, idx: number) => ({
      id: a.id || `asset_${Date.now()}_${idx}`,
      name: a.name || a.originalName || `Asset ${idx + 1}`,
      originalName: a.originalName || a.name || `Asset ${idx + 1}`,
      fileType: a.fileType || a.type || 'application/octet-stream',
      fileSize: a.fileSize || a.size || 0,
      storagePath: a.storagePath || a.path || '',
      sourceStorage: a.sourceStorage || 'supabase',
      width: a.width || null,
      height: a.height || null,
      duration: a.duration || null,
      order: a.order ?? idx,
    }))

    try {
      const adminDb = getAdminDb()

      if (id) {
        // Update existing preview
        await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).update({
          clientId: clientId || '',
          clientName: clientName || '',
          clientEmail: clientEmail || '',
          projectId: projectId || '',
          projectName: projectName || '',
          quickJobId: quickJobId || '',
          title: title.trim(),
          description: (description || '').trim(),
          status: (status as PreviewStatus) || 'Active',
          expirationOption,
          expiresAt,
          watermark: watermarkConfig,
          assets: formattedAssets,
          updatedAt: FieldValue.serverTimestamp(),
        })

        const updatedSnap = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(id).get()
        return NextResponse.json({
          success: true,
          preview: { id, ...updatedSnap.data() },
        })
      } else {
        // Create new preview
        const token = generateSecureToken('prev_')

        const newPreviewData = {
          token,
          clientId: clientId || '',
          clientName: clientName || 'Client',
          clientEmail: clientEmail || '',
          projectId: projectId || '',
          projectName: projectName || 'Deliverable',
          quickJobId: quickJobId || '',
          title: title.trim(),
          description: (description || '').trim(),
          status: (status as PreviewStatus) || 'Active',
          expirationOption,
          expiresAt,
          watermark: watermarkConfig,
          assets: formattedAssets,
          viewCount: 0,
          lastViewedAt: null,
          revokedAt: null,
          revokedReason: '',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: 'admin',
        }

        const docRef = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).add(newPreviewData)

        return NextResponse.json({
          success: true,
          previewId: docRef.id,
          token,
          preview: { id: docRef.id, ...newPreviewData },
        })
      }
    } catch {
      // Client SDK fallback when Admin SDK is not configured in current runtime
      if (id) {
        const docRef = doc(db, COLLECTIONS.CLIENT_PREVIEWS, id)
        await updateDoc(docRef, {
          clientId: clientId || '',
          clientName: clientName || '',
          clientEmail: clientEmail || '',
          projectId: projectId || '',
          projectName: projectName || '',
          quickJobId: quickJobId || '',
          title: title.trim(),
          description: (description || '').trim(),
          status: (status as PreviewStatus) || 'Active',
          expirationOption,
          expiresAt: expiresAt ? ClientTimestamp.fromMillis(expiresAt.toMillis()) : null,
          watermark: watermarkConfig,
          assets: formattedAssets,
        })

        return NextResponse.json({
          success: true,
          preview: { id, title: title.trim(), status, assets: formattedAssets },
        })
      } else {
        const token = generateSecureToken('prev_')
        const newPreviewData = {
          token,
          clientId: clientId || '',
          clientName: clientName || 'Client',
          clientEmail: clientEmail || '',
          projectId: projectId || '',
          projectName: projectName || 'Deliverable',
          quickJobId: quickJobId || '',
          title: title.trim(),
          description: (description || '').trim(),
          status: (status as PreviewStatus) || 'Active',
          expirationOption,
          expiresAt: expiresAt ? ClientTimestamp.fromMillis(expiresAt.toMillis()) : null,
          watermark: watermarkConfig,
          assets: formattedAssets,
          viewCount: 0,
          lastViewedAt: null,
          revokedAt: null,
          revokedReason: '',
          createdBy: 'admin',
        }

        const docRef = await addDoc(collection(db, COLLECTIONS.CLIENT_PREVIEWS), newPreviewData)

        return NextResponse.json({
          success: true,
          previewId: docRef.id,
          token,
          preview: { id: docRef.id, ...newPreviewData },
        })
      }
    }
  } catch (err: any) {
    console.error('[Preview Admin POST Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to save client preview' },
      { status: 500 }
    )
  }
}
