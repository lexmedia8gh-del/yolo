import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'

/**
 * Brevo Transactional Email Webhook Handler
 * Processes event updates from Brevo:
 * - delivered
 * - hard_bounce / soft_bounce / invalid_email
 * - opened / unique_opened
 * - click
 * - spam / blocked / unsubscribed
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // Brevo can send single objects or arrays of events
    const events = Array.isArray(body) ? body : [body]

    if (!events.length || !events[0]?.event) {
      return NextResponse.json({ status: 'ignored', reason: 'No valid events found in payload' }, { status: 200 })
    }

    const db = getAdminDb()
    let updatedCount = 0

    for (const item of events) {
      const eventType = item.event || item.type
      const recipientEmail = item.email
      const messageId = item['message-id'] || item.messageId || item['message_id']
      const timestamp = item.ts_event ? new Date(item.ts_event * 1000).toISOString() : new Date().toISOString()

      if (!recipientEmail && !messageId) continue

      let mappedStatus = 'sent'
      if (['delivered', 'request'].includes(eventType)) {
        mappedStatus = 'delivered'
      } else if (['hard_bounce', 'soft_bounce', 'invalid_email', 'blocked', 'error', 'deferred'].includes(eventType)) {
        mappedStatus = 'bounced'
      } else if (['opened', 'unique_opened'].includes(eventType)) {
        mappedStatus = 'opened'
      } else if (['click', 'link_clicked'].includes(eventType)) {
        mappedStatus = 'clicked'
      } else if (['spam', 'unsubscribed'].includes(eventType)) {
        mappedStatus = 'complained'
      }

      // Query communication_history in Firestore matching messageId or email
      if (db) {
        let snapshot
        if (messageId) {
          snapshot = await db.collection('communication_history')
            .where('messageId', '==', messageId)
            .limit(5)
            .get()
        }

        if ((!snapshot || snapshot.empty) && recipientEmail) {
          snapshot = await db.collection('communication_history')
            .where('recipientEmail', '==', recipientEmail)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get()
        }

        if (snapshot && !snapshot.empty) {
          for (const doc of snapshot.docs) {
            await doc.ref.update({
              status: mappedStatus,
              lastEvent: eventType,
              lastEventAt: timestamp,
              rawBrevoData: item,
            })
            updatedCount++
          }
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      processedEvents: events.length,
      recordsUpdated: updatedCount,
    })
  } catch (err: any) {
    console.error('[Brevo Webhook Error]', err)
    return NextResponse.json({ error: 'Failed to process webhook', message: err?.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'LEXMEDIA Brevo Webhook Dispatcher',
    supportedEvents: ['delivered', 'hard_bounce', 'soft_bounce', 'opened', 'click', 'spam', 'unsubscribed'],
  })
}
