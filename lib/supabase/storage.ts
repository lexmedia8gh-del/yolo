import { getSupabaseClient, isSupabaseConfigured, getSupabaseConfigStatus } from './client'
import { getSupabaseServerClient } from './server'

/**
 * Storage bucket constants.
 * Note: 'Delivery files' is the existing Supabase storage bucket name.
 * DO NOT rename or change capitalization/spacing.
 */
export const STORAGE_BUCKETS = {
  DELIVERY_FILES: 'Delivery files',
} as const

export const KNOWN_STORAGE_BUCKETS = [
  'Delivery files',
  'delivery-files',
  'deliveries',
  'quick-jobs',
] as const

/**
 * Sanitizes and extracts the pure relative storage path within a bucket.
 * Handles leading slashes, full Supabase URLs, and bucket name prefixes.
 */
export function cleanStoragePath(path: string, bucketName: string = STORAGE_BUCKETS.DELIVERY_FILES): string {
  if (!path) return ''
  let cleaned = String(path).trim()

  // If it's a full URL from supabase storage, extract the path after the bucket
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    const urlParts = cleaned.split(/storage\/v1\/object\/(?:public|sign|authenticated)\/[^\/]+\//i)
    if (urlParts.length > 1) {
      cleaned = decodeURIComponent(urlParts[1].split('?')[0])
    }
  }

  // Remove leading slashes
  cleaned = cleaned.replace(/^\/+/, '')

  // Remove known bucket names if prepended
  for (const b of KNOWN_STORAGE_BUCKETS) {
    const safeB = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const encodedB = encodeURIComponent(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`^(?:${safeB}|${encodedB})\\/+`, 'i')
    cleaned = cleaned.replace(regex, '')
  }

  return cleaned.replace(/^\/+/, '')
}

export interface UploadFileOptions {
  path: string
  file: File | Blob | ArrayBuffer | Buffer
  contentType?: string
  upsert?: boolean
}

export interface StorageOperationResult<T = any> {
  data: T | null
  error: Error | null
}

/**
 * Uploads a file to the 'Delivery files' bucket in Supabase Storage.
 */
export async function uploadDeliveryFile({
  path,
  file,
  contentType,
  upsert = true,
}: UploadFileOptions): Promise<StorageOperationResult<{ path: string; id?: string; publicUrl?: string }>> {
  const status = getSupabaseConfigStatus()
  if (!status.configured) {
    return {
      data: null,
      error: new Error(status.error || 'Supabase is not configured.'),
    }
  }

  const cleanPath = cleanStoragePath(path)

  try {
    const supabase = typeof window === 'undefined' ? getSupabaseServerClient() : getSupabaseClient()
    let { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .upload(cleanPath, file, {
        contentType,
        upsert,
      })

    if (
      error &&
      (error.message.toLowerCase().includes('bucket not found') ||
        error.message.toLowerCase().includes('nosuchbucket'))
    ) {
      try {
        await supabase.storage.createBucket(STORAGE_BUCKETS.DELIVERY_FILES, { public: true })
        const retry = await supabase.storage
          .from(STORAGE_BUCKETS.DELIVERY_FILES)
          .upload(cleanPath, file, { contentType, upsert })
        data = retry.data
        error = retry.error
      } catch {}
    }

    if (error) {
      console.error('[Supabase Storage] Upload error:', error.message, error)
      const formattedMsg = (error as any).statusCode === '403' || error.message.toLowerCase().includes('row-level security') || error.message.toLowerCase().includes('permission')
        ? `Supabase Storage upload blocked by RLS permissions on '${STORAGE_BUCKETS.DELIVERY_FILES}' bucket.`
        : `Supabase Storage upload failed: ${error.message}`
      return { data: null, error: new Error(formattedMsg) }
    }

    const resPath = data?.path || cleanPath
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .getPublicUrl(resPath)

    return { data: { path: resPath, id: data?.id, publicUrl: urlData?.publicUrl }, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected upload error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err?.message || err)) }
  }
}

/**
 * Generates a public URL for a file in the 'Delivery files' bucket.
 */
export function getDeliveryFilePublicUrl(path: string): string {
  if (!isSupabaseConfigured()) return ''

  const cleanPath = cleanStoragePath(path)
  const supabase = typeof window === 'undefined' ? getSupabaseServerClient() : getSupabaseClient()
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.DELIVERY_FILES)
    .getPublicUrl(cleanPath)

  return data?.publicUrl || ''
}

/**
 * Creates a temporary signed download/preview URL for private files in Supabase Storage.
 * Uses the server-side client when invoked in server contexts (such as Next.js API Routes).
 */
export async function createDeliveryFileSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<StorageOperationResult<{ signedUrl: string }>> {
  const status = getSupabaseConfigStatus()
  if (!status.configured) {
    return {
      data: null,
      error: new Error(status.error || 'Supabase is not configured.'),
    }
  }

  const cleanPath = cleanStoragePath(path)

  try {
    const supabase = typeof window === 'undefined' ? getSupabaseServerClient() : getSupabaseClient()

    // Try primary bucket first
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .createSignedUrl(cleanPath, expiresInSeconds)

    if (!error && data?.signedUrl) {
      return { data, error: null }
    }

    // Fallback across known bucket aliases if primary failed
    for (const bucket of KNOWN_STORAGE_BUCKETS) {
      if (bucket === STORAGE_BUCKETS.DELIVERY_FILES) continue
      try {
        const retry = await supabase.storage
          .from(bucket)
          .createSignedUrl(cleanPath, expiresInSeconds)
        if (!retry.error && retry.data?.signedUrl) {
          return { data: retry.data, error: null }
        }
      } catch {}
    }

    if (error) {
      console.warn('[Supabase Storage] Warning creating signed URL for', cleanPath, ':', error.message)
      return { data: null, error: new Error(`Signed URL creation failed: ${error.message}`) }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected error creating signed URL:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err?.message || err)) }
  }
}

/**
 * Deletes one or more files from the 'Delivery files' bucket.
 */
export async function deleteDeliveryFiles(paths: string[]): Promise<StorageOperationResult<any>> {
  const status = getSupabaseConfigStatus()
  if (!status.configured) {
    return {
      data: null,
      error: new Error(status.error || 'Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .remove(paths)

    if (error) {
      console.error('[Supabase Storage] Delete error:', error.message)
      return { data: null, error: new Error(`Delete operation failed: ${error.message}`) }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected delete error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err?.message || err)) }
  }
}

/**
 * Lists files within a path in the 'Delivery files' bucket.
 * Gracefully handles empty buckets, permission errors, and missing buckets.
 */
export async function listDeliveryFiles(
  path = '',
  options?: { limit?: number; offset?: number; sortBy?: { column?: string; order?: string } }
): Promise<StorageOperationResult<any[]>> {
  const status = getSupabaseConfigStatus()
  if (!status.configured) {
    return {
      data: [],
      error: new Error(status.error || 'Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .list(path, options)

    if (error) {
      console.error('[Supabase Storage] List error:', error.message, error)
      const errLower = error.message.toLowerCase()
      let friendlyMessage = `Supabase Storage listing failed: ${error.message}`

      if (errLower.includes('bucket not found') || errLower.includes('does not exist')) {
        friendlyMessage = `Bucket '${STORAGE_BUCKETS.DELIVERY_FILES}' was not found in Supabase Storage.`
      } else if (errLower.includes('permission') || errLower.includes('security') || (error as any).statusCode === '403') {
        friendlyMessage = `Access denied reading bucket '${STORAGE_BUCKETS.DELIVERY_FILES}'. Check Supabase Storage RLS policies.`
      }

      return { data: null, error: new Error(friendlyMessage) }
    }

    // Clean empty bucket handling
    return { data: data || [], error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected list error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err?.message || err)) }
  }
}

