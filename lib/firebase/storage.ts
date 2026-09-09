import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTaskSnapshot,
} from 'firebase/storage'
import { storage } from './config'
import { isSupabaseConfigured, getSupabaseClient } from '../supabase/client'
import { STORAGE_BUCKETS } from '../supabase/storage'
import { ResumableUploadTask, UploadTaskProgress } from '../supabase/resumable'

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

/**
 * Upload a delivery file with resumable chunked support, network recovery, and auto retries.
 */
export async function uploadDeliveryFile(
  projectId: string,
  deliveryId: string,
  fileId: string,
  file: File,
  onProgress?: UploadProgressCallback,
  clientId?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const task = new ResumableUploadTask({
    projectId,
    deliveryId,
    fileId,
    file,
    clientId,
    onProgress: (p: UploadTaskProgress) => {
      if (onProgress) {
        onProgress(p.percent, p.bytesUploaded, p.fileSize)
      }
    },
  })

  return await task.start()
}


/**
 * Delete a delivery file from Supabase Storage (with fallback to Firebase Storage)
 */
export async function deleteDeliveryFile(storagePath: string): Promise<void> {
  if (!storagePath) return
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.storage
        .from(STORAGE_BUCKETS.DELIVERY_FILES)
        .remove([storagePath])
      if (error) {
        console.warn('Supabase storage delete error:', error.message)
      } else {
        console.log('[Storage] Successfully deleted from Supabase Storage:', storagePath)
      }
      return
    } catch (err: any) {
      console.warn('Supabase delete warning:', err?.message)
    }
  }

  try {
    const fileRef = ref(storage, storagePath)
    await deleteObject(fileRef)
  } catch (error: any) {
    // Log but don't throw — Firestore metadata should still be removed even if storage delete fails
    console.warn('Storage delete warning:', error?.code, error?.message)
  }
}

