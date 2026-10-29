import { ref, deleteObject } from 'firebase/storage'
import { storage, isFirebaseStorageConfigured, getAuthInstance } from './config'
import { COLLECTIONS, setDocument } from './firestore'
import { isSupabaseConfigured, getSupabaseClient } from '../supabase/client'
import {
  STORAGE_BUCKETS,
  deleteBrandingAssetFromSupabase,
  isSafeBrandingStoragePath,
  uploadBrandingAssetToSupabase,
} from '../supabase/storage'
import { ResumableUploadTask, UploadTaskProgress } from '../supabase/resumable'

export interface UploadProgressCallback {
  (progress: number, bytesTransferred: number, totalBytes: number): void
}

export type BrandingFieldKey = 'logo' | 'logoLight' | 'favicon'

export const ALLOWED_BRANDING_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const
export const ALLOWED_FAVICON_TYPES = [
  ...ALLOWED_BRANDING_LOGO_TYPES,
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

export interface BrandingLogoUploadResult {
  downloadUrl: string
  storagePath: string
  persisted: boolean
}

export interface StartBrandingUploadOptions {
  file: File
  fieldKey?: BrandingFieldKey
  maxMB?: number
  persistSettings?: boolean
  previousStoragePath?: string
  adminId?: string
  onProgress?: (progress: number) => void
}

/**
 * Validates file format and size on the client before initiating upload.
 */
export function validateBrandingImageFile(
  file: File | null | undefined,
  fieldKey: BrandingFieldKey = 'logo',
  maxMB = 5
): string | null {
  if (!file) {
    return 'Please select an image file to upload.'
  }

  const normalizedType = (file.type || '').toLowerCase().trim()
  const allowedList: readonly string[] =
    fieldKey === 'favicon' ? ALLOWED_FAVICON_TYPES : ALLOWED_BRANDING_LOGO_TYPES

  if (!allowedList.includes(normalizedType)) {
    return fieldKey === 'favicon'
      ? 'Unsupported file type. Please upload a PNG, JPEG, WebP, SVG, or ICO image.'
      : 'Unsupported file type. Please upload a PNG, JPEG, WebP, or SVG image.'
  }

  if (file.size <= 0) {
    return 'Selected image file is empty.'
  }

  if (file.size > maxMB * 1024 * 1024) {
    return `Image must be under ${maxMB}MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`
  }

  return null
}

function getFieldPair(fieldKey: BrandingFieldKey) {
  switch (fieldKey) {
    case 'logoLight':
      return { urlField: 'logoLightUrl', pathField: 'logoLightStoragePath' } as const
    case 'favicon':
      return { urlField: 'faviconUrl', pathField: 'faviconStoragePath' } as const
    default:
      return { urlField: 'logoUrl', pathField: 'logoStoragePath' } as const
  }
}

/**
 * Starts an authenticated invoice/branding logo upload to the Supabase Storage 'Delivery files' bucket
 * (`invoice-branding/{adminId}/{uniqueFileName}`) via `/api/branding/upload` with real XHR progress and cancellation.
 * Falls back cleanly to client-side Supabase Storage ('Delivery files') if server env vars are unconfigured.
 */
export function startBrandingLogoUpload(options: StartBrandingUploadOptions): {
  promise: Promise<BrandingLogoUploadResult>
  cancel: () => void
} {
  const {
    file,
    fieldKey = 'logo',
    maxMB = fieldKey === 'favicon' ? 2 : 5,
    persistSettings = true,
    previousStoragePath = '',
    adminId,
    onProgress,
  } = options

  let cancelled = false
  let activeXhr: XMLHttpRequest | null = null

  const cancel = () => {
    cancelled = true
    if (activeXhr) {
      try {
        activeXhr.abort()
      } catch {}
    }
  }

  const uploadViaClientSupabase = async (): Promise<BrandingLogoUploadResult> => {
    if (!isSupabaseConfigured()) {
      throw new Error(
        `Supabase Storage is not configured for bucket '${STORAGE_BUCKETS.DELIVERY_FILES}'.`
      )
    }

    const authUid = getAuthInstance()?.currentUser?.uid || adminId || 'admin'
    const safeAdminId = authUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'admin'
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    }
    const ext = extMap[file.type.toLowerCase()] || 'png'
    const rawStem =
      (file.name || 'logo')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'logo'
    const randomPart = Math.random().toString(36).slice(2, 10)
    const uniqueFileName = `${fieldKey}_${Date.now()}_${randomPart}_${rawStem}.${ext}`
    const requestedPath = `invoice-branding/${safeAdminId}/${uniqueFileName}`

    if (onProgress) onProgress(35)
    const uploadRes = await uploadBrandingAssetToSupabase({
      storagePath: requestedPath,
      file,
      contentType: file.type,
    })

    if (cancelled) {
      if (uploadRes.data?.storagePath) {
        await deleteBrandingAssetFromSupabase(uploadRes.data.storagePath)
      }
      const cancelErr = new Error('Upload cancelled')
      ;(cancelErr as any).cancelled = true
      throw cancelErr
    }

    if (uploadRes.error || !uploadRes.data) {
      throw uploadRes.error || new Error(`Upload to '${STORAGE_BUCKETS.DELIVERY_FILES}' failed.`)
    }

    const storagePath = uploadRes.data.storagePath
    const downloadUrl = `/api/branding/image?path=${encodeURIComponent(storagePath)}`
    let persisted = false

    if (persistSettings) {
      const { urlField, pathField } = getFieldPair(fieldKey)
      await setDocument(
        COLLECTIONS.SETTINGS,
        'branding',
        {
          [urlField]: downloadUrl,
          [pathField]: storagePath,
        },
        true
      )
      if (fieldKey === 'logo') {
        await setDocument(
          COLLECTIONS.SETTINGS,
          'business',
          {
            logoURL: downloadUrl,
            logoStoragePath: storagePath,
          },
          true
        )
      }
      persisted = true

      // Remove previous stored file from Supabase 'Delivery files' ONLY after upload + Firestore update succeeded
      if (isSafeBrandingStoragePath(previousStoragePath) && previousStoragePath !== storagePath) {
        await deleteBrandingAssetFromSupabase(previousStoragePath)
      }
    }

    if (onProgress) onProgress(100)
    return { downloadUrl, storagePath, persisted }
  }

  const promise = new Promise<BrandingLogoUploadResult>((resolve, reject) => {
    const validationError = validateBrandingImageFile(file, fieldKey, maxMB)
    if (validationError) {
      reject(new Error(validationError))
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('fieldKey', fieldKey)
    formData.append('persistSettings', String(persistSettings))
    if (previousStoragePath) {
      formData.append('previousStoragePath', previousStoragePath)
    }

    const xhr = new XMLHttpRequest()
    activeXhr = xhr

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(98, Math.round((event.loaded / event.total) * 100))
        onProgress(pct)
      }
    })

    xhr.onabort = () => {
      const abortErr = new Error('Upload cancelled')
      ;(abortErr as any).cancelled = true
      reject(abortErr)
    }

    xhr.onerror = () => {
      if (cancelled) {
        const abortErr = new Error('Upload cancelled')
        ;(abortErr as any).cancelled = true
        reject(abortErr)
        return
      }
      if (isSupabaseConfigured()) {
        uploadViaClientSupabase().then(resolve).catch(reject)
      } else {
        reject(
          new Error('Network error during logo upload. Please check your connection and try again.')
        )
      }
    }

    xhr.onload = async () => {
      let payload: any = null
      try {
        payload = JSON.parse(xhr.responseText || '{}')
      } catch {
        payload = {}
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.downloadUrl) {
        if (onProgress) onProgress(100)
        // Mirror into client Firestore listeners/documents when persistSettings is true
        if (persistSettings) {
          try {
            const { urlField, pathField } = getFieldPair(fieldKey)
            await setDocument(
              COLLECTIONS.SETTINGS,
              'branding',
              {
                [urlField]: payload.downloadUrl,
                [pathField]: payload.storagePath || '',
              },
              true
            )
            if (fieldKey === 'logo') {
              await setDocument(
                COLLECTIONS.SETTINGS,
                'business',
                {
                  logoURL: payload.downloadUrl,
                  logoStoragePath: payload.storagePath || '',
                },
                true
              )
            }
          } catch {}
        }
        resolve({
          downloadUrl: payload.downloadUrl,
          storagePath: payload.storagePath || '',
          persisted: Boolean(payload.persisted || persistSettings),
        })
        return
      }

      if (xhr.status === 503 && payload?.code === 'STORAGE_UNCONFIGURED' && isSupabaseConfigured()) {
        try {
          const clientRes = await uploadViaClientSupabase()
          resolve(clientRes)
          return
        } catch (fallbackErr) {
          reject(fallbackErr)
          return
        }
      }

      reject(new Error(payload?.error || `Logo upload failed (HTTP ${xhr.status}).`))
    }

    xhr.open('POST', '/api/branding/upload')
    xhr.send(formData)
  })

  return { promise, cancel }
}

/**
 * Removes a stored branding logo from Firestore settings first, then deletes the object from Supabase 'Delivery files'.
 */
export async function removeBrandingLogo(options: {
  fieldKey?: BrandingFieldKey
  storagePath?: string
  persistSettings?: boolean
}): Promise<void> {
  const { fieldKey = 'logo', storagePath = '', persistSettings = true } = options
  const { urlField, pathField } = getFieldPair(fieldKey)

  if (persistSettings) {
    await setDocument(
      COLLECTIONS.SETTINGS,
      'branding',
      {
        [urlField]: '',
        [pathField]: '',
      },
      true
    )
    if (fieldKey === 'logo') {
      await setDocument(
        COLLECTIONS.SETTINGS,
        'business',
        {
          logoURL: '',
          logoStoragePath: '',
        },
        true
      )
    }
  }

  try {
    const res = await fetch('/api/branding/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldKey,
        storagePath,
        persistSettings,
      }),
    })

    if (!res.ok && isSupabaseConfigured() && isSafeBrandingStoragePath(storagePath)) {
      await deleteBrandingAssetFromSupabase(storagePath)
    }
  } catch {
    if (isSupabaseConfigured() && isSafeBrandingStoragePath(storagePath)) {
      await deleteBrandingAssetFromSupabase(storagePath)
    }
  }
}

/**
 * Upload a delivery file with resumable chunked support, network recovery, and auto retries.
 */
export async function uploadDeliveryFile(
  projectId: string | undefined,
  deliveryId: string,
  fileId: string,
  file: File,
  onProgress?: UploadProgressCallback,
  clientId?: string,
  quickJobId?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const task = new ResumableUploadTask({
    projectId,
    quickJobId,
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

  if (!isFirebaseStorageConfigured) return

  try {
    const fileRef = ref(storage, storagePath)
    await deleteObject(fileRef)
  } catch (error: any) {
    console.warn('Storage delete warning:', error?.code, error?.message)
  }
}
