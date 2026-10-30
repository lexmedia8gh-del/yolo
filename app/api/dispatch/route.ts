import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { substitutePlaceholders, DEFAULT_DISPATCH_TEMPLATES } from '@/lib/templates/dispatchTemplates'
import { getEmailSender } from '@/lib/config/email'
import { getAppUrl, getProductionUrl } from '@/lib/utils'

export const dynamic = 'force-dynamic'

async function sendBrevoTransactionalSms({
  toPhone,
  senderName,
  content,
}: {
  toPhone: string
  senderName: string
  content: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.log(`[SMS Dispatch - Preview Mode] Brevo API Key not configured. Simulated SMS to ${toPhone}:`)
    console.log(`  Sender: ${senderName}`)
    console.log(`  Body: ${content}`)
    return {
      success: true,
      messageId: `sms_preview_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }
  }

  try {
    // Format phone number to international format (e.g. Ghana +233)
    let formattedPhone = toPhone.trim().replace(/\s+/g, '')
    if (formattedPhone.startsWith('0') && formattedPhone.length === 10) {
      formattedPhone = `+233${formattedPhone.slice(1)}`
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`
    }

    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: senderName.slice(0, 11).replace(/[^a-zA-Z0-9]/g, ''),
        recipient: formattedPhone,
        content,
        type: 'transactional',
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.warn('[Brevo SMS Error]:', data)
      return {
        success: false,
        error: data.message || data.code || `HTTP ${res.status} sending SMS`,
      }
    }

    return {
      success: true,
      messageId: String(data.messageId || data.reference || `sms_${Date.now()}`),
    }
  } catch (err: any) {
    console.error('[SMS Dispatch Exception]:', err)
    return {
      success: false,
      error: err?.message || 'Network failure sending SMS via Brevo',
    }
  }
}

async function sendBrevoDispatchEmail({
  toEmail,
  toName,
  subject,
  htmlContent,
}: {
  toEmail: string
  toName: string
  subject: string
  htmlContent: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  const { email: senderEmail, name: senderName } = getEmailSender()

  if (!apiKey) {
    console.log(`[Email Dispatch - Preview Mode] Continuing without Brevo API key:`)
    console.log(`  To: "${toName}" <${toEmail}>`)
    console.log(`  Subject: ${subject}`)
    return {
      success: true,
      messageId: `preview_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName }],
        replyTo: { name: senderName, email: senderEmail },
        subject,
        htmlContent,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: data.message || data.code || `HTTP ${res.status} sending email`,
      }
    }

    return { success: true, messageId: data.messageId }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network failure sending email' }
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json()
    const channel = (body?.channel || 'email').toLowerCase() as 'email' | 'sms'
    const recipientEmail = String(body?.recipientEmail || '').trim()
    const recipientPhone = String(body?.recipientPhone || '').trim()
    const recipientName = String(body?.recipientName || 'Valued Client').trim()
    const clientId = String(body?.clientId || '').trim()
    const templateId = String(body?.templateId || '').trim()

    let rawSubject = String(body?.subject || '').trim()
    let rawBody = String(body?.body || '').trim()

    // If templateId specified, resolve default template if body/subject missing
    if (templateId) {
      const foundTemplate = DEFAULT_DISPATCH_TEMPLATES.find((t) => t.id === templateId)
      if (foundTemplate) {
        if (!rawSubject) rawSubject = foundTemplate.subject
        if (!rawBody) rawBody = foundTemplate.body
      }
    }

    if (!rawBody) {
      return NextResponse.json({ error: 'Dispatch message content body is required.' }, { status: 400 })
    }

    // Perform variable placeholder substitution
    const substitutedSubject = substitutePlaceholders(rawSubject || 'LEXMEDIA.GH Dispatch Notification', {
      clientName: recipientName,
      clientId,
      projectName: body?.projectName,
      invoiceNumber: body?.invoiceNumber,
      amount: body?.amount,
      paymentStatus: body?.paymentStatus,
      loginUrl: body?.loginUrl || `${getAppUrl()}/login`,
      serviceName: body?.serviceName,
    })

    const substitutedBody = substitutePlaceholders(rawBody, {
      clientName: recipientName,
      clientId,
      projectName: body?.projectName,
      invoiceNumber: body?.invoiceNumber,
      amount: body?.amount,
      paymentStatus: body?.paymentStatus,
      loginUrl: body?.loginUrl || `${getAppUrl()}/login`,
      serviceName: body?.serviceName,
    })

    const logRef = await getAdminDb().collection('communication_history').add({
      channel,
      recipientEmail,
      recipientPhone,
      recipientName,
      clientId,
      templateId: templateId || 'custom',
      subject: substitutedSubject,
      body: substitutedBody,
      status: 'sending',
      createdAt: new Date().toISOString(),
      sentBy: authResult.email || authResult.uid,
    })

    let dispatchResult: { success: boolean; messageId?: string; error?: string }

    if (channel === 'sms') {
      if (!recipientPhone) {
        await logRef.update({ status: 'failed', error: 'Missing phone number for SMS dispatch.' })
        return NextResponse.json({ error: 'Recipient phone number is required for SMS dispatches.' }, { status: 400 })
      }
      dispatchResult = await sendBrevoTransactionalSms({
        toPhone: recipientPhone,
        senderName: 'LEXMEDIA',
        content: substitutedBody,
      })
    } else {
      if (!recipientEmail || !recipientEmail.includes('@')) {
        await logRef.update({ status: 'failed', error: 'Missing valid email address for Email dispatch.' })
        return NextResponse.json({ error: 'Recipient email address is required for Email dispatches.' }, { status: 400 })
      }

      const formattedHtmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${substitutedSubject}</title></head>
<body style="margin: 0; padding: 24px; background-color: #0b1329; font-family: sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
    <tr>
      <td style="background-color: #0f172a; padding: 24px 28px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700;">LEXMEDIA.GH</h2>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px;">Official Dispatch Notice</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${substitutedBody}</td>
    </tr>
    <tr>
      <td style="background-color: #f8fafc; padding: 18px 28px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b;">
        &copy; LEXMEDIA.GH &bull; Digital Media Production &bull; Ghana
      </td>
    </tr>
  </table>
</body>
</html>`

      dispatchResult = await sendBrevoDispatchEmail({
        toEmail: recipientEmail,
        toName: recipientName,
        subject: substitutedSubject,
        htmlContent: formattedHtmlBody,
      })
    }

    const finalStatus = dispatchResult.success ? 'sent' : 'failed'
    await logRef.update({
      status: finalStatus,
      messageId: dispatchResult.messageId || null,
      error: dispatchResult.error || null,
      completedAt: new Date().toISOString(),
    })

    if (!dispatchResult.success) {
      return NextResponse.json(
        { error: dispatchResult.error || 'Failed to complete dispatch delivery.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      logId: logRef.id,
      status: 'sent',
      messageId: dispatchResult.messageId,
      channel,
      recipient: channel === 'sms' ? recipientPhone : recipientEmail,
    })
  } catch (err: any) {
    console.error('[Multi-Channel Dispatch API Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to process multi-channel dispatch.' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    let query: any = getAdminDb().collection('communication_history')
    if (clientId) {
      query = query.where('clientId', '==', clientId)
    }

    const snap = await query.get()
    const history: any[] = []
    snap.forEach((doc: any) => {
      history.push({ id: doc.id, ...doc.data() })
    })

    history.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    return NextResponse.json({
      ok: true,
      history: history.slice(0, limit),
      templates: DEFAULT_DISPATCH_TEMPLATES,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to retrieve dispatch history.' },
      { status: 500 }
    )
  }
}
