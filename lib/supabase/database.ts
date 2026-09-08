import { getSupabaseClient, isSupabaseConfigured } from './client'

/**
 * Standard table name identifiers in Supabase database.
 */
export const TABLES = {
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  SERVICES: 'services',
  PACKAGES: 'packages',
  SETTINGS: 'settings',
  REMINDERS: 'reminders',
  TASKS: 'tasks',
  DELIVERIES: 'deliveries',
  DELIVERY_FILES: 'delivery_files',
  WHATSAPP_MESSAGES: 'whatsapp_messages',
} as const

export interface DbResult<T> {
  data: T | null
  error: Error | null
}

/**
 * Verifies connectivity to the Supabase backend.
 * Returns connection status and latency/error without throwing exceptions.
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean
  configured: boolean
  message: string
}> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      configured: false,
      message: 'Supabase credentials are not configured in environment variables.',
    }
  }

  try {
    const supabase = getSupabaseClient()
    // Perform a lightweight query to test connectivity
    const { error } = await supabase.from(TABLES.SETTINGS).select('id').limit(1)

    if (error && error.code !== 'PGRST116') {
      // Table might not exist yet or permission denied, but connection to Supabase endpoint succeeded
      return {
        connected: true,
        configured: true,
        message: `Connected to Supabase endpoint. Note: ${error.message}`,
      }
    }

    return {
      connected: true,
      configured: true,
      message: 'Successfully connected to Supabase database.',
    }
  } catch (err: any) {
    return {
      connected: false,
      configured: true,
      message: `Failed to connect to Supabase: ${err?.message || String(err)}`,
    }
  }
}

/**
 * Reusable helper to query a table.
 */
export async function fetchRows<T>(
  tableName: string,
  options?: {
    match?: Record<string, any>
    order?: { column: string; ascending?: boolean }
    limit?: number
  }
): Promise<DbResult<T[]>> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: null }
  }

  try {
    const supabase = getSupabaseClient()
    let query = supabase.from(tableName).select('*')

    if (options?.match) {
      query = query.match(options.match)
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      })
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      console.warn(`[Supabase DB] Error fetching from ${tableName}:`, error.message)
      return { data: null, error }
    }

    return { data: (data as T[]) || [], error: null }
  } catch (err: any) {
    console.error(`[Supabase DB] Unexpected error in fetchRows from ${tableName}:`, err)
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Helper to fetch a single row by ID.
 */
export async function fetchRowById<T>(
  tableName: string,
  id: string
): Promise<DbResult<T>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return { data: null, error }
    }

    return { data: data as T, error: null }
  } catch (err: any) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Helper to insert a row.
 */
export async function insertRow<T>(
  tableName: string,
  payload: Record<string, any>
): Promise<DbResult<T>> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error('Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select()
      .single()

    if (error) {
      return { data: null, error }
    }

    return { data: data as T, error: null }
  } catch (err: any) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Helper to update a row by ID.
 */
export async function updateRow<T>(
  tableName: string,
  id: string,
  payload: Record<string, any>
): Promise<DbResult<T>> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error('Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from(tableName)
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return { data: null, error }
    }

    return { data: data as T, error: null }
  } catch (err: any) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Helper to delete a row by ID.
 */
export async function deleteRow(
  tableName: string,
  id: string
): Promise<DbResult<boolean>> {
  if (!isSupabaseConfigured()) {
    return {
      data: false,
      error: new Error('Supabase is not configured.'),
    }
  }

  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from(tableName).delete().eq('id', id)

    if (error) {
      return { data: false, error }
    }

    return { data: true, error: null }
  } catch (err: any) {
    return { data: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
}
