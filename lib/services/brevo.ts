/**
 * Server-Side Brevo Transactional Email Service
 *
 * BREVO_API_KEY is read strictly from process.env on the server side.
 * Never import this file into client components or client-side code.
 */

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
  lexmediaLogoUrl?: string
  clientLogoUrl?: string
}

/**
 * Replaces localhost or dynamic IP origins with official production URL if set
 */
function getProductionUrl(urlStr: string): string {
  const prodBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || ''
  if (!prodBase) return urlStr

  try {
    const urlObj = new URL(urlStr)
    if (
      urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1' ||
      urlObj.hostname.startsWith('192.168.')
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
  const prodBase = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || ''
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
    primaryButtonText: 'View My Delivery',
    primaryButtonUrl: deliveryUrl,
    primaryButtonBg: '#2563eb',
    introText: `Great news! Your final project files for <strong>${escapeHtml(projectName)}</strong> have been unlocked and are ready for download in your secure client delivery portal.`,
    lexmediaLogoUrl,
    clientLogoUrl,
  })

  return sendBrevoEmail({
    toEmail,
    clientName,
    subject: `Your LEXMEDIA.GH Delivery Is Ready — ${projectName}`,
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
    primaryButtonText: hasBalance ? 'Complete Payment & View Files' : 'View My Delivery',
    primaryButtonUrl: paymentUrl,
    primaryButtonBg: hasBalance ? '#16a34a' : '#2563eb',
    introText: hasBalance
      ? `Your final deliverables for <strong>${escapeHtml(projectName)}</strong> have been prepared. Complete your remaining balance to immediately unlock high-resolution file downloads.`
      : `Your final project files for <strong>${escapeHtml(projectName)}</strong> are ready for download in your secure client portal.`,
    lexmediaLogoUrl,
    clientLogoUrl,
  })

  const subject = hasBalance
    ? `Your LEXMEDIA.GH Delivery Is Ready — Balance Due: ${formattedAmount}`
    : `Your LEXMEDIA.GH Delivery Is Ready — ${projectName}`

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
