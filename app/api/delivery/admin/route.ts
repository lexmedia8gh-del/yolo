import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

function generateToken(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

function toISO(ts: any): string | null {
  if (!ts) return null
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString()
  return typeof ts === 'string' ? ts : null
}

function deliveryScore(data: DocumentData): number {
  const statusScore: Record<string, number> = { Downloaded: 40, Delivered: 30, 'Ready for Delivery': 20 }
  return (data.fileCount || 0) * 1000 + (data.isReleased ? 100 : 0) + (statusScore[data.status] || 0)
}

async function ensureCanonicalDelivery(input: {
  projectId: string
  clientId: string
  clientName: string
  projectName: string
  invoiceId: string
}) {
  const db = getAdminDb()
  const canonicalRef = db.collection(COLLECTIONS.DELIVERIES).doc(input.projectId)
  const existing = await canonicalRef.get()
  if (existing.exists) return { id: canonicalRef.id, data: existing.data()!, migrated: false }

  const legacy = await db.collection(COLLECTIONS.DELIVERIES).where('projectId', '==', input.projectId).get()
  const ordered = [...legacy.docs].sort((a, b) => {
    const scoreDiff = deliveryScore(b.data()) - deliveryScore(a.data())
    if (scoreDiff) return scoreDiff
    const aTime = a.data().createdAt?.toMillis?.() || 0
    const bTime = b.data().createdAt?.toMillis?.() || 0
    return aTime - bTime
  })
  const source = ordered[0]
  const sourceData = source?.data()

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(canonicalRef)
    if (current.exists) return

    const base = sourceData
      ? {
          ...sourceData,
          projectId: input.projectId,
          clientId: sourceData.clientId || input.clientId,
          clientName: sourceData.clientName || input.clientName,
          projectName: sourceData.projectName || input.projectName,
          invoiceId: sourceData.invoiceId || input.invoiceId || null,
          migratedLegacyDeliveryIds: ordered.map((doc) => doc.id),
          updatedAt: FieldValue.serverTimestamp(),
        }
      : {
          clientId: input.clientId,
          clientName: input.clientName,
          projectId: input.projectId,
          projectName: input.projectName,
          invoiceId: input.invoiceId || null,
          title: `${input.projectName} Final Files`,
          notes: '',
          status: 'Not Ready',
          accessToken: generateToken(),
          expiresAt: null,
          expirationOption: 'never',
          isReleased: false,
          requiresFullPayment: true,
          accessCount: 0,
          fileCount: 0,
          totalSize: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }

    transaction.create(canonicalRef, base)
  })

  // Move files to the canonical id before retiring legacy records.  Legacy records
  // are retained with a pointer so prior activity/history remains auditable.
  for (const legacyDoc of ordered) {
    if (legacyDoc.id === canonicalRef.id) continue
    const files = await db.collection(COLLECTIONS.DELIVERY_FILES).where('deliveryId', '==', legacyDoc.id).get()
    const batch = db.batch()
    files.docs.forEach((file) => batch.update(file.ref, { deliveryId: canonicalRef.id, updatedAt: FieldValue.serverTimestamp() }))
    // The canonical record retains the legacy ids for audit.  Files move first, then
    // the redundant record is removed so a project has exactly one delivery document.
    batch.delete(legacyDoc.ref)
    await batch.commit()
  }

  const canonical = await canonicalRef.get()
  return { id: canonicalRef.id, data: canonical.data()!, migrated: ordered.length > 0 }
}

function publicUrl(req: NextRequest, token: string) {
  return `${new URL(req.url).origin}/delivery/${encodeURIComponent(token)}`
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const result = await ensureCanonicalDelivery({
      projectId,
      clientId: searchParams.get('clientId') || '',
      clientName: searchParams.get('clientName') || 'Client',
      projectName: searchParams.get('projectName') || 'Project',
      invoiceId: searchParams.get('invoiceId') || '',
    })
    const { id: deliveryId, data } = result
    const db = getAdminDb()
    const filesSnap = await db.collection(COLLECTIONS.DELIVERY_FILES).where('deliveryId', '==', deliveryId).get()
    const files = filesSnap.docs.map((doc) => {
      const file = doc.data()
      return {
        id: doc.id, fileName: file.fileName, originalName: file.originalName,
        fileType: file.fileType, fileSize: file.fileSize, storagePath: file.storagePath,
        downloadUrl: file.downloadUrl, downloadCount: file.downloadCount || 0, uploadedAt: toISO(file.uploadedAt),
      }
    }).sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())

    return NextResponse.json({
      delivery: {
        id: deliveryId, clientId: data.clientId, clientName: data.clientName,
        projectId: data.projectId, projectName: data.projectName, invoiceId: data.invoiceId || null,
        title: data.title, notes: data.notes || '', status: data.status || 'Not Ready',
        accessToken: data.accessToken, expirationOption: data.expirationOption || 'never',
        expiresAt: toISO(data.expiresAt), isReleased: data.isReleased || false,
        requiresFullPayment: data.requiresFullPayment !== false, releasedAt: toISO(data.releasedAt),
        accessCount: data.accessCount || 0, fileCount: files.length,
        totalSize: data.totalSize || files.reduce((sum, file) => sum + (file.fileSize || 0), 0),
        createdAt: toISO(data.createdAt), updatedAt: toISO(data.updatedAt),
      },
      files,
      publicUrl: publicUrl(req, data.accessToken),
      migratedLegacyRecords: result.migrated,
    })
  } catch (error: any) {
    console.error('[Delivery Admin GET] Error:', error?.message)
    return NextResponse.json({ error: 'Failed to load delivery data.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { deliveryId, updates } = await req.json()
    if (!deliveryId || !updates) return NextResponse.json({ error: 'Missing delivery update.' }, { status: 400 })
    const ref = getAdminDb().collection(COLLECTIONS.DELIVERIES).doc(deliveryId)
    await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() })
    const updated = await ref.get()
    const accessToken = updated.data()?.accessToken
    return NextResponse.json({ success: true, accessToken, publicUrl: accessToken ? publicUrl(req, accessToken) : null })
  } catch (error: any) {
    console.error('[Delivery Admin PATCH] Error:', error?.message)
    return NextResponse.json({ error: 'Failed to update delivery.' }, { status: 500 })
  }
}