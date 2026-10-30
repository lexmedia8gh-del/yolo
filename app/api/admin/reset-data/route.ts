import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured, getSupabaseClient, TABLES } from '@/lib/supabase'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { clearLocalCollection } from '@/lib/firebase/local-server-store'

export const dynamic = 'force-dynamic'

async function purgeFirestoreCollection(collectionName: string): Promise<number> {
  let count = clearLocalCollection(collectionName)
  try {
    const adminDb = getAdminDb()
    const snap = await adminDb.collection(collectionName).get()
    if (!snap.empty) {
      await Promise.all(
        snap.docs.map(async (docSnap) => {
          try {
            await docSnap.ref.delete()
            count++
          } catch {}
        })
      )
    }
  } catch (err) {
    console.warn(`[DataReset API] Firestore cleanup warning for ${collectionName}:`, err)
  }
  return count
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }

  try {
    const body = await req.json()
    const { selection, confirmationPhrase } = body

    if (confirmationPhrase !== 'RESET DATA' && confirmationPhrase !== 'CONFIRM') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid confirmation phrase. Destructive actions require exact confirmation phrase.',
        },
        { status: 400 }
      )
    }

    if (!selection || typeof selection !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid category selection provided.',
        },
        { status: 400 }
      )
    }

    const deletedCounts: Record<string, number> = {}

    // 1. Purge server Firestore + local-server-store collections
    const collectionsToPurge = new Set<string>()
    if (selection.payments || selection.invoices || selection.clients) {
      collectionsToPurge.add(COLLECTIONS.PAYMENTS)
    }
    if (selection.invoices || selection.clients) {
      collectionsToPurge.add(COLLECTIONS.INVOICES)
      collectionsToPurge.add(COLLECTIONS.INVOICE_ITEMS)
      collectionsToPurge.add(COLLECTIONS.CLIENT_LINKS)
    }
    if (selection.deliveries || selection.projects || selection.clients) {
      collectionsToPurge.add(COLLECTIONS.DELIVERY_FILES)
      collectionsToPurge.add(COLLECTIONS.DELIVERIES)
      collectionsToPurge.add(COLLECTIONS.CLIENT_PREVIEWS)
      collectionsToPurge.add(COLLECTIONS.PREVIEW_LOGS)
    }
    if (selection.reminders) {
      collectionsToPurge.add(COLLECTIONS.REMINDERS)
    }
    if (selection.tasks) {
      collectionsToPurge.add(COLLECTIONS.TASKS)
    }
    if (selection.logs) {
      collectionsToPurge.add(COLLECTIONS.WHATSAPP_MESSAGES)
      collectionsToPurge.add(COLLECTIONS.ACTIVITY_LOGS)
      collectionsToPurge.add(COLLECTIONS.NOTIFICATIONS)
    }
    if (selection.projects || selection.clients) {
      collectionsToPurge.add(COLLECTIONS.PROJECTS)
      collectionsToPurge.add(COLLECTIONS.QUICK_JOBS)
    }
    if (selection.clients) {
      collectionsToPurge.add(COLLECTIONS.CLIENTS)
    }
    if (selection.catalog) {
      collectionsToPurge.add(COLLECTIONS.PACKAGES)
      collectionsToPurge.add(COLLECTIONS.SERVICES)
      collectionsToPurge.add(COLLECTIONS.ADD_ONS)
    }

    for (const colName of Array.from(collectionsToPurge)) {
      deletedCounts[colName] = await purgeFirestoreCollection(colName)
    }

    // 2. Purge Supabase tables if configured
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()

      // Cascade deletion order for relational integrity
      try {
        if (selection.payments || selection.invoices || selection.clients) {
          const { error } = await supabase.from(TABLES.PAYMENTS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          if (!error) deletedCounts.payments = Math.max(deletedCounts.payments || 0, 1)
        }

        if (selection.invoices || selection.clients) {
          const { error } = await supabase.from(TABLES.INVOICES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          if (!error) deletedCounts.invoices = Math.max(deletedCounts.invoices || 0, 1)
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
      } catch (err) {
        console.warn('[DataReset API] Supabase query warning:', err)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Data reset completed successfully in database layer.',
      deletedCounts,
    })
  } catch (error: any) {
    console.error('[API /api/admin/reset-data] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to execute data reset operation on server.',
      },
      { status: 500 }
    )
  }
}
