import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let clientInstance: SupabaseClient | null = null

/**
 * Checks if Supabase client-side environment variables are defined.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '')
}

/**
 * Returns the client-side Supabase client singleton with lazy initialization.
 * Gracefully handles missing credentials during build or before configuration.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    if (!isSupabaseConfigured()) {
      console.warn(
        '[Supabase] NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Initializing fallback client.'
      )
      // Fallback placeholder client to prevent runtime crashes when credentials are not yet configured in Settings
      clientInstance = createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseAnonKey || 'placeholder-anon-key',
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        }
      )
    } else {
      clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    }
  }

  return clientInstance
}

/**
 * Pre-instantiated Supabase client for convenient direct imports.
 */
export const supabase = getSupabaseClient()
