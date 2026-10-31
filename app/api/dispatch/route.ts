import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import {
  substitutePlaceholders,
  DEFAULT_DISPATCH_TEMPLATES,
} from '@/lib/templates/dispatchTemplates'
import { getEmailSender } from '@/lib/config/email'
import {
  formatWhatsAppPhone,
  generateWhatsAppLink,
  resolveStrictProductionBaseUrl,
  validateOutgoingDispatchUrls,
} from '@/lib/utils'
import {
  getLiveEmailBranding,
  renderDispatchEmailTemplate,
} from '@/lib/services/brevo'
import { resolveRecipientPortalTarget } from '@/lib/portal/resolveClientPortal'
import { sendSms } from '@/lib/services/sms'

export const dynamic = 'force-dynamic'

type DispatchChannel = 'email' | 'sms' | 'whatsapp'

interface ProviderDispatchOutcome {
  success: boolean
  messageId?: string
  provider: string
  deliveryMode: 'live' | 'preview' | 'whatsapp_link'
  waLink?: string
  error?: string
}

function normalizeGhanaOrIntlPhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s()-]+/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+233${cleaned.slice(1)}`
  }
  if (cleaned.startsWith('233') && cleaned.length === 12) {
    return `+${cleaned}`
  }
  if (!cleaned.startsWith('+') && /^\d{8,15}$/.test(cleaned)) {
    return `+${cleaned}`
  }
  return cleaned
}

async function sendDispatchSms({
  toPhone,
  senderName,
  content,
}: {
  toPhone: string
  senderName: string
  content: string
}): Promise<ProviderDispatchOutcome> {
  const formattedPhone = normalizeGhanaOrIntlPhone(toPhone)
  if (!formattedPhone || formattedPhone.replace(/\D/g, '').length < 7) {
    return {
      success: false,
      provider: 'SMS Gateway',
      deliveryMode: 'live',
      error: 'Invalid recipient phone number for SMS dispatch.',
    }
  }

  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim()
  const textbeltApiKey = (process.env.TEXTBELT_API_KEY || '').trim()

  if (brevoApiKey) {
    try {
      const cleanSender =
        senderName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) || 'LEXMEDIA'
      const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'api-key': brevoApiKey,
        },
        body: JSON.stringify({
          sender: cleanSender,
          recipient: formattedPhone,
          content,
          type: 'transactional',
        }),
        signal: AbortSignal.timeout(15000),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          success: false,
          provider: 'Brevo SMS',
          deliveryMode: 'live',
          error: data?.message || data?.code || `Brevo SMS error (HTTP ${res.status})`,
        }
      }

      return {
        success: true,
        provider: 'Brevo SMS',
        deliveryMode: 'live',
        messageId: String(data?.messageId || data?.reference || `brevo_sms_${Date.now()}`),
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'Brevo SMS',
        deliveryMode: 'live',
        error: err?.message || 'Network timeout sending SMS via Brevo.',
      }
    }
  }

  if (textbeltApiKey) {
    const smsRes = await sendSms({
      to: formattedPhone,
      message: content,
    })
    return {
      success: smsRes.success,
      provider: 'Textbelt SMS',
      deliveryMode: 'live',
      messageId: smsRes.messageId,
      error: smsRes.error,
    }
  }

  // Explicit preview mode when no live SMS API key is configured
  return {
    success: true,
    provider: 'SMS Preview Gateway',
    deliveryMode: 'preview',
    messageId: `sms_preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }
}

async function sendDispatchEmail({
  toEmail,
  toName,
  subject,
  htmlContent,
  senderDisplayOverride,
}: {
  toEmail: string
  toName: string
  subject: string
  htmlContent: string
  senderDisplayOverride?: string
}): Promise<ProviderDispatchOutcome> {
  const apiKey = (process.env.BREVO_API_KEY || '').trim()
  const { email: senderEmail, name: configuredSenderName } = getEmailSender()
  const activeSenderName = (senderDisplayOverride || configuredSenderName || 'LEXMEDIA.GH').trim()

  if (!apiKey) {
    return {
      success: true,
      provider: 'Brevo Email (Preview)',
      deliveryMode: 'preview',
      messageId: `email_preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
        sender: { name: activeSenderName, email: senderEmail },
        to: [{ email: toEmail, name: toName }],
        replyTo: { name: activeSenderName, email: senderEmail },
        subject,
        htmlContent,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        success: false,
        provider: 'Brevo Email',
        deliveryMode: 'live',
        error: data?.message || data?.code || `Brevo rejected email (HTTP ${res.status})`,
      }
    }

    return {
      success: true,
      provider: 'Brevo Email',
      deliveryMode: 'live',
      messageId: String(data?.messageId || `brevo_${Date.now()}`),
    }
  } catch (err: any) {
    return {
      success: false,
      provider: 'Brevo Email',
      deliveryMode: 'live',
      error: err?.message || 'Network timeout connecting to Brevo Email API.',
    }
  }
}

async function sendDispatchWhatsApp({
  toPhone,
  content,
}: {
  toPhone: string
  content: string
}): Promise<ProviderDispatchOutcome> {
  const phoneCheck = formatWhatsAppPhone(toPhone)
  if (!phoneCheck.isValid || !phoneCheck.formatted) {
    return {
      success: false,
      provider: 'WhatsApp',
      deliveryMode: 'whatsapp_link',
      error: phoneCheck.error || 'Invalid phone number for WhatsApp dispatch.',
    }
  }

  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim()
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()

  if (accessToken && phoneNumberId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneCheck.formatted,
            type: 'text',
            text: { preview_url: true, body: content },
          }),
          signal: AbortSignal.timeout(15000),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return {
          success: false,
          provider: 'WhatsApp Cloud API',
          deliveryMode: 'live',
          error:
            data?.error?.message || `WhatsApp Cloud API error (HTTP ${res.status})`,
        }
      }
      return {
        success: true,
        provider: 'WhatsApp Cloud API',
        deliveryMode: 'live',
        messageId: String(data?.messages?.[0]?.id || `wa_${Date.now()}`),
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'WhatsApp Cloud API',
        deliveryMode: 'live',
        error: err?.message || 'Network error calling WhatsApp Cloud API.',
      }
    }
  }

  const waLink = generateWhatsAppLink(toPhone, content)
  return {
    success: true,
    provider: 'WhatsApp Direct',
    deliveryMode: 'whatsapp_link',
    messageId: `wa_link_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    waLink,
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json()
    const rawChannel = String(body?.channel || 'email').toLowerCase()
    const channel: DispatchChannel =
      rawChannel === 'sms' || rawChannel === 'whatsapp' ? rawChannel : 'email'
    const templateId = String(body?.templateId || '').trim()

    // 1. Strictly enforce production base URL before processing any outgoing message
    const prodBase = resolveStrictProductionBaseUrl(req)
    if (!prodBase.ok || !prodBase.baseUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            prodBase.error ||
            'Production base URL (APP_URL) is missing or resolves to localhost. Outgoing dispatch aborted.',
        },
        { status: 422 }
      )
    }

    let rawSubject = String(body?.subject || '').trim()
    let rawBody = String(body?.body || '').trim()

    if (templateId) {
      const foundTemplate = DEFAULT_DISPATCH_TEMPLATES.find((t) => t.id === templateId)
      if (foundTemplate) {
        if (!rawSubject) rawSubject = foundTemplate.subject
        if (!rawBody) rawBody = foundTemplate.body
      }
    }

    if (!rawBody) {
      return NextResponse.json(
        { ok: false, error: 'Dispatch message content body is required.' },
        { status: 400 }
      )
    }

    if (channel === 'email' && !rawSubject) {
      rawSubject = 'Client Notification'
    }

    // 2. Normalize recipient targets (single or multi-recipient batch)
    let recipientsList: Array<{
      recipientEmail: string
      recipientPhone: string
      recipientName: string
      clientId: string
      projectId?: string
    }> = []

    if (Array.isArray(body?.recipients) && body.recipients.length > 0) {
      recipientsList = body.recipients.map((r: any) => ({
        recipientEmail: String(r.recipientEmail || r.email || '').trim(),
        recipientPhone: String(r.recipientPhone || r.phone || '').trim(),
        recipientName: String(r.recipientName || r.name || 'Valued Client').trim(),
        clientId: String(r.clientId || r.id || '').trim(),
        projectId: r.projectId ? String(r.projectId).trim() : undefined,
      }))
    } else {
      const singleEmail = String(body?.recipientEmail || '').trim()
      const singlePhone = String(body?.recipientPhone || '').trim()
      const singleName = String(body?.recipientName || 'Valued Client').trim()
      const singleClientId = String(body?.clientId || '').trim()

      if (singleEmail || singlePhone || singleClientId) {
        recipientsList.push({
          recipientEmail: singleEmail,
          recipientPhone: singlePhone,
          recipientName: singleName,
          clientId: singleClientId,
          projectId: body?.projectId ? String(body.projectId).trim() : undefined,
        })
      }
    }

    if (recipientsList.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Select at least one recipient before dispatching a message.',
        },
        { status: 400 }
      )
    }

    const db = getAdminDb()

    // 3. Retrieve live Branding + Business settings fresh from Firestore (no stale cache)
    const brandingOptions = await getLiveEmailBranding(req)

    const requestedProjectId = String(body?.projectId || '').trim()
    const preferGeneralPortal = body?.preferGeneralPortal === true
    const requestedPortalPath = String(body?.portalPath || '').trim()
    const buttonText = String(body?.buttonText || 'View Portal').trim() || 'View Portal'

    const results: Array<{
      recipient: string
      recipientName: string
      clientId: string
      channel: DispatchChannel
      status: 'sent' | 'failed'
      provider?: string
      deliveryMode?: string
      portalUrl?: string
      projectName?: string
      messageId?: string
      waLink?: string
      error?: string
      logId?: string
      timestamp: string
    }> = []

    for (const target of recipientsList) {
      let targetEmail = target.recipientEmail
      let targetPhone = target.recipientPhone
      let targetName = target.recipientName
      const targetClientId = target.clientId

      // Hydrate missing contact details from client record when clientId exists
      if (targetClientId && !targetClientId.startsWith('custom_')) {
        try {
          const clientSnap = await db.collection(COLLECTIONS.CLIENTS).doc(targetClientId).get()
          if (clientSnap.exists) {
            const cData = clientSnap.data() || {}
            if (!targetEmail && cData.email) targetEmail = String(cData.email).trim()
            if (!targetPhone && (cData.phone || cData.whatsappNumber)) {
              targetPhone = String(cData.phone || cData.whatsappNumber).trim()
            }
            if ((!targetName || targetName === 'Valued Client') && cData.fullName) {
              targetName = String(cData.fullName).trim()
            }
          }
        } catch {
          // Continue with supplied recipient fields
        }
      }

      // 4. Resolve authoritative project-specific or general client portal URL
      const portalResolution = await resolveRecipientPortalTarget({
        clientId: targetClientId,
        clientName: targetName,
        clientEmail: targetEmail,
        projectId: target.projectId || requestedProjectId,
        preferGeneralPortal,
        explicitPublicPath: requestedPortalPath,
        requestContext: req,
      })

      if (!portalResolution.ok || !portalResolution.portalUrl) {
        const errText =
          portalResolution.error || 'Failed to resolve valid production portal URL.'
        const failedTs = new Date().toISOString()
        const failedLog = await db.collection('communication_history').add({
          channel,
          recipientEmail: targetEmail,
          recipientPhone: targetPhone,
          recipientName: targetName,
          clientId: targetClientId,
          projectId: target.projectId || requestedProjectId || null,
          templateId: templateId || 'custom',
          subject: rawSubject,
          body: rawBody,
          portalUrl: '',
          status: 'failed',
          error: errText,
          createdAt: failedTs,
          completedAt: failedTs,
          sentBy: authResult.email || authResult.uid,
        })
        results.push({
          recipient: channel === 'email' ? targetEmail || targetName : targetPhone || targetName,
          recipientName: targetName,
          clientId: targetClientId,
          channel,
          status: 'failed',
          error: errText,
          logId: failedLog.id,
          timestamp: failedTs,
        })
        continue
      }

      const resolvedProject = portalResolution.project
      const effectiveProjectName =
        resolvedProject?.name ||
        (preferGeneralPortal ? '' : String(body?.projectName || '').trim())
      const effectiveProjectId =
        resolvedProject?.id || target.projectId || requestedProjectId || ''
      const effectiveServiceName =
        resolvedProject?.serviceName || String(body?.serviceName || '').trim()
      const effectiveProjectStatus = resolvedProject?.status || ''
      const effectiveInvoiceNumber =
        resolvedProject?.invoiceNumber || String(body?.invoiceNumber || '').trim()
      const effectiveInvoiceAmount =
        resolvedProject?.formattedTotal ||
        String(body?.invoiceAmount || body?.amount || '').trim()
      const effectiveAmountPaid =
        resolvedProject?.formattedPaid || String(body?.amountPaid || '').trim()
      const effectiveOutstandingBalance =
        resolvedProject?.formattedBalance ||
        String(body?.outstandingBalance || '').trim()
      const effectivePaymentStatus =
        resolvedProject?.paymentStatus || String(body?.paymentStatus || '').trim()

      const substitutionContext = {
        clientName: targetName,
        clientId: targetClientId || 'CLIENT',
        clientEmail: targetEmail,
        clientPhone: targetPhone,
        projectName: effectiveProjectName || undefined,
        projectId: effectiveProjectId || undefined,
        projectStatus: effectiveProjectStatus || undefined,
        invoiceNumber: effectiveInvoiceNumber || undefined,
        invoiceAmount: effectiveInvoiceAmount || undefined,
        amountPaid: effectiveAmountPaid || undefined,
        outstandingBalance: effectiveOutstandingBalance || undefined,
        paymentStatus: effectivePaymentStatus || undefined,
        serviceName: effectiveServiceName || undefined,
        loginUrl: portalResolution.portalUrl,
        portalUrl: portalResolution.portalUrl,
        supportEmail: brandingOptions.supportEmail,
        supportPhone: brandingOptions.supportPhone,
        companyName: brandingOptions.businessName,
      }

      const substitutedSubject = substitutePlaceholders(
        rawSubject || `${brandingOptions.businessName || 'LEXMEDIA.GH'} Notification`,
        substitutionContext
      )
      const substitutedBody = substitutePlaceholders(rawBody, substitutionContext)

      const formattedHtmlBody =
        channel === 'email'
          ? renderDispatchEmailTemplate({
              recipientName: targetName,
              subject: substitutedSubject,
              bodyText: substitutedBody,
              portalUrl: portalResolution.portalUrl,
              buttonText,
              branding: brandingOptions,
              projectName: effectiveProjectName || undefined,
              projectStatus: effectiveProjectStatus || undefined,
              serviceName: effectiveServiceName || undefined,
              invoiceNumber: effectiveInvoiceNumber || undefined,
              invoiceAmount: effectiveInvoiceAmount || undefined,
              amountPaid: effectiveAmountPaid || undefined,
              outstandingBalance: effectiveOutstandingBalance || undefined,
              baseUrl: prodBase.baseUrl,
            })
          : ''

      // 5. Hard guard: reject any outgoing payload containing localhost / 127.0.0.1 / 0.0.0.0 URLs
      const urlAudit = validateOutgoingDispatchUrls({
        baseUrl: prodBase.baseUrl,
        portalUrl: portalResolution.portalUrl,
        logoUrl: brandingOptions.logoLightUrl || brandingOptions.logoUrl,
        htmlContent: formattedHtmlBody || undefined,
        textContent: substitutedBody,
      })

      const createdAtIso = new Date().toISOString()
      const logRef = await db.collection('communication_history').add({
        channel,
        recipientEmail: targetEmail,
        recipientPhone: targetPhone,
        recipientName: targetName,
        clientId: targetClientId,
        projectId: effectiveProjectId || null,
        projectName: effectiveProjectName || null,
        templateId: templateId || 'custom',
        subject: channel === 'email' ? substitutedSubject : '',
        body: substitutedBody,
        portalUrl: portalResolution.portalUrl,
        portalType: portalResolution.portalType,
        status: 'sending',
        createdAt: createdAtIso,
        sentBy: authResult.email || authResult.uid,
      })

      if (!urlAudit.valid) {
        const completedAtIso = new Date().toISOString()
        await logRef.update({
          status: 'failed',
          error: urlAudit.error || 'Outgoing URL validation failed.',
          completedAt: completedAtIso,
        })
        results.push({
          recipient: channel === 'email' ? targetEmail || targetName : targetPhone || targetName,
          recipientName: targetName,
          clientId: targetClientId,
          channel,
          status: 'failed',
          portalUrl: portalResolution.portalUrl,
          projectName: effectiveProjectName || undefined,
          error: urlAudit.error,
          logId: logRef.id,
          timestamp: completedAtIso,
        })
        continue
      }

      let outcome: ProviderDispatchOutcome = {
        success: false,
        provider: channel.toUpperCase(),
        deliveryMode: 'live',
        error: 'Dispatch did not complete.',
      }

      try {
        if (channel === 'sms') {
          if (!targetPhone) {
            outcome = {
              success: false,
              provider: 'SMS Gateway',
              deliveryMode: 'live',
              error: `Recipient "${targetName}" does not have a phone number configured for SMS.`,
            }
          } else {
            outcome = await sendDispatchSms({
              toPhone: targetPhone,
              senderName: brandingOptions.businessName || 'LEXMEDIA',
              content: substitutedBody,
            })
          }
        } else if (channel === 'whatsapp') {
          if (!targetPhone) {
            outcome = {
              success: false,
              provider: 'WhatsApp',
              deliveryMode: 'whatsapp_link',
              error: `Recipient "${targetName}" does not have a phone number configured for WhatsApp.`,
            }
          } else {
            outcome = await sendDispatchWhatsApp({
              toPhone: targetPhone,
              content: substitutedBody,
            })
          }
        } else {
          if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
            outcome = {
              success: false,
              provider: 'Brevo Email',
              deliveryMode: 'live',
              error: `Recipient "${targetName}" does not have a valid email address.`,
            }
          } else {
            outcome = await sendDispatchEmail({
              toEmail: targetEmail,
              toName: targetName,
              subject: substitutedSubject,
              htmlContent: formattedHtmlBody,
              senderDisplayOverride: brandingOptions.businessName,
            })
          }
        }
      } catch (unexpectedErr: any) {
        outcome = {
          success: false,
          provider: channel.toUpperCase(),
          deliveryMode: 'live',
          error: unexpectedErr?.message || 'Unexpected provider exception during dispatch.',
        }
      } finally {
        const finalStatus = outcome.success ? 'sent' : 'failed'
        const completedAtIso = new Date().toISOString()
        await logRef.update({
          status: finalStatus,
          provider: outcome.provider,
          deliveryMode: outcome.deliveryMode,
          messageId: outcome.messageId || null,
          waLink: outcome.waLink || null,
          error: outcome.error || null,
          completedAt: completedAtIso,
        })

        results.push({
          recipient:
            channel === 'email'
              ? targetEmail || targetName
              : targetPhone || targetName,
          recipientName: targetName,
          clientId: targetClientId,
          channel,
          status: finalStatus,
          provider: outcome.provider,
          deliveryMode: outcome.deliveryMode,
          portalUrl: portalResolution.portalUrl,
          projectName: effectiveProjectName || undefined,
          messageId: outcome.messageId,
          waLink: outcome.waLink,
          error: outcome.error,
          logId: logRef.id,
          timestamp: completedAtIso,
        })
      }
    }

    const sentCount = results.filter((r) => r.status === 'sent').length
    const failedCount = results.filter((r) => r.status === 'failed').length
    const firstError = results.find((r) => r.status === 'failed')?.error

    if (sentCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: firstError || 'Dispatch failed for all selected recipients.',
          channel,
          totalDispatched: results.length,
          sentCount: 0,
          failedCount,
          results,
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Message Sent Successfully',
      channel,
      totalDispatched: results.length,
      sentCount,
      failedCount,
      results,
    })
  } catch (err: any) {
    console.error('[Multi-Channel Dispatch API Error]:', err)
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Failed to process multi-channel dispatch.',
      },
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
    const clientId = (searchParams.get('clientId') || '').trim()
    const channelFilter = (searchParams.get('channel') || '').trim().toLowerCase()
    const statusFilter = (searchParams.get('status') || '').trim().toLowerCase()
    const includeDirectory = searchParams.get('includeDirectory') === 'true'
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const db = getAdminDb()

    let historyQuery: any = db.collection('communication_history')
    if (clientId) {
      historyQuery = historyQuery.where('clientId', '==', clientId)
    }

    const [snap, branding] = await Promise.all([
      historyQuery.get(),
      getLiveEmailBranding(req),
    ])

    const allHistory: any[] = []
    snap.forEach((doc: any) => {
      allHistory.push({ id: doc.id, ...doc.data() })
    })

    allHistory.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )

    const stats = {
      total: allHistory.length,
      sent: allHistory.filter((h) => h.status === 'sent').length,
      failed: allHistory.filter((h) => h.status === 'failed').length,
      pending: allHistory.filter((h) => h.status === 'sending' || h.status === 'pending').length,
      emailSent: allHistory.filter((h) => h.channel === 'email' && h.status === 'sent').length,
      smsSent: allHistory.filter((h) => h.channel === 'sms' && h.status === 'sent').length,
      whatsappSent: allHistory.filter((h) => h.channel === 'whatsapp' && h.status === 'sent').length,
    }

    let filteredHistory = allHistory
    if (channelFilter && channelFilter !== 'all') {
      filteredHistory = filteredHistory.filter((h) => h.channel === channelFilter)
    }
    if (statusFilter && statusFilter !== 'all') {
      filteredHistory = filteredHistory.filter((h) => h.status === statusFilter)
    }

    const productionUrl = resolveStrictProductionBaseUrl(req)
    const { email: senderEmail, name: senderName } = getEmailSender()
    const hasBrevoKey = Boolean((process.env.BREVO_API_KEY || '').trim())
    const hasTextbeltKey = Boolean((process.env.TEXTBELT_API_KEY || '').trim())
    const hasWaCloud = Boolean(
      (process.env.WHATSAPP_ACCESS_TOKEN || '').trim() &&
        (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
    )

    let clients: any[] | undefined
    let projects: any[] | undefined

    if (includeDirectory) {
      const [clientsSnap, projectsSnap] = await Promise.all([
        db.collection(COLLECTIONS.CLIENTS).get(),
        db.collection(COLLECTIONS.PROJECTS).get(),
      ])
      clients = clientsSnap.docs.map((d: any) => {
        const data = d.data() || {}
        return {
          id: d.id,
          name: data.fullName || data.name || 'Unnamed Client',
          email: data.email || '',
          phone: data.phone || data.whatsappNumber || '',
          companyName: data.company || data.companyName || '',
          status: data.status || 'active',
        }
      })
      projects = projectsSnap.docs.map((d: any) => {
        const data = d.data() || {}
        return {
          id: d.id,
          clientId: data.clientId || '',
          clientName: data.clientName || '',
          name: data.name || 'Untitled Project',
          serviceName: data.serviceName || '',
          status: data.status || 'In Progress',
          price: Number(data.price || 0),
          amountPaid: Number(data.amountPaid || 0),
          outstandingBalance:
            data.outstandingBalance !== undefined
              ? Number(data.outstandingBalance)
              : Math.max(0, Number(data.price || 0) - Number(data.amountPaid || 0)),
          currency: data.currency || 'GHS',
          invoiceId: data.invoiceId || '',
          invoiceNumber: data.invoiceNumber || '',
          updatedAt:
            typeof data.updatedAt?.toDate === 'function'
              ? data.updatedAt.toDate().toISOString()
              : typeof data.updatedAt === 'string'
              ? data.updatedAt
              : null,
        }
      })
    }

    return NextResponse.json({
      ok: true,
      history: filteredHistory.slice(0, limit),
      stats,
      templates: DEFAULT_DISPATCH_TEMPLATES,
      productionUrl,
      branding,
      channels: {
        email: {
          available: true,
          configured: hasBrevoKey,
          mode: hasBrevoKey ? 'live' : 'preview',
          provider: 'Brevo Email',
          senderEmail,
          senderName: branding.businessName || senderName,
        },
        sms: {
          available: true,
          configured: hasBrevoKey || hasTextbeltKey,
          mode: hasBrevoKey || hasTextbeltKey ? 'live' : 'preview',
          provider: hasBrevoKey ? 'Brevo SMS' : hasTextbeltKey ? 'Textbelt SMS' : 'SMS Gateway',
        },
        whatsapp: {
          available: true,
          configured: hasWaCloud,
          mode: hasWaCloud ? 'live' : 'direct_link',
          provider: hasWaCloud ? 'WhatsApp Cloud API' : 'WhatsApp Direct',
        },
      },
      ...(includeDirectory ? { clients, projects } : {}),
    })
  } catch (err: any) {
    console.error('[Dispatch History GET Error]:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to retrieve dispatch workspace data.' },
      { status: 500 }
    )
  }
}
