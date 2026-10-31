import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { substitutePlaceholders, DEFAULT_DISPATCH_TEMPLATES } from '@/lib/templates/dispatchTemplates'
import { getEmailSender } from '@/lib/config/email'
import { getAppUrl, getProductionUrl } from '@/lib/utils'
import { renderDispatchEmailTemplate, type EmailBrandingOptions } from '@/lib/services/brevo'

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

    // Build normalized list of recipients (supports multi-recipient array or single target)
    let recipientsList: Array<{
      recipientEmail: string
      recipientPhone: string
      recipientName: string
      clientId: string
    }> = []

    if (Array.isArray(body?.recipients) && body.recipients.length > 0) {
      recipientsList = body.recipients.map((r: any) => ({
        recipientEmail: String(r.recipientEmail || r.email || '').trim(),
        recipientPhone: String(r.recipientPhone || r.phone || '').trim(),
        recipientName: String(r.recipientName || r.name || 'Valued Client').trim(),
        clientId: String(r.clientId || r.id || '').trim(),
      }))
    } else {
      const singleEmail = String(body?.recipientEmail || '').trim()
      const singlePhone = String(body?.recipientPhone || '').trim()
      const singleName = String(body?.recipientName || 'Valued Client').trim()
      const singleClientId = String(body?.clientId || '').trim()

      if (singleEmail || singlePhone || singleName) {
        recipientsList.push({
          recipientEmail: singleEmail,
          recipientPhone: singlePhone,
          recipientName: singleName,
          clientId: singleClientId,
        })
      }
    }

    if (recipientsList.length === 0) {
      return NextResponse.json(
        { error: 'At least one recipient (email or phone) is required for dispatch.' },
        { status: 400 }
      )
    }

    // Fetch dynamic branding configuration from Firestore
    let brandingOptions: EmailBrandingOptions = {
      businessName: 'LEXMEDIA.GH',
      primaryColor: '#2563eb',
      secondaryColor: '#1e293b',
      accentColor: '#38bdf8',
    }

    try {
      const brandingSnap = await getAdminDb().collection('settings').doc('branding').get()
      if (brandingSnap.exists) {
        const bData = brandingSnap.data() || {}
        brandingOptions = {
          businessName: bData.businessName || 'LEXMEDIA.GH',
          logoUrl: bData.logoUrl || bData.logoLightUrl || '',
          primaryColor: bData.primaryColor || '#2563eb',
          secondaryColor: bData.secondaryColor || '#1e293b',
          accentColor: bData.accentColor || '#38bdf8',
        }
      }
    } catch (err) {
      console.warn('[Dispatch] Could not fetch settings/branding from Firestore, using default:', err)
    }

    // Resolve base portal URL cleanly without localhost
    const rawLoginUrl = body?.portalUrl || body?.loginUrl || body?.deliveryUrl || body?.paymentUrl || '/login'
    const cleanPortalUrl = getProductionUrl(rawLoginUrl, req)

    const results: Array<{
      recipient: string
      recipientName: string
      status: 'sent' | 'failed'
      messageId?: string
      error?: string
      logId?: string
    }> = []

    // Execute dispatch for each target recipient
    for (const target of recipientsList) {
      const targetEmail = target.recipientEmail
      const targetPhone = target.recipientPhone
      const targetName = target.recipientName
      const targetClientId = target.clientId

      const substitutedSubject = substitutePlaceholders(rawSubject || 'LEXMEDIA.GH Dispatch Notification', {
        clientName: targetName,
        clientId: targetClientId,
        projectName: body?.projectName,
        invoiceNumber: body?.invoiceNumber,
        invoiceAmount: body?.invoiceAmount || body?.amount,
        amountPaid: body?.amountPaid,
        outstandingBalance: body?.outstandingBalance,
        paymentStatus: body?.paymentStatus,
        loginUrl: cleanPortalUrl,
        serviceName: body?.serviceName,
        companyName: brandingOptions.businessName,
      })

      const substitutedBody = substitutePlaceholders(rawBody, {
        clientName: targetName,
        clientId: targetClientId,
        projectName: body?.projectName,
        invoiceNumber: body?.invoiceNumber,
        invoiceAmount: body?.invoiceAmount || body?.amount,
        amountPaid: body?.amountPaid,
        outstandingBalance: body?.outstandingBalance,
        paymentStatus: body?.paymentStatus,
        loginUrl: cleanPortalUrl,
        serviceName: body?.serviceName,
        companyName: brandingOptions.businessName,
      })

      const logRef = await getAdminDb().collection('communication_history').add({
        channel,
        recipientEmail: targetEmail,
        recipientPhone: targetPhone,
        recipientName: targetName,
        clientId: targetClientId,
        templateId: templateId || 'custom',
        subject: substitutedSubject,
        body: substitutedBody,
        portalUrl: cleanPortalUrl,
        status: 'sending',
        createdAt: new Date().toISOString(),
        sentBy: authResult.email || authResult.uid,
      })

      let dispatchResult: { success: boolean; messageId?: string; error?: string }

      if (channel === 'sms') {
        if (!targetPhone) {
          await logRef.update({ status: 'failed', error: 'Missing phone number for SMS dispatch.' })
          results.push({
            recipient: targetPhone || targetName,
            recipientName: targetName,
            status: 'failed',
            error: 'Missing phone number for SMS dispatch',
            logId: logRef.id,
          })
          continue
        }

        dispatchResult = await sendBrevoTransactionalSms({
          toPhone: targetPhone,
          senderName: brandingOptions.businessName || 'LEXMEDIA',
          content: substitutedBody,
        })
      } else {
        if (!targetEmail || !targetEmail.includes('@')) {
          await logRef.update({ status: 'failed', error: 'Missing valid email address for Email dispatch.' })
          results.push({
            recipient: targetEmail || targetName,
            recipientName: targetName,
            status: 'failed',
            error: 'Invalid or missing recipient email',
            logId: logRef.id,
          })
          continue
        }

        const formattedHtmlBody = renderDispatchEmailTemplate({
          recipientName: targetName,
          subject: substitutedSubject,
          bodyText: substitutedBody,
          portalUrl: cleanPortalUrl,
          buttonText: body?.buttonText || 'Access Client Portal',
          branding: brandingOptions,
          projectName: body?.projectName,
          invoiceNumber: body?.invoiceNumber,
          outstandingBalance: body?.outstandingBalance,
        })

        dispatchResult = await sendBrevoDispatchEmail({
          toEmail: targetEmail,
          toName: targetName,
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

      results.push({
        recipient: channel === 'sms' ? targetPhone : targetEmail,
        recipientName: targetName,
        status: finalStatus,
        messageId: dispatchResult.messageId,
        error: dispatchResult.error,
        logId: logRef.id,
      })
    }

    const sentCount = results.filter((r) => r.status === 'sent').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    return NextResponse.json({
      ok: sentCount > 0,
      channel,
      totalDispatched: results.length,
      sentCount,
      failedCount,
      results,
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
