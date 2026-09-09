import { getSupabaseClient, isSupabaseConfigured, getSupabaseConfigStatus } from './client'

/**
 * Storage bucket constants.
 * Note: 'Delivery files' is the existing Supabase storage bucket name.
 * DO NOT rename or change capitalization/spacing.
 */
export const STORAGE_BUCKETS = {
  DELIVERY_FILES: 'Delivery files',
} as const

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

  try {
    const supabase = getSupabaseClient()
    let { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .upload(path, file, {
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
          .upload(path, file, { contentType, upsert })
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

    const resPath = data?.path || path
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

  const supabase = getSupabaseClient()
  const { data } = supabase.storage
    .from(STORAGE_BUCKETS.DELIVERY_FILES)
    .getPublicUrl(path)

  return data?.publicUrl || ''
}

/**
 * Creates a temporary signed download URL for private files in the 'Delivery files' bucket.
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

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .createSignedUrl(path, expiresInSeconds)

    if (error) {
      console.error('[Supabase Storage] Error creating signed URL:', error.message)
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

