import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS } from '@/lib/supabase/storage'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { jobId, fileId, path: storagePath } = await req.json()

    if (!jobId || (!fileId && !storagePath)) {
      return NextResponse.json({ error: 'Missing jobId, fileId, or path' }, { status: 400 })
    }

    const adminDb = getAdminDb()

    // 1. Delete from Supabase Storage
    if (storagePath) {
      try {
        const supabase = getSupabaseServerClient()
        const buckets = [STORAGE_BUCKETS.DELIVERY_FILES, 'deliveries', 'delivery-files', 'quick-jobs']
        
        for (const b of buckets) {
          await supabase.storage.from(b).remove([storagePath])
        }
      } catch (sbErr) {
        console.warn('[Supabase Delete File Warning]:', sbErr)
      }
    }

    // 2. Delete file doc from Firestore if fileId exists
    if (fileId) {
      try {
        await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId).delete()
      } catch (fErr) {
        console.warn('[Firestore File Delete Warning]:', fErr)
      }
    }

    // 3. Update Delivery Document
    const delivSnap = await adminDb
      .collection(COLLECTIONS.DELIVERIES)
      .where('quickJobId', '==', jobId)
      .limit(1)
      .get()

    if (!delivSnap.empty) {
      const delivDoc = delivSnap.docs[0]
      const existingFiles: any[] = delivDoc.data().files || []
      const filteredFiles = existingFiles.filter(
        (f) => f.id !== fileId && f.path !== storagePath
      )

      const totalSize = filteredFiles.reduce((acc, f) => acc + (f.size || 0), 0)

      await delivDoc.ref.update({
        files: filteredFiles,
        fileCount: filteredFiles.length,
        totalSize,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Quick Jobs Delete File Error]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete file' },
      { status: 500 }
    )
  }
}
