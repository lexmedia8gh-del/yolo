import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { sendClientOnboardingEmail } from '@/lib/services/brevo'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json()
    const clientId = String(body?.clientId || '').trim()
    const email = String(body?.email || '').trim()
    const clientName = String(body?.name || body?.clientName || 'Valued Client').trim()
    const personalMessage = body?.personalMessage ? String(body.personalMessage).trim() : undefined

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid client email address is required to send the welcome email.' },
        { status: 400 }
      )
    }

    let resolvedClientId = clientId
    let fetchedClientName = clientName

    // Lookup client details from Cloud Firestore if clientId is provided
    if (clientId) {
      try {
        const snap = await getAdminDb().collection(COLLECTIONS.CLIENTS).doc(clientId).get()
        if (snap.exists) {
          const cData = snap.data() || {}
          resolvedClientId = snap.id
          fetchedClientName = cData.name || cData.companyName || clientName
        }
      } catch (err) {
        console.warn('[Welcome Email API] Client lookup warning:', err)
      }
    }

    const emailResult = await sendClientOnboardingEmail({
      toEmail: email,
      clientName: fetchedClientName,
      clientId: resolvedClientId || 'LM-CLIENT',
      personalMessage,
    })

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Failed to send onboarding welcome email via Brevo.' },
        { status: 500 }
      )
    }

    // Log email dispatch in communication history/activity logs
    try {
      const logData = {
        type: 'welcome_email',
        channel: 'email',
        recipientEmail: email,
        recipientName: fetchedClientName,
        clientId: resolvedClientId,
        status: 'sent',
        messageId: emailResult.messageId || null,
        sentAt: new Date().toISOString(),
        sentBy: authResult.email || authResult.uid,
      }
      await getAdminDb().collection('communication_history').add(logData)
    } catch (logErr) {
      console.warn('[Welcome Email API] Communication log warning:', logErr)
    }

    return NextResponse.json({
      ok: true,
      message: `Welcome onboarding email successfully sent to ${email}`,
      messageId: emailResult.messageId,
    })
  } catch (err: any) {
    console.error('[Welcome Email API Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Server error sending onboarding email.' },
      { status: 500 }
    )
  }
}
