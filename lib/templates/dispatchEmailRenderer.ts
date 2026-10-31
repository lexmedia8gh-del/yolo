import { isLocalhostUrl, isVercelPlatformDomain, resolveStrictProductionBaseUrl } from '@/lib/utils/app-url'

export interface EmailBrandingOptions {
  businessName?: string
  shortName?: string
  tagline?: string
  logoUrl?: string
  logoLightUrl?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  buttonColor?: string
  buttonTextColor?: string
  supportEmail?: string
  supportPhone?: string
  businessAddress?: string
  website?: string
}

export interface DispatchEmailTemplateProps {
  recipientName: string
  subject: string
  bodyText: string
  portalUrl?: string
  buttonText?: string
  branding?: EmailBrandingOptions
  projectName?: string
  projectStatus?: string
  serviceName?: string
  invoiceNumber?: string
  invoiceAmount?: string
  amountPaid?: string
  outstandingBalance?: string
  baseUrl?: string
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function normalizeHex(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1]
    const g = trimmed[2]
    const b = trimmed[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return fallback
}

function getRelativeLuminance(hex: string): number {
  const clean = normalizeHex(hex, '#0F172A').slice(1)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * Resolves a branding asset URL (e.g. logoUrl / logoLightUrl) to an absolute,
 * publicly reachable HTTPS URL suitable for email clients (Gmail, Apple Mail, Outlook).
 * Never emits relative paths or localhost/127.0.0.1 URLs.
 */
export function resolvePublicBrandAssetUrl(
  rawUrl?: string | null,
  explicitBaseUrl?: string | null
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  let publicBase = (explicitBaseUrl || '').trim().replace(/\/+$/, '')
  if (!publicBase || isLocalhostUrl(publicBase) || isVercelPlatformDomain(publicBase)) {
    const strict = resolveStrictProductionBaseUrl()
    publicBase = strict.ok ? strict.baseUrl.replace(/\/+$/, '') : ''
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (isVercelPlatformDomain(trimmed)) return ''
    if (isLocalhostUrl(trimmed)) {
      if (!publicBase) return ''
      try {
        const parsed = new URL(trimmed)
        return `${publicBase}${parsed.pathname}${parsed.search}`
      } catch {
        return ''
      }
    }
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    if (!publicBase) return ''
    return `${publicBase}${trimmed}`
  }

  return ''
}

function linkifyEscapedParagraph(escapedText: string, linkColor: string): string {
  return escapedText.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline; word-break: break-all;">${url}</a>`
  )
}

/**
 * Isomorphic (client preview + server Brevo sender) HTML email renderer.
 * Produces email-client-safe table layout with inline CSS and live Branding Settings.
 */
export function renderDispatchEmailTemplate({
  recipientName,
  subject,
  bodyText,
  portalUrl,
  buttonText = 'View Portal',
  branding,
  projectName,
  projectStatus,
  serviceName,
  invoiceNumber,
  invoiceAmount,
  amountPaid,
  outstandingBalance,
  baseUrl,
}: DispatchEmailTemplateProps): string {
  const businessName = (branding?.businessName || 'LEXMEDIA.GH').trim() || 'LEXMEDIA.GH'
  const tagline = (branding?.tagline || 'Client Notification & Project Portal').trim()

  const headerBg = normalizeHex(branding?.primaryColor, '#0F172A')
  const accentColor = normalizeHex(
    branding?.accentColor || branding?.secondaryColor || branding?.buttonColor,
    '#1D63ED'
  )
  const ctaBg = normalizeHex(
    branding?.buttonColor || branding?.accentColor || branding?.secondaryColor || branding?.primaryColor,
    '#1D63ED'
  )
  const ctaLum = getRelativeLuminance(ctaBg)
  const ctaText = branding?.buttonTextColor
    ? normalizeHex(branding.buttonTextColor, ctaLum > 0.55 ? '#0F172A' : '#FFFFFF')
    : ctaLum > 0.55
    ? '#0F172A'
    : '#FFFFFF'

  const headerIsDark = getRelativeLuminance(headerBg) < 0.35
  const headerTitleColor = headerIsDark ? '#FFFFFF' : '#0F172A'
  const headerSubtitleColor = headerIsDark ? '#CBD5E1' : '#475569'
  const headerBorderBottom = headerIsDark ? 'none' : '1px solid #E2E8F0'

  // Prefer light logo on dark brand header, main logo on light brand header, falling back cleanly
  const primaryCandidateLogo = headerIsDark
    ? branding?.logoLightUrl || branding?.logoUrl
    : branding?.logoUrl || branding?.logoLightUrl
  const absLogoUrl = resolvePublicBrandAssetUrl(primaryCandidateLogo, baseUrl)

  const cleanPortalUrl = (portalUrl || '').trim()
  const hasValidPortalUrl =
    Boolean(cleanPortalUrl) &&
    (cleanPortalUrl.startsWith('https://') || cleanPortalUrl.startsWith('http://')) &&
    !isLocalhostUrl(cleanPortalUrl) &&
    !isVercelPlatformDomain(cleanPortalUrl)

  const normalizedParagraphs = (bodyText || '')
    .trim()
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, '<br />')
      const linked = linkifyEscapedParagraph(escaped, ctaBg)
      return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #1E293B;">${linked}</p>`
    })
    .join('')

  // Brand Header: proportional <img> when logo exists; clean typographic header when no logo is configured
  const headerBrandMarkup = absLogoUrl
    ? `<img src="${escapeHtml(absLogoUrl)}" alt="${escapeHtml(businessName)}" style="display: block; margin: 0 auto 12px auto; max-height: 52px; max-width: 210px; width: auto; height: auto; border: 0; outline: none; text-decoration: none;" />
       <p style="margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.2px; color: ${headerTitleColor};">${escapeHtml(businessName)}</p>
       ${tagline ? `<p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: ${headerSubtitleColor};">${escapeHtml(tagline)}</p>` : ''}`
    : `<p style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.4px; color: ${headerTitleColor};">${escapeHtml(businessName)}</p>
       ${tagline ? `<p style="margin: 6px 0 0 0; font-size: 11px; font-weight: 600; letter-spacing: 1.3px; text-transform: uppercase; color: ${headerSubtitleColor};">${escapeHtml(tagline)}</p>` : ''}`

  // Structured Project / Billing Summary Card (only rendered when real project or billing fields exist)
  const detailRows: Array<{ label: string; value: string; emphasize?: boolean }> = []
  if (projectName && projectName.trim() && projectName !== 'Client Project') {
    detailRows.push({ label: 'Project', value: projectName.trim() })
  }
  if (serviceName && serviceName.trim() && serviceName !== 'Digital Production') {
    detailRows.push({ label: 'Service', value: serviceName.trim() })
  }
  if (projectStatus && projectStatus.trim()) {
    detailRows.push({ label: 'Status', value: projectStatus.trim() })
  }
  if (invoiceNumber && invoiceNumber.trim() && invoiceNumber !== 'N/A') {
    detailRows.push({ label: 'Invoice #', value: invoiceNumber.trim() })
  }
  if (invoiceAmount && invoiceAmount.trim() && invoiceAmount !== 'GH₵0.00') {
    detailRows.push({ label: 'Total Amount', value: invoiceAmount.trim() })
  }
  if (amountPaid && amountPaid.trim() && amountPaid !== 'GH₵0.00') {
    detailRows.push({ label: 'Amount Paid', value: amountPaid.trim() })
  }
  if (outstandingBalance && outstandingBalance.trim() && outstandingBalance !== 'GH₵0.00') {
    detailRows.push({ label: 'Balance Due', value: outstandingBalance.trim(), emphasize: true })
  }

  const metaDetailsBlock =
    detailRows.length > 0
      ? `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; margin: 20px 0 24px 0;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748B;">Summary Details</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 13px;">
                ${detailRows
                  .map(
                    (row, idx) => `
                  <tr>
                    <td style="color: ${row.emphasize ? '#B91C1C' : '#64748B'}; font-weight: 600; padding: ${idx === 0 ? '2px' : '6px'} 8px ${idx === detailRows.length - 1 ? '2px' : '6px'} 0; border-bottom: ${idx === detailRows.length - 1 ? 'none' : '1px solid #E2E8F0'};">${escapeHtml(row.label)}</td>
                    <td align="right" style="color: ${row.emphasize ? '#991B1B' : '#0F172A'}; font-weight: ${row.emphasize ? '800' : '700'}; padding: ${idx === 0 ? '2px' : '6px'} 0 ${idx === detailRows.length - 1 ? '2px' : '6px'} 8px; border-bottom: ${idx === detailRows.length - 1 ? 'none' : '1px solid #E2E8F0'}; font-variant-numeric: tabular-nums;">${escapeHtml(row.value)}</td>
                  </tr>`
                  )
                  .join('')}
              </table>
            </td>
          </tr>
        </table>`
      : ''

  const ctaButtonBlock = hasValidPortalUrl
    ? `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 26px 0 18px 0;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="${ctaBg}" style="border-radius: 8px; background-color: ${ctaBg};">
                  <a href="${escapeHtml(cleanPortalUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: ${ctaText}; text-decoration: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    ${escapeHtml(buttonText || 'View Portal')} &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin: 12px 0 4px 0; font-size: 12px; line-height: 1.5; color: #64748B; text-align: center;">
        Or open directly in your browser:<br />
        <a href="${escapeHtml(cleanPortalUrl)}" target="_blank" rel="noopener noreferrer" style="color: ${ctaBg}; text-decoration: underline; word-break: break-all;">${escapeHtml(cleanPortalUrl)}</a>
      </p>`
    : ''

  const contactParts: string[] = []
  if (branding?.supportEmail?.trim()) {
    const email = branding.supportEmail.trim()
    contactParts.push(
      `<a href="mailto:${escapeHtml(email)}" style="color: #475569; text-decoration: none;">${escapeHtml(email)}</a>`
    )
  }
  if (branding?.supportPhone?.trim()) {
    contactParts.push(`<span>${escapeHtml(branding.supportPhone.trim())}</span>`)
  }
  if (branding?.website?.trim()) {
    const rawSite = branding.website.trim()
    const siteHref = rawSite.startsWith('http') ? rawSite : `https://${rawSite}`
    if (!isLocalhostUrl(siteHref)) {
      contactParts.push(
        `<a href="${escapeHtml(siteHref)}" target="_blank" rel="noopener noreferrer" style="color: #475569; text-decoration: none;">${escapeHtml(rawSite.replace(/^https?:\/\//, ''))}</a>`
      )
    }
  }

  const addressLine = branding?.businessAddress?.trim()
    ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #94A3B8;">${escapeHtml(branding.businessAddress.trim())}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(subject || businessName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; -webkit-font-smoothing: antialiased;">
  <span style="display: none; font-size: 1px; color: #F1F5F9; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    ${escapeHtml(recipientName ? `Notification for ${recipientName} from ${businessName}` : subject)}
  </span>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
          <!-- Top Brand Accent Bar -->
          <tr>
            <td bgcolor="${accentColor}" style="height: 4px; background-color: ${accentColor}; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Brand Header -->
          <tr>
            <td bgcolor="${headerBg}" style="background-color: ${headerBg}; border-bottom: ${headerBorderBottom}; padding: 28px 28px 24px 28px; text-align: center;">
              ${headerBrandMarkup}
            </td>
          </tr>
          <!-- Message Body -->
          <tr>
            <td style="padding: 32px 28px 28px 28px;">
              ${normalizedParagraphs}
              ${metaDetailsBlock}
              ${ctaButtonBlock}
            </td>
          </tr>
          <!-- Branded Footer -->
          <tr>
            <td bgcolor="#F8FAFC" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center;">
              <p style="margin: 0; font-size: 12px; font-weight: 700; color: #334155;">&copy; ${new Date().getFullYear()} ${escapeHtml(businessName)}</p>
              ${
                contactParts.length > 0
                  ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #64748B;">${contactParts.join(' &nbsp;&middot;&nbsp; ')}</p>`
                  : ''
              }
              ${addressLine}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
