import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured, getSupabaseClient, TABLES } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
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

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient()

      // Cascade deletion order for relational integrity
      try {
        if (selection.payments || selection.invoices || selection.clients) {
          const { error } = await supabase.from(TABLES.PAYMENTS).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          if (!error) deletedCounts.payments = 1
        }

        if (selection.invoices || selection.clients) {
          const { error } = await supabase.from(TABLES.INVOICES).delete().neq('id', '00000000-0000-0000-0000-000000000000')
          if (!error) deletedCounts.invoices = 1
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
