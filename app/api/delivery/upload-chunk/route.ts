import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS } from '@/lib/supabase/storage'

export const dynamic = 'force-dynamic'

// Memory/Temporary cache for in-progress chunk assemblies
const fileChunksMap: Map<string, { chunks: Buffer[]; totalChunks: number; receivedChunks: number }> = new Map()

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await req.formData()
    const chunkFile = formData.get('chunk') as File | null
    const fileId = (formData.get('fileId') as string) || ''
    const chunkIndex = parseInt((formData.get('chunkIndex') as string) || '0', 10)
    const totalChunks = parseInt((formData.get('totalChunks') as string) || '1', 10)
    const fileName = (formData.get('fileName') as string) || 'file'
    const fileSize = parseInt((formData.get('fileSize') as string) || '0', 10)
    const fileType = (formData.get('fileType') as string) || 'application/octet-stream'
    const projectId = (formData.get('projectId') as string) || ''
    const quickJobId = (formData.get('quickJobId') as string) || ''
    const deliveryId = (formData.get('deliveryId') as string) || ''
    const clientId = (formData.get('clientId') as string) || ''

    if (!chunkFile || !fileId || (!projectId && !quickJobId) || !deliveryId) {
      return NextResponse.json({ error: 'Missing required chunk parameter' }, { status: 400 })
    }

    const chunkArrayBuffer = await chunkFile.arrayBuffer()
    const chunkBuffer = Buffer.from(chunkArrayBuffer)

    // Store chunk in memory map
    let fileEntry = fileChunksMap.get(fileId)
    if (!fileEntry) {
      fileEntry = { chunks: new Array(totalChunks), totalChunks, receivedChunks: 0 }
      fileChunksMap.set(fileId, fileEntry)
    }

    if (!fileEntry.chunks[chunkIndex]) {
      fileEntry.chunks[chunkIndex] = chunkBuffer
      fileEntry.receivedChunks++
    }

    // If not all chunks received yet, acknowledge chunk
    if (fileEntry.receivedChunks < totalChunks) {
      return NextResponse.json({
        success: true,
        chunkIndex,
        receivedChunks: fileEntry.receivedChunks,
        totalChunks,
        done: false,
      })
    }

    // All chunks received! Assemble complete file buffer
    const completeBuffer = Buffer.concat(fileEntry.chunks)
    fileChunksMap.delete(fileId) // Clean up memory

    const parentId = projectId || quickJobId || 'unassigned'
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const storagePath = `deliveries/${parentId}/${deliveryId}/${fileId}/${sanitizedName}`

    // Upload complete assembled buffer to Supabase Storage
    const supabase = getSupabaseServerClient()
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .upload(storagePath, completeBuffer, {
        contentType: fileType,
        upsert: true,
      })

    if (uploadError) {
      console.error('[Chunk Upload] Storage upload error:', uploadError)
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .getPublicUrl(storagePath)

    const downloadUrl = urlData?.publicUrl || `/api/files?id=${fileId}`

    // Register Firestore record
    const adminDb = getAdminDb()
    const fileRecord = {
      deliveryId,
      projectId: projectId || null,
      quickJobId: quickJobId || null,
      clientId,
      fileName,
      originalName: fileName,
      fileType,
      fileSize: fileSize || completeBuffer.length,
      storagePath,
      downloadUrl,
      downloadCount: 0,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: 'admin',
    }

    await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId).set(fileRecord)

    // If this is for a Quick Job, synchronize the Quick Job status
    if (quickJobId) {
      try {
        const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(quickJobId)
        const qjSnap = await qjRef.get()
        if (qjSnap.exists) {
          const qjData = qjSnap.data()!
          const qjUpdates: any = { updatedAt: FieldValue.serverTimestamp() }
          if (qjData.status === 'In Progress' || qjData.status === 'Draft' || !qjData.status) {
            qjUpdates.status = 'Ready for Delivery'
          }
          await qjRef.set(qjUpdates, { merge: true })
        }
      } catch (qjErr) {
        console.warn('[Chunk Upload] Failed to sync Quick Job status:', qjErr)
      }
    }

    // Update delivery container record
    const deliveryRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc(deliveryId)
    const deliverySnap = await deliveryRef.get()
    if (deliverySnap.exists) {
      const deliveryData = deliverySnap.data()!
      const currentStatus = deliveryData.status || 'Not Ready'
      const nextStatus = currentStatus === 'Not Ready' ? 'Ready for Delivery' : currentStatus

      await deliveryRef.update({
        fileCount: FieldValue.increment(1),
        totalSize: FieldValue.increment(fileSize || completeBuffer.length),
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({
      success: true,
      done: true,
      fileId,
      downloadUrl,
      storagePath,
    })
  } catch (err: any) {
    console.error('[Chunk Upload Error]:', err)
    return NextResponse.json({ error: err?.message || 'Chunk upload failed' }, { status: 500 })
  }
}
