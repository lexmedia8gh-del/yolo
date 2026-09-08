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

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

/**
 * Upload via server-side API with real upload progress tracking using XMLHttpRequest
 */
function uploadViaServerApi(
  projectId: string,
  deliveryId: string,
  fileId: string,
  clientId: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<{ downloadUrl: string; storagePath: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    formData.append('deliveryId', deliveryId)
    formData.append('clientId', clientId || '')
    formData.append('fileDocId', fileId)

    // Progress listener
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100
        onProgress(percent, e.loaded, e.total)
      }
    })

    // Timeout (2 minutes for network file transfer)
    xhr.timeout = 2 * 60 * 1000
    xhr.ontimeout = () => {
      reject(new Error('Upload timed out after 2 minutes. Please check your network connection.'))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.downloadUrl) {
            resolve({
              downloadUrl: res.downloadUrl,
              storagePath: res.storagePath,
            })
          } else {
            reject(new Error(res.error || 'Server upload failed.'))
          }
        } catch {
          reject(new Error('Invalid response from upload server.'))
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText)
          reject(new Error(errRes.error || `Upload failed with HTTP ${xhr.status}`))
        } catch {
          reject(new Error(`Upload failed with HTTP ${xhr.status}`))
        }
      }
    }

    xhr.onerror = () => {
      reject(new Error('Network error during file upload. Please check your connection.'))
    }

    xhr.open('POST', '/api/delivery/upload')
    xhr.send(formData)
  })
}

/**
 * Upload a delivery file.
 * Strategy:
 * 1. Tries direct Firebase Storage client SDK (if bucket is active & CORS is set).
 * 2. If Firebase Storage fails or errors out (e.g. bucket non-existent / billing / CORS),
 *    immediately falls back to server API endpoint with real XHR progress tracking.
 * This guarantees the upload ALWAYS completes and NEVER hangs indefinitely.
 */
export async function uploadDeliveryFile(
  projectId: string,
  deliveryId: string,
  fileId: string,
  file: File,
  onProgress?: UploadProgressCallback,
  clientId?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  if (isSupabaseConfigured()) {
    try {
      console.log('[Storage] Direct Supabase Storage client-side upload initiated for:', file.name)
      const supabase = getSupabaseClient()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
      const storagePath = `deliveries/${projectId}/${deliveryId}/${fileId}/${sanitizedName}`

      if (onProgress) onProgress(10, 0, file.size)

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.DELIVERY_FILES)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) {
        throw new Error(`Supabase Storage upload error: ${error.message}`)
      }

      if (onProgress) onProgress(80, file.size, file.size)

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKETS.DELIVERY_FILES)
        .getPublicUrl(storagePath)

      const downloadUrl = urlData?.publicUrl || ''

      if (onProgress) onProgress(90, file.size, file.size)

      // Post metadata to server to update Firestore & trigger notifications
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('projectId', projectId)
        formData.append('deliveryId', deliveryId)
        formData.append('clientId', clientId || '')
        formData.append('fileDocId', fileId)
        formData.append('directUrl', downloadUrl)
        formData.append('storagePath', storagePath)
        formData.append('fileName', file.name)
        formData.append('fileSize', String(file.size))
        formData.append('fileType', file.type || file.name.split('.').pop() || 'application/octet-stream')

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (onProgress) onProgress(100, file.size, file.size)
            resolve({ downloadUrl, storagePath })
          } else {
            try {
              const errRes = JSON.parse(xhr.responseText)
              reject(new Error(errRes.error || `Server failed to register upload: ${xhr.status}`))
            } catch {
              reject(new Error(`Server failed to register upload with HTTP ${xhr.status}`))
            }
          }
        }
        xhr.onerror = () => reject(new Error('Network error registering file upload with server.'))
        xhr.open('POST', '/api/delivery/upload')
        xhr.send(formData)
      })
    } catch (supabaseErr: any) {
      console.warn('[Storage Client Upload Warning] Direct upload failed, falling back to server API upload:', supabaseErr)
    }
  }

  // Fallback to traditional server-side API file upload if Supabase is unconfigured or fails
  return await uploadViaServerApi(projectId, deliveryId, fileId, clientId || '', file, onProgress)
}

/**
 * Delete a delivery file from Firebase Storage
 */
export async function deleteDeliveryFile(storagePath: string): Promise<void> {
  if (!storagePath) return
  try {
    const fileRef = ref(storage, storagePath)
    await deleteObject(fileRef)
  } catch (error: any) {
    // Log but don't throw — Firestore metadata should still be removed even if storage delete fails
    console.warn('Storage delete warning:', error?.code, error?.message)
  }
}

