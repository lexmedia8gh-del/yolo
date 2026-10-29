'use client'

import React, { useId, useState } from 'react'
import { formatCurrency, formatDate, getCustomerUrl, resolveDateValue } from '@/lib/utils'
import {
  hexToRgba,
  sanitizeBrandingLogoUrl,
  useInvoiceBranding,
} from '@/lib/hooks/useInvoiceBranding'
import type { Invoice, InvoiceItem } from '@/lib/types'
import { ExternalLink, Globe, Mail, MapPin, Phone } from 'lucide-react'

interface InvoiceDocumentProps {
  invoice: Partial<Invoice>
  elementId?: string
  compact?: boolean
  showPaymentButton?: boolean
  paymentUrl?: string
}

type DisplayStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue' | 'Draft' | 'Cancelled'

function resolveDisplayStatus(
  rawStatus: string | undefined,
  balanceDue: number,
  amountPaid: number,
  total: number,
  dueDate: Invoice['dueDate']
): DisplayStatus {
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

function getStatusBadgeClasses(status: DisplayStatus): string {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300'
    case 'Partially Paid':
      return 'bg-amber-50 text-amber-800 border-amber-300'
    case 'Overdue':
      return 'bg-rose-50 text-rose-800 border-rose-300'
    case 'Pending':
      return 'bg-sky-50 text-sky-800 border-sky-300'
    case 'Cancelled':
      return 'bg-slate-100 text-slate-600 border-slate-300'
    case 'Draft':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300'
  }
}

function deriveMonogram(name: string, shortName?: string): string {
  const cleanShort = (shortName || '').trim()
  if (cleanShort && cleanShort.length <= 3) return cleanShort.toUpperCase()
  const parts = (name || 'LM')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return (parts[0] || 'LM').slice(0, 2).toUpperCase()
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

  const rawInvoiceLogo = sanitizeBrandingLogoUrl(invoice.businessInfo?.logo)
  const activeLogoUrl = rawInvoiceLogo || resolvedLogoUrl
  const showLogoImage = Boolean(activeLogoUrl && failedLogoSrc !== activeLogoUrl)

  const businessName =
    invoice.businessInfo?.name?.trim() || businessDefaults.name || 'LEXMEDIA.GH'
  const businessTagline =
    invoice.businessInfo?.tagline?.trim() || businessDefaults.tagline || ''
  const businessAddress =
    invoice.businessInfo?.address !== undefined
      ? invoice.businessInfo.address
      : businessDefaults.address
  const businessEmail =
    invoice.businessInfo?.email !== undefined
      ? invoice.businessInfo.email
      : businessDefaults.email
  const businessPhone =
    invoice.businessInfo?.phone !== undefined
      ? invoice.businessInfo.phone
      : businessDefaults.phone || businessDefaults.whatsapp
  const businessWebsite =
    invoice.businessInfo?.website !== undefined
      ? invoice.businessInfo.website
      : businessDefaults.website || getCustomerUrl()

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
        : (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)
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

  const paymentInstructions =
    invoice.paymentInstructions !== undefined
      ? invoice.paymentInstructions
      : businessDefaults.defaultPaymentInstructions
  const notes = invoice.notes || ''
  const terms = invoice.terms || ''
  const thankYouMessage =
    invoice.thankYouMessage ||
    businessDefaults.defaultThankYouMessage ||
    `Thank you for your business with ${businessName}.`

  const primaryColor = branding.primaryColor || '#0F172A'
  const accentColor = branding.accentColor || '#4F46E5'

  const scopedThemeCss = `
    [data-invoice-sheet="${sheetKey}"] {
      --inv-primary: ${primaryColor};
      --inv-accent: ${accentColor};
      --inv-tint: ${hexToRgba(primaryColor, 0.045)};
      --inv-accent-tint: ${hexToRgba(accentColor, 0.065)};
      --inv-accent-border: ${hexToRgba(accentColor, 0.24)};
    }
  `

  const monogram = deriveMonogram(businessName, businessDefaults.shortName)

  return (
    <article
      id={elementId}
      data-invoice-sheet={sheetKey}
      className={`invoice-paper-sheet bg-white text-slate-900 mx-auto flex flex-col overflow-hidden ${
        compact
          ? 'w-full max-w-full text-xs'
          : 'w-[794px] max-w-[794px] min-h-[980px] text-[13px] shadow-md rounded-sm border border-slate-200/90'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: scopedThemeCss }} />

      {/* Top Architectural Brand Bar */}
      <div className="h-1.5 w-full bg-[var(--inv-primary)] shrink-0" />

      <div
        className={`flex-1 flex flex-col ${
          compact ? 'p-5' : 'px-11 pt-9 pb-8'
        }`}
      >
        {/* ─── 1. DOCUMENT HEADER ─── */}
        <header
          className={`pb-7 border-b border-slate-200 ${
            compact
              ? 'flex flex-col gap-5'
              : 'grid grid-cols-12 gap-6 items-start'
          }`}
        >
          {/* Brand Identity & Sender Details */}
          <div className={compact ? 'space-y-3' : 'col-span-7 space-y-3 min-w-0'}>
            {showLogoImage ? (
              <div className="space-y-2">
                <div className="h-14 flex items-center">
                  <img
                    src={activeLogoUrl}
                    alt={`${businessName} logo`}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedLogoSrc(activeLogoUrl)}
                    className="max-h-14 w-auto max-w-[220px] object-contain object-left"
                  />
                </div>
                <div>
                  <p className="text-[15px] font-bold tracking-tight text-slate-900 leading-snug break-words">
                    {businessName}
                  </p>
                  {businessTagline && (
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5 break-words">
                      {businessTagline}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-[var(--inv-primary)] text-white flex items-center justify-center font-extrabold text-sm tracking-wider shrink-0">
                  {monogram}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-extrabold tracking-tight text-slate-900 leading-tight break-words">
                    {businessName}
                  </p>
                  {businessTagline && (
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5 break-words">
                      {businessTagline}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="text-[11.5px] text-slate-600 leading-relaxed space-y-0.5 pt-0.5">
              {businessAddress && (
                <p className="flex items-start gap-1.5 min-w-0">
                  <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                  <span className="break-words">{businessAddress}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                {businessEmail && (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Mail size={12} className="text-slate-400 shrink-0" />
                    <span className="break-all">{businessEmail}</span>
                  </span>
                )}
                {businessPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    <span>{businessPhone}</span>
                  </span>
                )}
              </div>
              {businessWebsite && (
                <p className="flex items-center gap-1.5 min-w-0">
                  <Globe size={12} className="text-slate-400 shrink-0" />
                  <span className="break-all">{businessWebsite}</span>
                </p>
              )}
            </div>
          </div>

          {/* Invoice Title, Number & Status */}
          <div
            className={
              compact
                ? 'flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100'
                : 'col-span-5 text-right space-y-2'
            }
          >
            <div>
              <h1
                className={`${
                  compact ? 'text-2xl' : 'text-[28px]'
                } font-extrabold tracking-[-0.03em] text-[var(--inv-primary)] uppercase leading-none`}
              >
                Invoice
              </h1>
              <p className="invoice-mono text-[13px] font-semibold text-slate-800 mt-1.5">
                {invoice.invoiceNumber || 'LXM-INV-0001'}
              </p>
            </div>

            <div className={compact ? '' : 'flex justify-end pt-0.5'}>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10.5px] font-bold uppercase tracking-[0.09em] border ${getStatusBadgeClasses(
                  displayStatus
                )}`}
              >
                {displayStatus}
              </span>
            </div>
          </div>
        </header>

        {/* ─── 2. RECIPIENT & METADATA LEDGER ─── */}
        <section
          className={`py-6 border-b border-slate-200 ${
            compact ? 'space-y-5' : 'grid grid-cols-12 gap-6 items-start'
          }`}
        >
          {/* Billed To + Optional Project Reference */}
          <div className={compact ? 'space-y-3' : 'col-span-7 min-w-0'}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                Billed To
              </p>
              <h2 className="text-[15px] font-bold text-slate-900 leading-snug break-words">
                {clientName}
              </h2>
              {clientCompany && (
                <p className="text-[12.5px] font-semibold text-slate-700 mt-0.5 break-words">
                  {clientCompany}
                </p>
              )}
              <div className="text-[12px] text-slate-600 leading-relaxed mt-1 space-y-0.5">
                {clientAddress && <p className="break-words">{clientAddress}</p>}
                {clientEmail && <p className="break-all">{clientEmail}</p>}
                {clientPhone && <p>{clientPhone}</p>}
              </div>
            </div>

            {(invoice.projectName || invoice.packageTitle) && (
              <div className="mt-3.5 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1">
                  Project Reference
                </p>
                {invoice.projectName && (
                  <p className="text-[12.5px] font-semibold text-slate-800 break-words">
                    {invoice.projectName}
                  </p>
                )}
                {invoice.packageTitle && (
                  <p className="text-[11.5px] text-slate-500 mt-0.5 break-words">
                    {invoice.packageTitle}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Invoice Metadata Grid */}
          <div
            className={
              compact
                ? 'rounded-lg border border-slate-200 bg-slate-50/80 p-3.5'
                : 'col-span-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4'
            }
          >
            <dl className="space-y-2 text-[12px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-500 font-medium">Issue Date</dt>
                <dd className="font-semibold text-slate-900 tabular-nums text-right">
                  {formatDate(invoice.invoiceDate || new Date())}
                </dd>
              </div>

              {invoice.dueDate && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-500 font-medium">Due Date</dt>
                  <dd
                    className={`font-semibold tabular-nums text-right ${
                      displayStatus === 'Overdue' ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {formatDate(invoice.dueDate)}
                  </dd>
                </div>
              )}

              {invoice.paymentTerms && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-500 font-medium">Payment Terms</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {invoice.paymentTerms}
                  </dd>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-3 pt-1.5 border-t border-slate-200/80">
                <dt className="text-slate-500 font-medium">Currency</dt>
                <dd className="invoice-mono font-semibold text-slate-900 text-right">
                  {currency} ({symbol})
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ─── 3. LINE ITEMS TABLE ─── */}
        <section className="py-6">
          <table
            data-invoice-table="true"
            className="w-full text-left border-collapse table-fixed"
          >
            <thead>
              <tr className="bg-[var(--inv-tint)] border-y border-slate-200 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                {!compact && <th className="w-10 py-2.5 pl-3 pr-2 text-slate-400">#</th>}
                <th className="py-2.5 px-3">Item &amp; Description</th>
                <th className={`${compact ? 'w-12' : 'w-16'} py-2.5 px-2 text-right`}>
                  Qty
                </th>
                {!compact && (
                  <th className="w-32 py-2.5 px-3 text-right whitespace-nowrap">
                    Unit Price
                  </th>
                )}
                <th
                  className={`${
                    compact ? 'w-28' : 'w-36'
                  } py-2.5 pl-3 pr-3 text-right whitespace-nowrap`}
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, index) => {
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unitPrice) || 0
                const lineTotal =
                  item.total !== undefined ? Number(item.total) || 0 : qty * unitPrice
                const primaryTitle =
                  item.title?.trim() || item.description?.trim() || `Line Item ${index + 1}`
                const secondaryDesc =
                  item.title?.trim() &&
                  item.description?.trim() &&
                  item.title.trim() !== item.description.trim()
                    ? item.description.trim()
                    : ''

                return (
                  <tr
                    key={item.id || index}
                    className="invoice-keep-together bg-white"
                  >
                    {!compact && (
                      <td className="py-3.5 pl-3 pr-2 align-top invoice-mono text-[11.5px] text-slate-400">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                    )}
                    <td className="py-3.5 px-3 align-top min-w-0">
                      <p className="font-semibold text-slate-900 text-[13px] leading-snug break-words">
                        {primaryTitle}
                      </p>
                      {secondaryDesc && (
                        <p className="text-[11.5px] text-slate-600 mt-1 whitespace-pre-line break-words leading-relaxed">
                          {secondaryDesc}
                        </p>
                      )}
                      {compact && (
                        <p className="invoice-mono text-[11px] text-slate-500 mt-1">
                          {qty} × {formatCurrency(unitPrice, currency, symbol)}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-2 align-top text-right invoice-mono text-[12.5px] font-medium text-slate-700 whitespace-nowrap">
                      {qty}
                    </td>
                    {!compact && (
                      <td className="py-3.5 px-3 align-top text-right invoice-mono text-[12.5px] text-slate-700 whitespace-nowrap">
                        {formatCurrency(unitPrice, currency, symbol)}
                      </td>
                    )}
                    <td className="py-3.5 pl-3 pr-3 align-top text-right invoice-mono text-[12.5px] font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(lineTotal, currency, symbol)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* ─── 4. INSTRUCTIONS, NOTES & FINANCIAL SUMMARY ─── */}
        <section
          className={`pt-2 ${
            compact
              ? 'flex flex-col-reverse gap-6'
              : 'grid grid-cols-12 gap-8 items-start'
          }`}
        >
          {/* Left Column: Payment Instructions, Settlement Info, Notes, Terms */}
          <div className={compact ? 'space-y-4' : 'col-span-7 space-y-4 min-w-0'}>
            {paymentInstructions && (
              <div className="invoice-keep-together rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1.5">
                  Payment Instructions
                </p>
                <p className="text-[12px] text-slate-700 whitespace-pre-line break-words leading-relaxed">
                  {paymentInstructions}
                </p>
              </div>
            )}

            {amountPaid > 0 &&
              (invoice.paymentMethod || invoice.paymentReference || invoice.paymentDate || invoice.paidAt) && (
                <div className="invoice-keep-together rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5 text-[11.5px] text-emerald-900">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 mb-1">
                    Recorded Payment Details
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {invoice.paymentMethod && (
                      <span>
                        <span className="text-emerald-700/80">Method:</span>{' '}
                        <strong className="font-semibold">{invoice.paymentMethod}</strong>
                      </span>
                    )}
                    {(invoice.paymentReference || invoice.paystackReference) && (
                      <span>
                        <span className="text-emerald-700/80">Ref:</span>{' '}
                        <strong className="invoice-mono font-semibold">
                          {invoice.paymentReference || invoice.paystackReference}
                        </strong>
                      </span>
                    )}
                    {(invoice.paymentDate || invoice.paidAt) && (
                      <span>
                        <span className="text-emerald-700/80">Date:</span>{' '}
                        <strong className="font-semibold">
                          {formatDate(invoice.paymentDate || invoice.paidAt)}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

            {notes && (
              <div className="invoice-keep-together">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1">
                  Notes
                </p>
                <p className="text-[12px] text-slate-600 whitespace-pre-line break-words leading-relaxed">
                  {notes}
                </p>
              </div>
            )}

            {terms && (
              <div className="invoice-keep-together">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1">
                  Terms &amp; Conditions
                </p>
                <p className="text-[11px] text-slate-500 whitespace-pre-line break-words leading-relaxed">
                  {terms}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Totals & Balance Due Ledger */}
          <div className={compact ? 'w-full space-y-3' : 'col-span-5 space-y-3'}>
            <div className="invoice-keep-together rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="p-4 space-y-2.5 text-[12.5px]">
                <div className="flex items-baseline justify-between gap-3 text-slate-600">
                  <span>Subtotal</span>
                  <span className="invoice-mono font-medium text-slate-900 whitespace-nowrap">
                    {formatCurrency(subtotal, currency, symbol)}
                  </span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-emerald-700">
                    <span>
                      Discount
                      {invoice.discountType === 'percentage' && invoice.discountValue
                        ? ` (${invoice.discountValue}%)`
                        : ''}
                    </span>
                    <span className="invoice-mono font-medium whitespace-nowrap">
                      -{formatCurrency(discountAmount, currency, symbol)}
                    </span>
                  </div>
                )}

                {taxAmount > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-slate-600">
                    <span>
                      Tax{invoice.taxRate ? ` (${invoice.taxRate}%)` : ''}
                    </span>
                    <span className="invoice-mono font-medium text-slate-900 whitespace-nowrap">
                      +{formatCurrency(taxAmount, currency, symbol)}
                    </span>
                  </div>
                )}

                {shippingAmount > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-slate-600">
                    <span>Shipping / Handling</span>
                    <span className="invoice-mono font-medium text-slate-900 whitespace-nowrap">
                      +{formatCurrency(shippingAmount, currency, symbol)}
                    </span>
                  </div>
                )}

                <div className="pt-2.5 border-t border-slate-200 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-bold text-slate-900">Total</span>
                  <span className="invoice-mono text-[15px] font-bold text-slate-900 whitespace-nowrap">
                    {formatCurrency(total, currency, symbol)}
                  </span>
                </div>

                {amountPaid > 0 && (
                  <div className="flex items-baseline justify-between gap-3 text-emerald-700 pt-0.5">
                    <span>Amount Paid</span>
                    <span className="invoice-mono font-semibold whitespace-nowrap">
                      -{formatCurrency(amountPaid, currency, symbol)}
                    </span>
                  </div>
                )}
              </div>

              {/* Balance Due Highlight Band */}
              <div
                className={`px-4 py-3.5 border-t flex items-center justify-between gap-3 ${
                  balanceDue <= 0 && displayStatus === 'Paid'
                    ? 'bg-emerald-50/90 border-emerald-200'
                    : 'bg-[var(--inv-accent-tint)] border-[var(--inv-accent-border)]'
                }`}
              >
                <div>
                  <span
                    className={`text-[11px] font-extrabold uppercase tracking-[0.09em] block ${
                      balanceDue <= 0 && displayStatus === 'Paid'
                        ? 'text-emerald-800'
                        : 'text-[var(--inv-primary)]'
                    }`}
                  >
                    Balance Due
                  </span>
                  {balanceDue <= 0 && displayStatus === 'Paid' && (
                    <span className="text-[10.5px] font-semibold text-emerald-700">
                      Settled in Full
                    </span>
                  )}
                </div>
                <span
                  className={`invoice-mono text-[18px] font-extrabold whitespace-nowrap ${
                    balanceDue <= 0 && displayStatus === 'Paid'
                      ? 'text-emerald-700'
                      : 'text-[var(--inv-primary)]'
                  }`}
                >
                  {formatCurrency(balanceDue, currency, symbol)}
                </span>
              </div>
            </div>

            {/* Interactive Online Payment CTA (Preview-only; excluded from Print & PDF) */}
            {showPaymentButton && paymentUrl && balanceDue > 0 && (
              <div className="no-print" data-html2canvas-ignore="true">
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[var(--inv-primary)] hover:opacity-95 text-white font-semibold text-xs text-center shadow-sm transition-opacity"
                >
                  <span>
                    Pay Online ({formatCurrency(balanceDue, currency, symbol)})
                  </span>
                  <ExternalLink size={13} />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* ─── 5. DOCUMENT FOOTER ─── */}
        <footer className="invoice-keep-together mt-auto pt-8">
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <p className="font-medium text-slate-700 break-words">{thankYouMessage}</p>
            <p className="text-slate-400 shrink-0">
              {businessEmail || businessName}
              {businessPhone ? ` • ${businessPhone}` : ''}
            </p>
          </div>
        </footer>
      </div>
    </article>
  )
}
