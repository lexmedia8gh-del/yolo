import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let clientInstance: SupabaseClient | null = null

/**
 * Checks if Supabase client-side environment variables are defined.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.trim() !== '' &&
    supabaseAnonKey.trim() !== '' &&
    !supabaseUrl.includes('placeholder')
  )
}

/**
 * Returns detailed diagnostic information about the Supabase connection configuration.
 */
export function getSupabaseConfigStatus(): { configured: boolean; urlConfigured: boolean; keyConfigured: boolean; error?: string } {
  const urlConfigured = Boolean(supabaseUrl && supabaseUrl.trim() !== '' && !supabaseUrl.includes('placeholder'))
  const keyConfigured = Boolean(supabaseAnonKey && supabaseAnonKey.trim() !== '' && !supabaseAnonKey.includes('placeholder'))
  
  if (!urlConfigured || !keyConfigured) {
    const missing: string[] = []
    if (!urlConfigured) missing.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!keyConfigured) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return {
      configured: false,
      urlConfigured,
      keyConfigured,
      error: `Missing required Supabase environment variable(s): ${missing.join(', ')}. Please add them in Settings.`,
    }
  }

  return {
    configured: true,
    urlConfigured: true,
    keyConfigured: true,
  }
}

/**
 * Returns the client-side Supabase client singleton with lazy initialization.
 * Gracefully handles missing credentials during build or before configuration.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    if (!isSupabaseConfigured()) {
      console.warn(
        '[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing. Initializing fallback client.'
      )
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

