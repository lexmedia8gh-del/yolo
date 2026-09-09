/**
 * Server-Side Brevo Transactional Email Service
 *
 * BREVO_API_KEY is read strictly from process.env on the server side.
 * Never import this file into client components or client-side code.
 */

import { getAppUrl } from '@/lib/utils'

interface SendDeliveryEmailParams {
  toEmail: string
  clientName: string
  projectName: string
  deliveryUrl: string
  lexmediaLogoUrl?: string
  clientLogoUrl?: string
}

interface SendPaymentReminderEmailParams {
  toEmail: string
  clientName: string
  projectName: string
  amountDue: number
  currencySymbol?: string
  paymentUrl: string
  deliveryUrl?: string
  lexmediaLogoUrl?: string
  clientLogoUrl?: string
}

export interface SendInvoiceEmailParams {
  toEmail: string
  clientName: string
  invoiceNumber: string
  dueDate?: string
  totalAmount: number
  balanceDue: number
  currency?: string
  currencySymbol?: string
  paymentUrl: string
  personalMessage?: string
  items?: Array<{ description: string; quantity: number; total: number }>
  businessName?: string
  businessLogoUrl?: string
}

/**
 * Replaces localhost or dynamic IP origins with official production URL if set
 */
function getProductionUrl(urlStr: string): string {
  const prodBase = getAppUrl()
  if (!prodBase) return urlStr

  try {
    const urlObj = new URL(urlStr)
    if (
      urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1' ||
      urlObj.hostname.startsWith('192.168.') ||
      urlObj.hostname.includes('vercel.app')
    ) {
      const normalizedBase = prodBase.startsWith('http') ? prodBase : `https://${prodBase}`
      const baseObj = new URL(normalizedBase)
      urlObj.protocol = baseObj.protocol
      urlObj.host = baseObj.host
      return urlObj.toString()
    }
  } catch {}
  return urlStr
}

/**
 * Makes a logo URL absolute — replaces relative /api/... paths with the production base.
 * Email clients (Brevo) can only fetch publicly accessible absolute URLs.
 */
function makeAbsoluteLogoUrl(logoUrl: string | undefined): string {
  if (!logoUrl) return ''
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return getProductionUrl(logoUrl)
  }
  // Relative URL — prepend production base
  const prodBase = getAppUrl()
  if (!prodBase) return '' // Can't make absolute without a base; hide image
  const normalizedBase = prodBase.startsWith('http') ? prodBase : `https://${prodBase}`
  return `${normalizedBase.replace(/\/$/, '')}${logoUrl}`
}

function renderEmailTemplate({
  clientName,
  projectName,
  statusText,
  statusBadgeBg,
  statusBadgeColor,
  amountDue,
  currencySymbol = 'GH₵',
  primaryButtonText,
  primaryButtonUrl,
  primaryButtonBg = '#2563eb',
  secondaryButtonText,
  secondaryButtonUrl,
  introText,
  lexmediaLogoUrl,
  clientLogoUrl,
}: {
  clientName: string
  projectName: string
  statusText: string
  statusBadgeBg: string
  statusBadgeColor: string
  amountDue?: number
  currencySymbol?: string
  primaryButtonText: string
  primaryButtonUrl: string
  primaryButtonBg?: string
  secondaryButtonText?: string
  secondaryButtonUrl?: string
  introText: string
  lexmediaLogoUrl?: string
  clientLogoUrl?: string
}) {
  const cleanPrimaryUrl = getProductionUrl(primaryButtonUrl)
  const cleanSecondaryUrl = secondaryButtonUrl ? getProductionUrl(secondaryButtonUrl) : ''
  const hasBalance = amountDue !== undefined && amountDue > 0
  const formattedAmount = hasBalance
    ? `${currencySymbol}${amountDue!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : ''

  // Resolve logo URLs to absolute before embedding in email
  const absLexmediaLogo = makeAbsoluteLogoUrl(lexmediaLogoUrl)
  const absClientLogo = makeAbsoluteLogoUrl(clientLogoUrl)

  // Header: use image logo if available, else fall back to text badge
  const headerLogoBlock = absLexmediaLogo
    ? `<img src="${escapeHtml(absLexmediaLogo)}" alt="LEXMEDIA.GH" width="120" style="display: block; margin: 0 auto 14px auto; max-height: 56px; object-fit: contain;" />`
    : `<table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 14px auto;">
        <tr>
          <td align="center" style="background-color: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); width: 56px; height: 56px; border-radius: 14px;">
            <span style="font-size: 24px; font-weight: 800; color: #38bdf8; font-family: monospace;">LM</span>
          </td>
        </tr>
      </table>`

  // Client logo block — shown only when a valid absolute URL is available
  const clientLogoBlock = absClientLogo
    ? `<!-- Client Brand Logo -->
      <tr>
        <td style="padding: 20px 32px 4px 32px; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Project by</p>
          <img src="${escapeHtml(absClientLogo)}" alt="${escapeHtml(clientName)}" style="max-height: 64px; max-width: 180px; object-fit: contain; display: inline-block;" />
        </td>
      </tr>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LEXMEDIA.GH Delivery Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1329; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1329; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);">

          <!-- Header Banner (Dark Premium Navy) -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 36px 32px 32px 32px; text-align: center;">

              <!-- LEXMEDIA.GH Brand Logo -->
              ${headerLogoBlock}

              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">LEXMEDIA.GH</h1>
              <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Client Portal &amp; Media Delivery</p>
            </td>
          </tr>

          ${clientLogoBlock}

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 36px 32px 24px 32px;">

              <!-- Greeting & Project Header -->
              <h2 style="margin: 0 0 8px 0; font-size: 19px; font-weight: 700; color: #0f172a;">Hello ${escapeHtml(clientName)},</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                ${introText}
              </p>

              <!-- Project & Delivery Status Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 0 0 24px 0; padding: 18px 20px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Project Name</td>
                        <td align="right">
                          <span style="display: inline-block; background-color: ${statusBadgeBg}; color: ${statusBadgeColor}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${escapeHtml(statusText)}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="font-size: 16px; font-weight: 700; color: #0f172a; padding-top: 6px;">
                          ${escapeHtml(projectName)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Conditional Outstanding Balance Banner -->
              ${
                hasBalance
                  ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%); border: 1px solid #fecdd3; border-radius: 12px; margin: 0 0 24px 0; padding: 20px; text-align: center;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; font-weight: 600; color: #be123c; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding Balance</p>
                    <p style="margin: 6px 0 2px 0; font-size: 30px; font-weight: 800; color: #9f1239; letter-spacing: -0.5px;">${escapeHtml(formattedAmount)}</p>
                    <p style="margin: 0; font-size: 12px; color: #881337;">Complete payment below to instantly unlock download access.</p>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }

              <!-- Primary CTA Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 12px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(cleanPrimaryUrl)}" target="_blank" style="display: inline-block; width: 85%; max-width: 320px; background-color: ${primaryButtonBg}; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 10px; text-align: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                      ${escapeHtml(primaryButtonText)}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Optional Secondary CTA Button -->
              ${
                secondaryButtonText && cleanSecondaryUrl
                  ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(cleanSecondaryUrl)}" target="_blank" style="display: inline-block; font-size: 13px; font-weight: 600; color: #475569; text-decoration: underline;">
                      ${escapeHtml(secondaryButtonText)}
                    </a>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }

              <!-- 3-Step "What Happens Next" Section -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 16px;">
                <tr>
                  <td style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 14px;">
                    What Happens Next
                  </td>
                </tr>
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="28" valign="top" style="font-size: 13px; font-weight: 800; color: #2563eb;">1.</td>
                        <td style="font-size: 13px; color: #475569; padding-bottom: 10px; line-height: 1.4;">
                          ${hasBalance ? 'Click the <strong>Complete Payment</strong> button above to review your invoice.' : 'Click <strong>View My Delivery</strong> to access your secure portal.'}
                        </td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="font-size: 13px; font-weight: 800; color: #2563eb;">2.</td>
                        <td style="font-size: 13px; color: #475569; padding-bottom: 10px; line-height: 1.4;">
                          ${hasBalance ? 'Complete payment securely via Paystack or Mobile Money.' : 'Preview and stream your high-resolution media deliverables.'}
                        </td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="font-size: 13px; font-weight: 800; color: #2563eb;">3.</td>
                        <td style="font-size: 13px; color: #475569; line-height: 1.4;">
                          Download your final files immediately to your phone or computer.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Copy Text -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
                <tr>
                  <td style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5;">
                    Direct portal link:<br>
                    <a href="${escapeHtml(cleanPrimaryUrl)}" style="color: #2563eb; text-decoration: none; word-break: break-all;">${escapeHtml(cleanPrimaryUrl)}</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer & Support Section -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #0f172a;">Need Assistance?</p>
              <p style="margin: 0 0 16px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                If you have questions about your deliverables or payment, reach out to us directly at <a href="mailto:lexmedia8gh@gmail.com" style="color: #2563eb; text-decoration: none; font-weight: 500;">lexmedia8gh@gmail.com</a>.
              </p>
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">&copy; LEXMEDIA.GH &mdash; Digital Production</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

export async function sendDeliveryReadyEmail({
  toEmail,
  clientName,
  projectName,
  deliveryUrl,
  lexmediaLogoUrl,
  clientLogoUrl,
}: SendDeliveryEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY

  if (!apiKey) {
    console.error('[Brevo Service] BREVO_API_KEY environment variable is not configured.')
    return { success: false, error: 'BREVO_API_KEY environment variable is missing' }
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'lexmedia8gh@gmail.com'
  const senderName = process.env.BREVO_SENDER_NAME || 'LEXMEDIA.GH'

  const htmlContent = renderEmailTemplate({
    clientName,
    projectName,
    statusText: 'Files Ready for Download',
    statusBadgeBg: '#dcfce7',
    statusBadgeColor: '#15803d',
    primaryButtonText: 'View Your Deliverables',
    primaryButtonUrl: deliveryUrl,
    primaryButtonBg: '#2563eb',
    introText: `Your project deliverables for <strong>${escapeHtml(projectName)}</strong> are now ready.<br><br>You can access your completed files using the button below.`,
    lexmediaLogoUrl,
    clientLogoUrl,
  })

  return sendBrevoEmail({
    toEmail,
    clientName,
    subject: `Your Deliverables — LEXMEDIA.GH`,
    htmlContent,
    apiKey,
    senderEmail,
    senderName,
  })
}

export async function sendDeliveryPaymentRequiredEmail({
  toEmail,
  clientName,
  projectName,
  amountDue,
  currencySymbol = 'GH₵',
  paymentUrl,
  deliveryUrl,
  lexmediaLogoUrl,
  clientLogoUrl,
}: SendPaymentReminderEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY

  if (!apiKey) {
    console.error('[Brevo Service] BREVO_API_KEY environment variable is not configured.')
    return { success: false, error: 'BREVO_API_KEY environment variable is missing' }
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'lexmedia8gh@gmail.com'
  const senderName = process.env.BREVO_SENDER_NAME || 'LEXMEDIA.GH'

  const hasBalance = amountDue > 0
  const formattedAmount = `${currencySymbol}${amountDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const htmlContent = renderEmailTemplate({
    clientName,
    projectName,
    statusText: hasBalance ? 'Payment Required' : 'Files Ready',
    statusBadgeBg: hasBalance ? '#ffe4e6' : '#dcfce7',
    statusBadgeColor: hasBalance ? '#be123c' : '#15803d',
    amountDue: hasBalance ? amountDue : undefined,
    currencySymbol,
    primaryButtonText: hasBalance ? 'Complete Payment & View Deliverables' : 'View Your Deliverables',
    primaryButtonUrl: paymentUrl,
    primaryButtonBg: hasBalance ? '#16a34a' : '#2563eb',
    secondaryButtonText: (hasBalance && deliveryUrl) ? 'View Deliverables Portal (Locked)' : undefined,
    secondaryButtonUrl: (hasBalance && deliveryUrl) ? deliveryUrl : undefined,
    introText: hasBalance
      ? `Your deliverables for <strong>${escapeHtml(projectName)}</strong> have been prepared. Complete your remaining balance to immediately unlock high-resolution file downloads.`
      : `Your project deliverables for <strong>${escapeHtml(projectName)}</strong> are now ready. You can access your completed files using the button below.`,
    lexmediaLogoUrl,
    clientLogoUrl,
  })

  const subject = hasBalance
    ? `Your Deliverables — Balance Due: ${formattedAmount}`
    : `Your Deliverables — LEXMEDIA.GH`

  return sendBrevoEmail({
    toEmail,
    clientName,
    subject,
    htmlContent,
    apiKey,
    senderEmail,
    senderName,
  })
}

export async function sendInvoiceEmail({
  toEmail,
  clientName,
  invoiceNumber,
  dueDate,
  totalAmount,
  balanceDue,
  currencySymbol = 'GH₵',
  paymentUrl,
  personalMessage,
  items = [],
  businessName = 'LexMedia',
  businessLogoUrl,
}: SendInvoiceEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY

  if (!apiKey) {
    console.error('[Brevo Service] BREVO_API_KEY environment variable is not configured.')
    return { success: false, error: 'BREVO_API_KEY environment variable is missing' }
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'lexmedia8gh@gmail.com'
  const senderName = 'LEXMEDIA.GH' // Mandatory sender display name: LEXMEDIA.GH

  const cleanPaymentUrl = getProductionUrl(paymentUrl)
  const formattedTotal = `${currencySymbol}${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formattedBalance = `${currencySymbol}${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const absLogo = makeAbsoluteLogoUrl(businessLogoUrl)

  const itemsHtml = items.length > 0
    ? `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px;">
        <tr style="background-color: #f8fafc; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 11px;">
          <th align="left" style="padding: 10px 14px;">Item</th>
          <th align="center" style="padding: 10px 14px;">Qty</th>
          <th align="right" style="padding: 10px 14px;">Amount</th>
        </tr>
        ${items.slice(0, 8).map((it, idx) => `
          <tr style="border-top: 1px solid #f1f5f9; background-color: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
            <td style="padding: 10px 14px; color: #1e293b;">${escapeHtml(it.description)}</td>
            <td align="center" style="padding: 10px 14px; color: #64748b;">${it.quantity || 1}</td>
            <td align="right" style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${currencySymbol}${(it.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `).join('')}
        ${items.length > 8 ? `
          <tr>
            <td colspan="3" align="center" style="padding: 8px; color: #94a3b8; font-size: 11px; background-color: #f8fafc;">+ ${items.length - 8} more item(s) on full invoice</td>
          </tr>
        ` : ''}
      </table>
    `
    : ''

  const headerLogo = absLogo
    ? `<img src="${escapeHtml(absLogo)}" alt="${escapeHtml(businessName)}" width="120" style="display: block; margin: 0 auto 12px auto; max-height: 52px; object-fit: contain;" />`
    : `<table align="center" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 12px auto;">
        <tr>
          <td align="center" style="background-color: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25); width: 50px; height: 50px; border-radius: 12px;">
            <span style="font-size: 22px; font-weight: 800; color: #38bdf8; font-family: monospace;">LM</span>
          </td>
        </tr>
      </table>`

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoiceNumber)} from ${escapeHtml(businessName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1329; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b1329; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; text-align: center;">
              ${headerLogo}
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">${escapeHtml(senderName)}</h1>
              <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px;">Client Billing &amp; Invoice Portal</p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <h2 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: #0f172a;">Hello ${escapeHtml(clientName)},</h2>
              <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Here is your invoice <strong>${escapeHtml(invoiceNumber)}</strong>${dueDate ? ` due by <strong>${escapeHtml(dueDate)}</strong>` : ''}.
              </p>

              ${personalMessage ? `
                <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 0 0 20px 0; border-radius: 4px;">
                  <p style="margin: 0; font-size: 13px; font-style: italic; color: #334155;">&ldquo;${escapeHtml(personalMessage)}&rdquo;</p>
                </div>
              ` : ''}

              <!-- Invoice Summary Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 0 0 20px 0; padding: 16px 20px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase;">Invoice Number</td>
                        <td align="right" style="font-family: monospace; font-weight: 700; color: #0f172a; font-size: 14px;">${escapeHtml(invoiceNumber)}</td>
                      </tr>
                      ${dueDate ? `
                      <tr>
                        <td align="left" style="font-size: 12px; color: #64748b; padding-top: 8px;">Due Date</td>
                        <td align="right" style="font-size: 13px; color: #0f172a; padding-top: 8px;">${escapeHtml(dueDate)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td align="left" style="font-size: 12px; color: #64748b; padding-top: 8px;">Total Invoice Amount</td>
                        <td align="right" style="font-size: 14px; font-weight: 600; color: #0f172a; padding-top: 8px;">${escapeHtml(formattedTotal)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${itemsHtml}

              <!-- Balance Due Banner -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 12px; margin: 0 0 24px 0; padding: 18px; text-align: center;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">Balance Due</p>
                    <p style="margin: 6px 0 2px 0; font-size: 28px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px;">${escapeHtml(formattedBalance)}</p>
                    <p style="margin: 0; font-size: 12px; color: #3b82f6;">Pay securely online with Mobile Money, Card, or Bank</p>
                  </td>
                </tr>
              </table>

              <!-- Primary Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(cleanPaymentUrl)}" target="_blank" style="display: inline-block; width: 85%; max-width: 320px; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 10px; text-align: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                      View &amp; Pay Invoice
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; margin-top: 16px;">
                Direct portal link:<br>
                <a href="${escapeHtml(cleanPaymentUrl)}" style="color: #2563eb; text-decoration: none; word-break: break-all;">${escapeHtml(cleanPaymentUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">
                Thank you for choosing ${escapeHtml(businessName)}. If you have any questions, reach out directly at <a href="mailto:${escapeHtml(senderEmail)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(senderEmail)}</a>.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">&copy; ${escapeHtml(senderName)} &mdash; Professional Media &amp; Digital Services</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const subject = balanceDue > 0
    ? `Invoice ${invoiceNumber} from ${senderName} — Balance Due: ${formattedBalance}`
    : `Invoice ${invoiceNumber} from ${senderName}`

  return sendBrevoEmail({
    toEmail,
    clientName,
    subject,
    htmlContent,
    apiKey,
    senderEmail,
    senderName,
  })
}

async function sendBrevoEmail({
  toEmail,
  clientName,
  subject,
  htmlContent,
  apiKey,
  senderEmail,
  senderName,
}: {
  toEmail: string
  clientName: string
  subject: string
  htmlContent: string
  apiKey: string
  senderEmail: string
  senderName: string
}) {
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
        to: [{ email: toEmail, name: clientName }],
        subject,
        htmlContent,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[Brevo API Error]', data)
      return {
        success: false,
        error: data.message || data.code || `Brevo returned HTTP ${res.status}`,
      }
    }

    return {
      success: true,
      messageId: data.messageId,
    }
  } catch (error: any) {
    console.error('[Brevo Service Exception]', error)
    return {
      success: false,
      error: error?.message || 'Network error sending email via Brevo',
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
