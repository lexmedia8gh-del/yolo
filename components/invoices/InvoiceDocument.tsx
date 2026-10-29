'use client'

import React, { useId, useState } from 'react'
import { formatCurrency, formatDate, resolveDateValue } from '@/lib/utils'
import {
  normalizeHexColor,
  sanitizeBrandingLogoUrl,
  useInvoiceBranding,
} from '@/lib/hooks/useInvoiceBranding'
import type { Invoice, InvoiceItem } from '@/lib/types'
import { ExternalLink } from 'lucide-react'

interface InvoiceDocumentProps {
  invoice: Partial<Invoice>
  elementId?: string
  compact?: boolean
  showPaymentButton?: boolean
  paymentUrl?: string
}

type DisplayStatus =
  | 'Paid'
  | 'Partially Paid'
  | 'Pending'
  | 'Overdue'
  | 'Draft'
  | 'Cancelled'
  | 'Refunded'

function resolveDisplayStatus(
  rawStatus: string | undefined,
  balanceDue: number,
  amountPaid: number,
  total: number,
  dueDate: Invoice['dueDate']
): DisplayStatus {
  if (rawStatus === 'Refunded') return 'Refunded'
  if (rawStatus === 'Cancelled') return 'Cancelled'
  if (rawStatus === 'Paid' || (total > 0 && balanceDue <= 0 && amountPaid >= total)) {
    return 'Paid'
  }
  if (rawStatus === 'Draft') return 'Draft'
  if (rawStatus === 'Partially Paid' || (amountPaid > 0 && balanceDue > 0)) {
    return 'Partially Paid'
  }
  if (rawStatus === 'Overdue') return 'Overdue'

  const dueObj = resolveDateValue(dueDate)
  if (dueObj && balanceDue > 0) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    if (dueObj.getTime() < todayStart.getTime()) {
      return 'Overdue'
    }
  }

  return 'Pending'
}

function getStatusTextClasses(status: DisplayStatus): string {
  switch (status) {
    case 'Paid':
      return 'text-emerald-700'
    case 'Partially Paid':
      return 'text-amber-700'
    case 'Overdue':
      return 'text-rose-700'
    case 'Refunded':
      return 'text-purple-700'
    case 'Cancelled':
      return 'text-slate-500'
    case 'Draft':
      return 'text-slate-600'
    case 'Pending':
    default:
      return 'text-[var(--inv-brand-blue)]'
  }
}

function getReadableForeground(hexColor: string): string {
  const clean = normalizeHexColor(hexColor, '#355FE5').slice(1)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return lum > 0.48 ? '#141518' : '#FFFFFF'
}

type ParsedPaymentLine =
  | { kind: 'account_number'; text: string }
  | { kind: 'account_holder'; text: string }
  | { kind: 'key_value'; label: string; value: string }
  | { kind: 'text'; text: string }

function parsePaymentDetailsLines(raw?: string): ParsedPaymentLine[] {
  if (!raw || !raw.trim()) return []
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  return lines.map((line) => {
    const digitCount = (line.match(/\d/g) || []).length
    if (/^[\d\s+()-]{6,28}$/.test(line) && digitCount >= 6) {
      return { kind: 'account_number', text: line }
    }

    if (
      line.length >= 4 &&
      line.length <= 38 &&
      !line.includes(':') &&
      /^[A-Z0-9][A-Z0-9\s.&'-]+$/.test(line) &&
      /[A-Z]{2,}/.test(line)
    ) {
      return { kind: 'account_holder', text: line }
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 28 && colonIdx < line.length - 1) {
      return {
        kind: 'key_value',
        label: line.slice(0, colonIdx).trim(),
        value: line.slice(colonIdx + 1).trim(),
      }
    }

    return { kind: 'text', text: line }
  })
}

function formatQuantityDisplay(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return '00'
  if (Number.isInteger(qty) && qty < 10) {
    return String(qty).padStart(2, '0')
  }
  return String(qty)
}

function isLocalhostUrl(url?: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.includes('localhost') || lower.includes('127.0.0.1')
}

export function InvoiceDocument({
  invoice,
  elementId = 'invoice-document-render',
  compact = false,
  showPaymentButton = false,
  paymentUrl,
}: InvoiceDocumentProps) {
  const rawUid = useId()
  const sheetKey = rawUid.replace(/[^a-zA-Z0-9_-]/g, '')
  const { branding, businessDefaults, resolvedLogoUrl } = useInvoiceBranding()
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null)

  const currency = invoice.currency || businessDefaults.currency || 'GHS'
  const symbol =
    invoice.currencySymbol ||
    (currency === 'USD'
      ? '$'
      : currency === 'EUR'
      ? '€'
      : currency === 'GBP'
      ? '£'
      : businessDefaults.currencySymbol || 'GH₵')

  const rawInvoiceLogo = sanitizeBrandingLogoUrl(
    invoice.businessInfo?.logo,
    invoice.businessInfo?.logoStoragePath
  )
  const activeLogoUrl = rawInvoiceLogo || resolvedLogoUrl
  const showLogoImage = Boolean(activeLogoUrl && failedLogoSrc !== activeLogoUrl)

  const businessName =
    invoice.businessInfo?.name?.trim() || businessDefaults.name || 'lexmedia.gh'
  const businessTagline =
    invoice.businessInfo?.tagline?.trim() || businessDefaults.tagline || ''
  const businessAddress =
    invoice.businessInfo?.address !== undefined
      ? invoice.businessInfo.address.trim()
      : (businessDefaults.address || '').trim()
  const businessEmail =
    invoice.businessInfo?.email !== undefined
      ? invoice.businessInfo.email.trim()
      : (businessDefaults.email || '').trim()
  const businessPhone =
    invoice.businessInfo?.phone !== undefined
      ? invoice.businessInfo.phone.trim()
      : (businessDefaults.phone || businessDefaults.whatsapp || '').trim()
  const rawWebsite =
    invoice.businessInfo?.website !== undefined
      ? invoice.businessInfo.website.trim()
      : (businessDefaults.website || '').trim()
  const businessWebsite = isLocalhostUrl(rawWebsite) ? '' : rawWebsite
  const businessSocial = (invoice.businessInfo?.social || '').trim()

  const clientName =
    invoice.clientInfo?.name || invoice.clientName || 'Valued Client'
  const clientCompany =
    invoice.clientInfo?.company ?? invoice.clientCompany ?? ''
  const clientEmail =
    invoice.clientInfo?.email ?? invoice.clientEmail ?? ''
  const clientPhone =
    invoice.clientInfo?.phone ?? invoice.clientPhone ?? ''
  const clientAddress =
    invoice.clientInfo?.address ?? invoice.clientAddress ?? ''

  const items: InvoiceItem[] =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : [
          {
            id: '1',
            title: 'Creative Media Production',
            description: 'Professional production & post-production services',
            quantity: 1,
            unitPrice: Number(invoice.total) || 0,
            total: Number(invoice.total) || 0,
          },
        ]

  const computedItemsSum = items.reduce((acc, it) => {
    const lineTotal =
      it.total !== undefined
        ? Number(it.total) || 0
        : (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
    return acc + lineTotal
  }, 0)

  const subtotal =
    invoice.subtotal !== undefined && invoice.subtotal !== null
      ? Number(invoice.subtotal) || 0
      : computedItemsSum
  const discountAmount = Number(invoice.discountAmount) || 0
  const taxAmount = Number(invoice.taxAmount) || 0
  const shippingAmount = Number(invoice.shippingAmount) || 0
  const total =
    invoice.total !== undefined && invoice.total !== null
      ? Number(invoice.total) || 0
      : Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount)
  const amountPaid = Number(invoice.amountPaid) || 0
  const balanceDue =
    invoice.balanceDue !== undefined && invoice.balanceDue !== null
      ? Math.max(0, Number(invoice.balanceDue) || 0)
      : Math.max(0, total - amountPaid)

  const displayStatus = resolveDisplayStatus(
    invoice.status,
    balanceDue,
    amountPaid,
    total,
    invoice.dueDate
  )

  const rawPaymentInstructions =
    invoice.paymentInstructions !== undefined
      ? invoice.paymentInstructions
      : businessDefaults.defaultPaymentInstructions
  const paymentLines = parsePaymentDetailsLines(rawPaymentInstructions)

  const rawTerms =
    (invoice.terms !== undefined ? invoice.terms : businessDefaults.defaultTermsAndConditions) ||
    ''
  const termsParagraphs = rawTerms
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)

  const notes = (invoice.notes || '').trim()
  const thankYouMessage = (
    invoice.thankYouMessage !== undefined
      ? invoice.thankYouMessage
      : businessDefaults.defaultThankYouMessage || ''
  ).trim()

  // Adapt to saved Branding Settings colors when customized; default to the reference's crisp royal blue & charcoal
  const defaultBlueAccents = new Set(['#4f46e5', '#6366f1', ''])
  const rawAccentLower = (branding.accentColor || '').trim().toLowerCase()
  const rawSecondaryLower = (branding.secondaryColor || '').trim().toLowerCase()
  const brandBlue = !defaultBlueAccents.has(rawAccentLower)
    ? normalizeHexColor(branding.accentColor, '#355FE5')
    : !defaultBlueAccents.has(rawSecondaryLower)
    ? normalizeHexColor(branding.secondaryColor, '#355FE5')
    : '#355FE5'

  const defaultDarkPrimaries = new Set(['#0f172a', '#0a0a0a', '#111827', ''])
  const rawPrimaryLower = (branding.primaryColor || '').trim().toLowerCase()
  const darkSurface = !defaultDarkPrimaries.has(rawPrimaryLower)
    ? normalizeHexColor(branding.primaryColor, '#1E1F1D')
    : '#1E1F1D'

  const brandBlueFg = getReadableForeground(brandBlue)
  const darkSurfaceFg = getReadableForeground(darkSurface)
  const highlightYellow = '#FFD60A'
  const highlightYellowFg = '#141518'

  const scopedThemeCss = `
    [data-invoice-sheet="${sheetKey}"] {
      --inv-brand-blue: ${brandBlue};
      --inv-brand-blue-fg: ${brandBlueFg};
      --inv-dark: ${darkSurface};
      --inv-dark-fg: ${darkSurfaceFg};
      --inv-highlight: ${highlightYellow};
      --inv-highlight-fg: ${highlightYellowFg};
    }
  `

  const formattedPaid = formatCurrency(amountPaid, currency, symbol)
  const formattedTotal = formatCurrency(total, currency, symbol)
  const formattedBalance = formatCurrency(balanceDue, currency, symbol)
  const shouldStackSummary =
    compact ||
    formattedPaid.length + formattedTotal.length + formattedBalance.length > 38

  const paidWingLabel =
    displayStatus === 'Refunded'
      ? 'Refunded'
      : displayStatus === 'Paid' && balanceDue <= 0
      ? 'Amount Paid'
      : 'Deposit Paid'

  const discountPctDisplay =
    invoice.discountType === 'percentage' && invoice.discountValue
      ? Number(invoice.discountValue)
      : subtotal > 0 && discountAmount > 0
      ? Number(((discountAmount / subtotal) * 100).toFixed(1))
      : 0

  return (
    <article
      id={elementId}
      data-invoice-sheet={sheetKey}
      className={`invoice-paper-sheet bg-white text-[#1E1F1D] mx-auto flex flex-col overflow-hidden ${
        compact
          ? 'w-full max-w-full text-xs rounded-[28px]'
          : 'w-[794px] max-w-[794px] min-h-[1040px] text-[13px] rounded-[44px] shadow-[0_24px_60px_rgba(0,0,0,0.45)]'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: scopedThemeCss }} />

      <div
        className={`flex-1 flex flex-col ${
          compact ? 'p-5' : 'px-12 pt-11 pb-10'
        }`}
      >
        {/* ─── 1. TOP TWO-COLUMN GRAPHIC HEADER & TERMS PANEL ─── */}
        <header
          className={
            compact
              ? 'flex flex-col gap-6 pb-6'
              : 'grid grid-cols-12 gap-7 items-start pb-7'
          }
        >
          {/* Upper-Left: Logo + Payment Details + Bold Invoice Title */}
          <div className={compact ? 'space-y-5' : 'col-span-6 space-y-6 min-w-0 pt-1'}>
            {/* Brand Logo */}
            {showLogoImage ? (
              <div className="min-h-[52px] flex items-center">
                <img
                  src={activeLogoUrl}
                  alt={`${businessName} logo`}
                  referrerPolicy="no-referrer"
                  onError={() => setFailedLogoSrc(activeLogoUrl)}
                  className="max-h-16 w-auto max-w-[230px] object-contain object-left"
                />
              </div>
            ) : (
              <div className="py-1">
                <p className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1E1F1D] leading-tight break-words">
                  {businessName}
                </p>
                {businessTagline && (
                  <p className="text-[11.5px] font-medium text-[#525459] mt-0.5 break-words">
                    {businessTagline}
                  </p>
                )}
              </div>
            )}

            {/* Business Payment Details (from saved settings / invoice) */}
            {paymentLines.length > 0 && (
              <div className="space-y-1">
                <p className="text-[13.5px] font-bold text-[#1E1F1D] tracking-[-0.01em] mb-1">
                  Payment Details
                </p>
                <div className="space-y-1">
                  {paymentLines.map((line, idx) => {
                    if (line.kind === 'account_number') {
                      return (
                        <p
                          key={idx}
                          className="text-[15.5px] font-extrabold text-[var(--inv-brand-blue)] tracking-tight tabular-nums leading-snug break-words"
                        >
                          {line.text}
                        </p>
                      )
                    }
                    if (line.kind === 'account_holder') {
                      return (
                        <div key={idx} className="pt-0.5">
                          <span className="invoice-dark-badge inline-block bg-[var(--inv-dark)] text-[var(--inv-dark-fg)] text-[11px] font-extrabold tracking-[0.04em] px-2.5 py-1 leading-tight break-words">
                            {line.text}
                          </span>
                        </div>
                      )
                    }
                    if (line.kind === 'key_value') {
                      return (
                        <p key={idx} className="text-[12px] leading-snug break-words">
                          <span className="font-bold text-[#1E1F1D]">{line.label}:</span>{' '}
                          <span className="font-medium text-[#2C2E33]">{line.value}</span>
                        </p>
                      )
                    }
                    return (
                      <p
                        key={idx}
                        className="text-[12.5px] font-medium text-[#1E1F1D] leading-snug break-words"
                      >
                        {line.text}
                      </p>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Large Bold Invoice Title & Identifier */}
            <div className="pt-1">
              {showLogoImage && (
                <p className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-[#1E1F1D] break-words">
                  {businessName}
                </p>
              )}
              <h1
                className={`${
                  compact ? 'text-[34px]' : 'text-[42px]'
                } font-extrabold tracking-[-0.035em] text-[#1E1F1D] leading-[1.02]`}
              >
                Invoice
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
                <span className="invoice-mono font-bold text-[#1E1F1D]">
                  {invoice.invoiceNumber || 'LM-INV-0001'}
                </span>
                <span aria-hidden="true" className="text-[#9CA3AF]">
                  •
                </span>
                <span
                  className={`font-extrabold uppercase tracking-[0.07em] text-[11px] ${getStatusTextClasses(
                    displayStatus
                  )}`}
                >
                  {displayStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Upper-Right: Rounded Blue Terms & Conditions Panel */}
          <div className={compact ? 'w-full' : 'col-span-6 min-w-0'}>
            <div className="invoice-terms-panel rounded-[34px] bg-[var(--inv-brand-blue)] text-[var(--inv-brand-blue-fg)] px-7 py-7">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.05em] mb-3">
                Terms and Conditions
              </p>

              {termsParagraphs.length > 0 ? (
                <div className="space-y-2.5 text-[12.5px] leading-[1.5] font-normal opacity-95 break-words">
                  {termsParagraphs.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
                </div>
              ) : invoice.paymentTerms ? (
                <p className="text-[12.5px] leading-[1.5] font-normal opacity-95 break-words">
                  Payment terms: {invoice.paymentTerms}
                </p>
              ) : (
                <p className="text-[12.5px] leading-[1.5] font-normal opacity-90">
                  Please refer to agreed service terms for settlement and delivery schedule.
                </p>
              )}

              {(businessPhone || businessEmail || businessWebsite || businessAddress) && (
                <div className="mt-5 pt-4 border-t border-white/20 space-y-1.5 text-[12.5px] leading-snug">
                  {businessPhone && (
                    <p className="font-bold break-words">Phone : {businessPhone}</p>
                  )}
                  {businessEmail && (
                    <p className="font-bold break-all">Email : {businessEmail}</p>
                  )}
                  {businessWebsite && (
                    <p className="font-semibold text-[11.5px] opacity-95 break-all">
                      Web : {businessWebsite}
                    </p>
                  )}
                  {businessAddress && (
                    <p className="text-[11.5px] font-medium opacity-90 break-words">
                      {businessAddress}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ─── 2. CLIENT & DATES HIERARCHY STRIP ─── */}
        <section
          className={`invoice-keep-together py-4 border-y border-[#E5E7EB] ${
            compact ? 'space-y-4' : 'grid grid-cols-12 gap-6 items-start'
          }`}
        >
          {/* Client Details */}
          <div className={compact ? 'space-y-1' : 'col-span-7 min-w-0'}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#6B7280] mb-1">
              Billed To
            </p>
            <p className="text-[14.5px] font-extrabold text-[#1E1F1D] leading-snug break-words">
              {clientName}
            </p>
            {clientCompany && (
              <p className="text-[12.5px] font-semibold text-[#374151] break-words">
                {clientCompany}
              </p>
            )}
            {(clientPhone || clientEmail || clientAddress) && (
              <div className="text-[11.5px] text-[#525459] leading-relaxed pt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {clientPhone && <span>{clientPhone}</span>}
                {clientEmail && <span className="break-all">{clientEmail}</span>}
                {clientAddress && <span className="break-words">{clientAddress}</span>}
              </div>
            )}
            {(invoice.projectName || invoice.packageTitle) && (
              <p className="text-[11.5px] text-[#374151] pt-1 break-words">
                <span className="font-bold text-[#1E1F1D]">Project:</span>{' '}
                {[invoice.projectName, invoice.packageTitle].filter(Boolean).join(' — ')}
              </p>
            )}
          </div>

          {/* Dates & Terms Metadata */}
          <div className={compact ? 'space-y-1.5 text-xs' : 'col-span-5 space-y-1.5 text-[12px]'}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[#6B7280] font-medium">Issue Date</span>
              <span className="font-bold text-[#1E1F1D] tabular-nums text-right">
                {formatDate(invoice.invoiceDate || new Date())}
              </span>
            </div>

            {invoice.dueDate && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[#6B7280] font-medium">Due Date</span>
                <span
                  className={`font-bold tabular-nums text-right ${
                    displayStatus === 'Overdue' ? 'text-rose-700' : 'text-[#1E1F1D]'
                  }`}
                >
                  {formatDate(invoice.dueDate)}
                </span>
              </div>
            )}

            {invoice.paymentTerms && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[#6B7280] font-medium">Terms</span>
                <span className="font-semibold text-[#1E1F1D] text-right break-words">
                  {invoice.paymentTerms}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ─── 3. ALTERNATING ROUNDED ITEMS TABLE ─── */}
        <section className="pt-6 pb-4">
          <table
            data-invoice-table="true"
            className="w-full border-collapse table-fixed"
          >
            <thead>
              <tr>
                <th colSpan={4} className="p-0 pb-2.5 border-0 text-left font-normal">
                  <div
                    className={
                      compact
                        ? 'grid grid-cols-[minmax(0,1fr)_44px_104px] items-center gap-2 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#525459]'
                        : 'grid grid-cols-[minmax(0,1fr)_68px_122px_132px] items-center gap-3 px-5 text-[12px] font-bold uppercase tracking-[0.04em] text-[#525459]'
                    }
                  >
                    <div className="text-left">
                      DESCRIPTION <span className="px-0.5 text-[#1E1F1D] font-extrabold">|</span> SERVICES
                    </div>
                    <div className="text-center">QNT</div>
                    {!compact && <div className="text-center">PRICE</div>}
                    <div className="text-right">TOTAL</div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const qty =
                  item.quantity !== undefined && item.quantity !== null
                    ? Number(item.quantity)
                    : 1
                const unitPrice = Number(item.unitPrice) || 0
                const lineTotal =
                  item.total !== undefined ? Number(item.total) || 0 : qty * unitPrice
                const primaryTitle =
                  item.title?.trim() || item.description?.trim() || `Service Item ${index + 1}`
                const secondaryDesc =
                  item.title?.trim() &&
                  item.description?.trim() &&
                  item.title.trim() !== item.description.trim()
                    ? item.description.trim()
                    : ''
                const isDarkRow = index % 2 === 0

                return (
                  <tr key={item.id || index} className="invoice-keep-together">
                    <td colSpan={4} className="p-0 pb-2 border-0">
                      <div
                        className={`${
                          isDarkRow ? 'invoice-row-dark' : 'invoice-row-light'
                        } ${
                          compact
                            ? 'grid grid-cols-[minmax(0,1fr)_44px_104px] gap-2 px-3.5 py-3 rounded-[14px]'
                            : 'grid grid-cols-[minmax(0,1fr)_68px_122px_132px] gap-3 px-5 py-3.5 rounded-[16px]'
                        } items-center`}
                      >
                        <div className="min-w-0 text-left">
                          <p
                            className={`font-semibold ${
                              compact ? 'text-[12px]' : 'text-[13.5px]'
                            } leading-snug break-words`}
                          >
                            {primaryTitle}
                          </p>
                          {secondaryDesc && (
                            <p
                              className={`text-[11.5px] mt-1 whitespace-pre-line break-words leading-relaxed ${
                                isDarkRow ? 'opacity-80' : 'text-[#525459]'
                              }`}
                            >
                              {secondaryDesc}
                            </p>
                          )}
                          {compact && (
                            <p
                              className={`text-[10.5px] mt-0.5 tabular-nums ${
                                isDarkRow ? 'opacity-75' : 'text-[#6B7280]'
                              }`}
                            >
                              Unit: {formatCurrency(unitPrice, currency, symbol)}
                            </p>
                          )}
                        </div>

                        <div className="text-center font-semibold tabular-nums whitespace-nowrap text-[13px]">
                          {formatQuantityDisplay(qty)}
                        </div>

                        {!compact && (
                          <div className="text-center font-semibold tabular-nums whitespace-nowrap text-[13px]">
                            {unitPrice === 0 && lineTotal === 0
                              ? '00'
                              : formatCurrency(unitPrice, currency, symbol)}
                          </div>
                        )}

                        <div className="text-right font-bold tabular-nums whitespace-nowrap text-[13px]">
                          {unitPrice === 0 && lineTotal === 0
                            ? '00'
                            : formatCurrency(lineTotal, currency, symbol)}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* ─── 4. OPTIONAL NOTES & RECORDED SETTLEMENT REFERENCE ─── */}
        {(notes ||
          (amountPaid > 0 &&
            (invoice.paymentMethod ||
              invoice.paymentReference ||
              invoice.paystackReference ||
              invoice.paymentDate ||
              invoice.paidAt))) && (
          <section className="invoice-keep-together pb-3 space-y-2">
            {amountPaid > 0 &&
              (invoice.paymentMethod ||
                invoice.paymentReference ||
                invoice.paystackReference ||
                invoice.paymentDate ||
                invoice.paidAt) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[#374151] px-1">
                  <span className="font-bold text-[#1E1F1D]">Payment Recorded:</span>
                  {invoice.paymentMethod && <span>Method: {invoice.paymentMethod}</span>}
                  {(invoice.paymentReference || invoice.paystackReference) && (
                    <span className="invoice-mono">
                      Ref: {invoice.paymentReference || invoice.paystackReference}
                    </span>
                  )}
                  {(invoice.paymentDate || invoice.paidAt) && (
                    <span>Date: {formatDate(invoice.paymentDate || invoice.paidAt)}</span>
                  )}
                </div>
              )}

            {notes && (
              <div className="px-1">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#6B7280] mb-0.5">
                  Notes
                </p>
                <p className="text-[12px] text-[#374151] whitespace-pre-line break-words leading-relaxed">
                  {notes}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ─── 5. SIGNATURE 3-SEGMENT PAYMENT SUMMARY BAR ─── */}
        <section className="invoice-keep-together mt-auto pt-5">
          {/* Adjustment / Discount / Tax / Shipping Summary Line */}
          {(discountAmount > 0 || taxAmount > 0 || shippingAmount > 0) && (
            <div className="text-center mb-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-[#1E1F1D]">
              <span className="text-[#525459] font-medium">
                Subtotal: {formatCurrency(subtotal, currency, symbol)}
              </span>
              {discountAmount > 0 && (
                <span>
                  •{' '}
                  {discountPctDisplay > 0
                    ? `${discountPctDisplay}% Discount Applied (-${formatCurrency(
                        discountAmount,
                        currency,
                        symbol
                      )})`
                    : `${formatCurrency(discountAmount, currency, symbol)} Discount Applied`}
                </span>
              )}
              {taxAmount > 0 && (
                <span>
                  • Tax{invoice.taxRate ? ` (${invoice.taxRate}%)` : ''}: +
                  {formatCurrency(taxAmount, currency, symbol)}
                </span>
              )}
              {shippingAmount > 0 && (
                <span>
                  • Shipping: +{formatCurrency(shippingAmount, currency, symbol)}
                </span>
              )}
            </div>
          )}

          {shouldStackSummary ? (
            /* Responsive Stacked Capsule Layout for Narrow Viewports or Extra-Large Figures */
            <div className="space-y-3 max-w-md mx-auto w-full">
              <div className="invoice-summary-total rounded-full bg-[var(--inv-highlight)] text-[var(--inv-highlight-fg)] px-6 py-3 flex items-baseline justify-between gap-4">
                <span className="text-[14px] font-bold">Total:</span>
                <span className="text-[15.5px] font-extrabold tabular-nums whitespace-nowrap">
                  {formattedTotal}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <p className="text-[11px] font-semibold text-[#1E1F1D] text-center mb-1">
                    {paidWingLabel}
                  </p>
                  <div className="invoice-summary-wing rounded-full bg-[var(--inv-brand-blue)] text-[var(--inv-brand-blue-fg)] py-2 px-3 text-center font-bold text-[12px] tabular-nums whitespace-nowrap">
                    {formattedPaid}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#1E1F1D] text-center mb-1">
                    Balance Due
                  </p>
                  <div className="invoice-summary-wing rounded-full bg-[var(--inv-brand-blue)] text-[var(--inv-brand-blue-fg)] py-2 px-3 text-center font-bold text-[12px] tabular-nums whitespace-nowrap">
                    {formattedBalance}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Canonical 3-Segment Horizontal Payment Summary Bar Matching Reference */
            <div className="flex items-end justify-center w-full max-w-[660px] mx-auto">
              {/* Left Wing: Deposit / Payments Received */}
              <div className="flex-1 min-w-[140px]">
                <p className="text-[11.5px] font-medium text-[#1E1F1D] text-center mb-1.5 pr-2">
                  {paidWingLabel}
                </p>
                <div className="invoice-summary-wing bg-[var(--inv-brand-blue)] text-[var(--inv-brand-blue-fg)] rounded-l-full py-2.5 pl-5 pr-6 text-center font-bold text-[12.5px] tabular-nums whitespace-nowrap">
                  {formattedPaid}
                </div>
              </div>

              {/* Center Highlight Capsule: Total */}
              <div className="invoice-summary-total relative z-10 -mx-3 shrink-0 rounded-full bg-[var(--inv-highlight)] text-[var(--inv-highlight-fg)] px-7 py-3.5 flex items-baseline justify-between gap-6 min-w-[240px]">
                <span className="text-[15px] font-bold tracking-tight">Total:</span>
                <span className="text-[16px] font-extrabold tabular-nums whitespace-nowrap">
                  {formattedTotal}
                </span>
              </div>

              {/* Right Wing: Balance Due */}
              <div className="flex-1 min-w-[140px]">
                <p className="text-[11.5px] font-medium text-[#1E1F1D] text-center mb-1.5 pl-2">
                  Balance Due
                </p>
                <div className="invoice-summary-wing bg-[var(--inv-brand-blue)] text-[var(--inv-brand-blue-fg)] rounded-r-full py-2.5 pl-6 pr-5 text-center font-bold text-[12.5px] tabular-nums whitespace-nowrap">
                  {formattedBalance}
                </div>
              </div>
            </div>
          )}

          {/* Interactive Online Payment CTA (Preview-only; excluded from Print & PDF) */}
          {showPaymentButton && paymentUrl && balanceDue > 0 && (
            <div className="no-print mt-5 max-w-xs mx-auto" data-html2canvas-ignore="true">
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-full bg-[#1E1F1D] hover:opacity-90 text-white font-semibold text-xs text-center transition-opacity"
              >
                <span>Pay Online ({formattedBalance})</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}
        </section>

        {/* ─── 6. SUBTLE CONFIGURED FOOTER ─── */}
        {(thankYouMessage || businessSocial) && (
          <footer className="invoice-keep-together pt-6 mt-4 border-t border-[#F1F3F5] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[11px] text-[#6B7280]">
            {thankYouMessage && <span className="break-words">{thankYouMessage}</span>}
            {businessSocial && (
              <span className="font-semibold text-[#1E1F1D] break-words">{businessSocial}</span>
            )}
          </footer>
        )}
      </div>
    </article>
  )
}
