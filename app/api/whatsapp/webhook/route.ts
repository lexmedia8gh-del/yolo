import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'

// Meta webhook verification
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// Meta webhook status updates
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.statuses) {
            for (const statusObj of change.value.statuses) {
              const metaMessageId = statusObj.id
              const status = statusObj.status // 'sent', 'delivered', 'read', 'failed'
              const errorDetails = statusObj.errors ? statusObj.errors[0].message : ''

              // Update Firestore
              const adminDb = getAdminDb()
              const messagesRef = adminDb.collection(COLLECTIONS.WHATSAPP_MESSAGES)
              const snapshot = await messagesRef.where('metaMessageId', '==', metaMessageId).limit(1).get()

              if (!snapshot.empty) {
                const doc = snapshot.docs[0]
                await doc.ref.update({
                  status,
                  ...(errorDetails ? { errorDetails } : {}),
                  updatedAt: FieldValue.serverTimestamp()
                })

                // Also update client lastMessageStatus
                const data = doc.data()
                if (data.clientId) {
                  await adminDb.collection(COLLECTIONS.CLIENTS).doc(data.clientId).update({
                    lastMessageStatus: status
                  })
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('WhatsApp Webhook Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
