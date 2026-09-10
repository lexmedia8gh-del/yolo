import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function cleanSupabaseUrl(raw?: string): string {
  if (!raw) return ''
  const str = String(raw).trim()
  // Match full URL pattern or specifically extract from variable assignment
  const match = str.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(https?:\/\/[^\s\r\n"']+)/i) ||
                str.match(/(https:\/\/[a-z0-9\-_]+\.supabase\.co)/i) ||
                str.match(/(https?:\/\/[^\s\r\n"']+)/i)
  if (match) {
    return match[1].replace(/['"]/g, '').trim()
  }
  return str.split(/[\r\n]+/)[0].replace(/['"]/g, '').trim()
}

export function cleanSupabaseKey(raw?: string): string {
  if (!raw) return ''
  const str = String(raw).trim()
  // Match publishable or anon key token
  const keyMatch = str.match(/(?:NEXT_PUBLIC_SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)\s*=\s*)?((?:sb_publishable_|eyJ)[A-Za-z0-9_\-\.]+)/i) ||
                   str.match(/((?:sb_publishable_|eyJ)[A-Za-z0-9_\-\.]+)/i)
  if (keyMatch) {
    return keyMatch[1].replace(/['"]/g, '').trim()
  }
  // Fallback: take first non-empty line without variable name or URL
  const lines = str.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL')) continue
    const val = line.replace(/^NEXT_PUBLIC_SUPABASE_[A-Z_]+\s*=\s*/i, '').replace(/['"]/g, '').trim()
    if (val && !val.startsWith('http')) return val
  }
  return str.replace(/['"]/g, '').trim()
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

const supabaseUrl = cleanSupabaseUrl(rawUrl)
const supabaseAnonKey = cleanSupabaseKey(rawKey)

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

