import { getSupabaseClient, isSupabaseConfigured } from './client'

/**
 * Storage bucket constants.
 * Note: 'Delivery files' is the existing Supabase storage bucket name.
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
}: UploadFileOptions): Promise<StorageOperationResult<{ path: string; id?: string }>> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error('Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .upload(path, file, {
        contentType,
        upsert,
      })

    if (error) {
      console.error('[Supabase Storage] Upload error:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected upload error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
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
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error('Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .createSignedUrl(path, expiresInSeconds)

    if (error) {
      console.error('[Supabase Storage] Error creating signed URL:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected error creating signed URL:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Deletes one or more files from the 'Delivery files' bucket.
 */
export async function deleteDeliveryFiles(paths: string[]): Promise<StorageOperationResult<any>> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error('Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .remove(paths)

    if (error) {
      console.error('[Supabase Storage] Delete error:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected delete error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Lists files within a path in the 'Delivery files' bucket.
 */
export async function listDeliveryFiles(
  path = '',
  options?: { limit?: number; offset?: number; sortBy?: { column?: string; order?: string } }
): Promise<StorageOperationResult<any[]>> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: null }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.DELIVERY_FILES)
      .list(path, options)

    if (error) {
      console.error('[Supabase Storage] List error:', error.message)
      return { data: null, error }
    }

    return { data: data || [], error: null }
  } catch (err: any) {
    console.error('[Supabase Storage] Unexpected list error:', err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}
