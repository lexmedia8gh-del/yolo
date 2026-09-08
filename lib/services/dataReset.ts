/**
 * Data Management & Reset Service for Ctrl Room.
 * Handles safe, relational cascading deletion of demo, test, or selected data
 * across Firestore, Supabase, and local storage layers while strictly protecting
 * core business settings, branding, and user accounts.
 */

import { COLLECTIONS, getDocuments, deleteDocument } from '@/lib/firebase/firestore'
import { isSupabaseConfigured, getSupabaseClient, TABLES } from '@/lib/supabase'

export interface ResetCategorySelection {
  clients: boolean
  projects: boolean
  invoices: boolean
  payments: boolean
  clientLinks: boolean
  deliveries: boolean
  reminders: boolean
  tasks: boolean
  logs: boolean
  catalog: boolean
}

export interface DataCountsSummary {
  clients: number
  projects: number
  invoices: number
  payments: number
  clientLinks: number
  deliveries: number
  reminders: number
  tasks: number
  logs: number
  catalog: number
  totalRecords: number
}

export interface ResetExecutionResult {
  success: boolean
  deletedCounts: Record<string, number>
  totalDeleted: number
  preservedItems: string[]
  error?: string
}

/**
 * Calculates current record counts across all application categories.
 */
export async function getLiveRecordCounts(): Promise<DataCountsSummary> {
  const summary: DataCountsSummary = {
    clients: 0,
    projects: 0,
    invoices: 0,
    payments: 0,
    clientLinks: 0,
    deliveries: 0,
    reminders: 0,
    tasks: 0,
    logs: 0,
    catalog: 0,
    totalRecords: 0,
  }

  try {
    const [
      clients,
      projects,
      invoices,
      payments,
      links,
      deliveries,
      deliveryFiles,
      reminders,
      tasks,
      activityLogs,
      notifications,
      whatsappLogs,
      services,
      packages,
    ] = await Promise.all([
      getDocuments(COLLECTIONS.CLIENTS).catch(() => []),
      getDocuments(COLLECTIONS.PROJECTS).catch(() => []),
      getDocuments(COLLECTIONS.INVOICES).catch(() => []),
      getDocuments(COLLECTIONS.PAYMENTS).catch(() => []),
      getDocuments(COLLECTIONS.CLIENT_LINKS).catch(() => []),
      getDocuments(COLLECTIONS.DELIVERIES).catch(() => []),
      getDocuments(COLLECTIONS.DELIVERY_FILES).catch(() => []),
      getDocuments(COLLECTIONS.REMINDERS).catch(() => []),
      getDocuments(COLLECTIONS.TASKS).catch(() => []),
      getDocuments(COLLECTIONS.ACTIVITY_LOGS).catch(() => []),
      getDocuments(COLLECTIONS.NOTIFICATIONS).catch(() => []),
      getDocuments(COLLECTIONS.WHATSAPP_MESSAGES).catch(() => []),
      getDocuments(COLLECTIONS.SERVICES).catch(() => []),
      getDocuments(COLLECTIONS.PACKAGES).catch(() => []),
    ])

    summary.clients = clients.length
    summary.projects = projects.length
    summary.invoices = invoices.length
    summary.payments = payments.length
    summary.clientLinks = links.length
    summary.deliveries = deliveries.length + deliveryFiles.length
    summary.reminders = reminders.length
    summary.tasks = tasks.length
    summary.logs = activityLogs.length + notifications.length + whatsappLogs.length
    summary.catalog = services.length + packages.length

    summary.totalRecords =
      summary.clients +
      summary.projects +
      summary.invoices +
      summary.payments +
      summary.clientLinks +
      summary.deliveries +
      summary.reminders +
      summary.tasks +
      summary.logs +
      summary.catalog

    return summary
  } catch (err) {
    console.warn('[DataReset] Error counting records:', err)
    return summary
  }
}

/**
 * Safely executes relational reset across all selected categories.
 *
 * RELATIONAL CASCADE ORDER (Prevents orphan child records and foreign key violations):
 * 1. Child payments & payment links
 * 2. Invoice items & Invoices
 * 3. Delivery files & Deliveries
 * 4. Reminders & Tasks
 * 5. Activity logs, notifications & messages
 * 6. Projects
 * 7. Clients
 * 8. Catalog (if selected)
 *
 * PROTECTED (Never touched):
 * - Business settings & branding
 * - Admin users & authentication
 */
export async function executeDataReset(
  selection: ResetCategorySelection
): Promise<ResetExecutionResult> {
  const deletedCounts: Record<string, number> = {}
  let totalDeleted = 0

  const preservedItems = [
    'Business Information (Name, Address, Currency)',
    'Invoice Branding & Numbering Configuration',
    'Payment Gateway & Public Keys',
    'Custom Brand Colors & Logos',
    'Administrator Profile & Credentials',
  ]

  try {
    // 1. Reset Payments & Links
    if (selection.payments || selection.invoices || selection.clients) {
      const payments = await getDocuments<{ id: string }>(COLLECTIONS.PAYMENTS).catch(() => [])
      for (const p of payments) {
        await deleteDocument(COLLECTIONS.PAYMENTS, p.id).catch(() => {})
      }
      deletedCounts.payments = payments.length
      totalDeleted += payments.length
      clearLocalStorageKey('lexmedia_payments')
    }

    if (selection.clientLinks || selection.invoices || selection.clients) {
      const links = await getDocuments<{ id: string }>(COLLECTIONS.CLIENT_LINKS).catch(() => [])
      for (const l of links) {
        await deleteDocument(COLLECTIONS.CLIENT_LINKS, l.id).catch(() => {})
      }
      deletedCounts.clientLinks = links.length
      totalDeleted += links.length
      clearLocalStorageKey('lexmedia_clientLinks')
    }

    // 2. Reset Invoices & Items
    if (selection.invoices || selection.clients) {
      const invoiceItems = await getDocuments<{ id: string }>(COLLECTIONS.INVOICE_ITEMS).catch(() => [])
      for (const item of invoiceItems) {
        await deleteDocument(COLLECTIONS.INVOICE_ITEMS, item.id).catch(() => {})
      }
      const invoices = await getDocuments<{ id: string }>(COLLECTIONS.INVOICES).catch(() => [])
      for (const inv of invoices) {
        await deleteDocument(COLLECTIONS.INVOICES, inv.id).catch(() => {})
      }
      deletedCounts.invoices = invoices.length
      totalDeleted += invoices.length + invoiceItems.length
      clearLocalStorageKey('lexmedia_invoices')
      clearLocalStorageKey('lexmedia_invoiceItems')
    }

    // 3. Reset Deliveries & Files
    if (selection.deliveries || selection.projects || selection.clients) {
      const deliveryFiles = await getDocuments<{ id: string }>(COLLECTIONS.DELIVERY_FILES).catch(() => [])
      for (const df of deliveryFiles) {
        await deleteDocument(COLLECTIONS.DELIVERY_FILES, df.id).catch(() => {})
      }
      const deliveries = await getDocuments<{ id: string }>(COLLECTIONS.DELIVERIES).catch(() => [])
      for (const d of deliveries) {
        await deleteDocument(COLLECTIONS.DELIVERIES, d.id).catch(() => {})
      }
      const files = await getDocuments<{ id: string }>(COLLECTIONS.FILES).catch(() => [])
      for (const f of files) {
        await deleteDocument(COLLECTIONS.FILES, f.id).catch(() => {})
      }
      deletedCounts.deliveries = deliveries.length + deliveryFiles.length
      totalDeleted += deliveries.length + deliveryFiles.length + files.length
      clearLocalStorageKey('lexmedia_deliveries')
      clearLocalStorageKey('lexmedia_deliveryFiles')
      clearLocalStorageKey('lexmedia_files')
    }

    // 4. Reset Reminders & Tasks
    if (selection.reminders) {
      const reminders = await getDocuments<{ id: string }>(COLLECTIONS.REMINDERS).catch(() => [])
      for (const r of reminders) {
        await deleteDocument(COLLECTIONS.REMINDERS, r.id).catch(() => {})
      }
      deletedCounts.reminders = reminders.length
      totalDeleted += reminders.length
      clearLocalStorageKey('lexmedia_reminders')
    }

    if (selection.tasks) {
      const tasks = await getDocuments<{ id: string }>(COLLECTIONS.TASKS).catch(() => [])
      for (const t of tasks) {
        await deleteDocument(COLLECTIONS.TASKS, t.id).catch(() => {})
      }
      deletedCounts.tasks = tasks.length
      totalDeleted += tasks.length
      clearLocalStorageKey('lexmedia_tasks')
    }

    // 5. Reset Activity Logs & Communications
    if (selection.logs) {
      const activityLogs = await getDocuments<{ id: string }>(COLLECTIONS.ACTIVITY_LOGS).catch(() => [])
      for (const a of activityLogs) {
        await deleteDocument(COLLECTIONS.ACTIVITY_LOGS, a.id).catch(() => {})
      }
      const notifications = await getDocuments<{ id: string }>(COLLECTIONS.NOTIFICATIONS).catch(() => [])
      for (const n of notifications) {
        await deleteDocument(COLLECTIONS.NOTIFICATIONS, n.id).catch(() => {})
      }
      const whatsappLogs = await getDocuments<{ id: string }>(COLLECTIONS.WHATSAPP_MESSAGES).catch(() => [])
      for (const w of whatsappLogs) {
        await deleteDocument(COLLECTIONS.WHATSAPP_MESSAGES, w.id).catch(() => {})
      }
      deletedCounts.logs = activityLogs.length + notifications.length + whatsappLogs.length
      totalDeleted += deletedCounts.logs
      clearLocalStorageKey('lexmedia_activityLogs')
      clearLocalStorageKey('lexmedia_notifications')
      clearLocalStorageKey('lexmedia_whatsappMessages')
    }

    // 6. Reset Projects
    if (selection.projects || selection.clients) {
      const projects = await getDocuments<{ id: string }>(COLLECTIONS.PROJECTS).catch(() => [])
      for (const proj of projects) {
        await deleteDocument(COLLECTIONS.PROJECTS, proj.id).catch(() => {})
      }
      deletedCounts.projects = projects.length
      totalDeleted += projects.length
      clearLocalStorageKey('lexmedia_projects')
    }

    // 7. Reset Clients
    if (selection.clients) {
      const clients = await getDocuments<{ id: string }>(COLLECTIONS.CLIENTS).catch(() => [])
      for (const c of clients) {
        await deleteDocument(COLLECTIONS.CLIENTS, c.id).catch(() => {})
      }
      deletedCounts.clients = clients.length
      totalDeleted += clients.length
      clearLocalStorageKey('lexmedia_clients')
    }

    // 8. Reset Catalog (Only if explicitly requested)
    if (selection.catalog) {
      const services = await getDocuments<{ id: string }>(COLLECTIONS.SERVICES).catch(() => [])
      for (const s of services) {
        await deleteDocument(COLLECTIONS.SERVICES, s.id).catch(() => {})
      }
      const packages = await getDocuments<{ id: string }>(COLLECTIONS.PACKAGES).catch(() => [])
      for (const p of packages) {
        await deleteDocument(COLLECTIONS.PACKAGES, p.id).catch(() => {})
      }
      deletedCounts.catalog = services.length + packages.length
      totalDeleted += deletedCounts.catalog
      clearLocalStorageKey('lexmedia_services')
      clearLocalStorageKey('lexmedia_packages')
    }

    // 9. Cascade to Supabase if active
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient()
        if (selection.payments || selection.invoices || selection.clients) {
          await supabase.from(TABLES.PAYMENTS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.invoices || selection.clients) {
          await supabase.from(TABLES.INVOICES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.deliveries || selection.projects || selection.clients) {
          await supabase.from(TABLES.DELIVERY_FILES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          await supabase.from(TABLES.DELIVERIES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.reminders) {
          await supabase.from(TABLES.REMINDERS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.tasks) {
          await supabase.from(TABLES.TASKS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.logs) {
          await supabase.from(TABLES.WHATSAPP_MESSAGES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          await supabase.from('sms_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.projects || selection.clients) {
          await supabase.from(TABLES.PROJECTS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.clients) {
          await supabase.from(TABLES.CLIENTS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
        if (selection.catalog) {
          await supabase.from(TABLES.PACKAGES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          await supabase.from(TABLES.SERVICES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        }
      } catch (sbErr) {
        console.warn('[DataReset] Supabase table cleanup note:', sbErr)
      }
    }

    return {
      success: true,
      deletedCounts,
      totalDeleted,
      preservedItems,
    }
  } catch (err: any) {
    console.error('[DataReset] Fatal error executing reset:', err)
    return {
      success: false,
      deletedCounts,
      totalDeleted,
      preservedItems,
      error: err?.message || 'An unexpected error occurred during data reset',
    }
  }
}

function clearLocalStorageKey(key: string) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignore
    }
  }
}
