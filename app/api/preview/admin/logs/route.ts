import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const previewId = searchParams.get('previewId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const adminDb = getAdminDb()
    let ref: any = adminDb.collection(COLLECTIONS.PREVIEW_LOGS)

    if (previewId) {
      ref = ref.where('previewId', '==', previewId)
    }

    const snap = await ref.orderBy('timestamp', 'desc').limit(limit).get()

    const logs = snap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }))

    return NextResponse.json({ success: true, logs })
  } catch (err: any) {
    console.error('[Preview Logs GET Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch preview logs' },
      { status: 500 }
    )
  }
}
