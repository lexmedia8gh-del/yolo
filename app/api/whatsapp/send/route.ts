import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      clientId,
      invoiceId,
      projectId,
      deliveryId,
      messageType = 'payment_link',
      messageBody,
      templateName,
      toNumber,
    } = body

    if (!clientId || !toNumber) {
      return NextResponse.json({ error: 'Missing clientId or toNumber' }, { status: 400 })
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!token || !phoneId) {
      return NextResponse.json(
        { error: 'WhatsApp API credentials not configured on the server.' },
        { status: 500 }
      )
    }
    
    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toNumber.replace(/\D/g, ''), // Strip non-digits
      type: 'text',
      text: {
        preview_url: true,
        body: messageBody || 'You have a new message from LexMedia.',
      },
    }

    if (templateName) {
      payload = {
        messaging_product: 'whatsapp',
        to: toNumber.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
        }
      }
    }

    const res = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    // Log to Firestore
    const adminDb = getAdminDb()
    const messageDocRef = adminDb.collection(COLLECTIONS.WHATSAPP_MESSAGES).doc()

    let metaMessageId = ''
    let status = 'failed'
    let errorDetails = ''

    if (res.ok && data.messages && data.messages.length > 0) {
      metaMessageId = data.messages[0].id
      status = 'sent'
    } else {
      errorDetails = data.error?.message || 'Unknown Meta API error'
    }

    const messageRecord = {
      id: messageDocRef.id,
      clientId,
      projectId: projectId || null,
      invoiceId: invoiceId || null,
      deliveryId: deliveryId || null,
      messageType,
      toNumber,
      templateName: templateName || null,
      status,
      metaMessageId,
      errorDetails,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await messageDocRef.set(messageRecord)

    // Update Client's latest message info
    await adminDb.collection(COLLECTIONS.CLIENTS).doc(clientId).update({
      lastMessageSentAt: FieldValue.serverTimestamp(),
      lastMessageStatus: status,
    })
    
    // Log Activity
    const desc =
      status === 'sent'
        ? messageType === 'delivery_ready'
          ? 'Sent WhatsApp project delivery link'
          : 'Sent WhatsApp payment link'
        : `Failed to send WhatsApp message: ${errorDetails}`

    await adminDb.collection(COLLECTIONS.ACTIVITY_LOGS).add({
      event: status === 'sent' ? 'whatsapp_message_sent' : 'whatsapp_message_failed',
      description: desc,
      clientId,
      entityId: deliveryId || invoiceId || projectId || null,
      entityType: deliveryId ? 'delivery' : invoiceId ? 'invoice' : 'project',
      createdAt: FieldValue.serverTimestamp(),
    })

    if (!res.ok) {
      return NextResponse.json({ error: errorDetails }, { status: 500 })
    }

    return NextResponse.json({ success: true, messageId: messageDocRef.id, metaMessageId })
  } catch (error: any) {
    console.error('WhatsApp API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
