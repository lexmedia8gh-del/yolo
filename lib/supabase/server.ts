import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { cleanSupabaseUrl, cleanSupabaseKey } from './client'

let cachedServerClient: SupabaseClient | null = null
let cachedUrl = ''
let cachedKey = ''

/**
 * Returns a server-side Supabase client instance.
 * Prefers the service role key if provided for administrative operations,
 * otherwise falls back to the public anon key.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const rawServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''

  const supabaseUrl = cleanSupabaseUrl(rawUrl)
  const serviceKey = cleanSupabaseKey(rawServiceKey)

  if (!cachedServerClient || cachedUrl !== supabaseUrl || cachedKey !== serviceKey) {
    cachedUrl = supabaseUrl
    cachedKey = serviceKey

    if (!supabaseUrl || !serviceKey) {
      cachedServerClient = createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        serviceKey || 'placeholder-service-key',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      )
    } else {
      cachedServerClient = createClient(supabaseUrl, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    }
  }

  return cachedServerClient
}
