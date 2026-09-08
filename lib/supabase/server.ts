import { createClient, SupabaseClient } from '@supabase/supabase-js'

let serverClientInstance: SupabaseClient | null = null

/**
 * Returns a server-side Supabase client instance.
 * Prefers the service role key if provided for administrative operations,
 * otherwise falls back to the public anon key.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''

  if (!serverClientInstance) {
    if (!supabaseUrl || !serviceKey) {
      console.warn(
        '[Supabase Server] Server environment variables are missing. Using fallback initialization.'
      )
      serverClientInstance = createClient(
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
      serverClientInstance = createClient(supabaseUrl, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    }
  }

  return serverClientInstance
}
