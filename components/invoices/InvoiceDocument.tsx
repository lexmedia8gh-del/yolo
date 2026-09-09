'use client'

import React from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Invoice, InvoiceItem } from '@/lib/types'
import { CheckCircle2, AlertCircle, Clock, Send, FileText, Globe, Phone, Mail, MapPin } from 'lucide-react'

interface InvoiceDocumentProps {
  invoice: Partial<Invoice>
  elementId?: string
  compact?: boolean
  showPaymentButton?: boolean
  paymentUrl?: string
}

export function InvoiceDocument({
  invoice,
  elementId = 'invoice-document-render',
  compact = false,
  showPaymentButton = false,
  paymentUrl,
}: InvoiceDocumentProps) {
  const currency = invoice.currency || 'GHS'
  const symbol = invoice.currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'GH₵')
  
  const business = invoice.businessInfo || {
    name: 'LEXMEDIA',
    address: 'East Legon, Accra, Ghana',
    phone: '+233 24 123 4567',
    whatsapp: '+233 24 123 4567',
    email: 'contact@lexmedia.com',
    website: 'https://lexmedia.gh',
  }

  const client = invoice.clientInfo || {
    name: invoice.clientName || 'Valued Client',
    company: invoice.clientCompany || '',
    email: invoice.clientEmail || '',
    phone: invoice.clientPhone || '',
    address: invoice.clientAddress || '',
  }

  const items: InvoiceItem[] = invoice.items && invoice.items.length > 0
    ? invoice.items
    : [
        {
          id: '1',
          title: 'Creative Media Production',
          description: 'Photography & Videography Session',
          quantity: 1,
          unitPrice: invoice.total || 0,
          total: invoice.total || 0,
        },
      ]

  const subtotal = Number(invoice.subtotal) || items.reduce((acc, it) => acc + (Number(it.total) || 0), 0)
  const discountAmount = Number(invoice.discountAmount) || 0
  const taxAmount = Number(invoice.taxAmount) || 0
  const total = Number(invoice.total) || (subtotal - discountAmount + taxAmount)
  const amountPaid = Number(invoice.amountPaid) || 0
  const balanceDue = Number(invoice.balanceDue) !== undefined ? Number(invoice.balanceDue) : Math.max(0, total - amountPaid)

  const status = invoice.status || 'Draft'

  // Status Badge styling
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'Paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'Partially Paid':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'Sent':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'Overdue':
        return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'Cancelled':
        return 'bg-gray-100 text-gray-600 border-gray-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  return (
    <div
      id={elementId}
      className={`bg-white text-gray-900 mx-auto transition-all ${
        compact ? 'p-4 text-xs' : 'p-8 sm:p-12 text-sm shadow-sm rounded-xl border border-gray-200'
      }`}
      style={{
        maxWidth: compact ? '100%' : '820px',
        minHeight: compact ? 'auto' : '1050px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* ─── Header: Business Details & Invoice Title ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-8 border-b border-gray-200">
        <div className="space-y-3 max-w-sm">
          {business.logo ? (
            <div className="h-16 max-w-[200px] flex items-center">
              <img
                src={business.logo}
                alt={business.name || 'Business Logo'}
                className="max-h-16 max-w-full object-contain"
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-gray-900 text-white flex items-center justify-center font-bold text-lg tracking-wider">
                LM
              </div>
              <span className="font-extrabold text-xl tracking-tight text-gray-900">
                {business.name || 'LEXMEDIA'}
              </span>
            </div>
          )}

          <div className="text-gray-500 text-xs leading-relaxed space-y-0.5">
            {business.address && (
              <p className="flex items-center gap-1.5">
                <MapPin size={12} className="text-gray-400 shrink-0" />
                <span>{business.address}</span>
              </p>
            )}
            {business.email && (
              <p className="flex items-center gap-1.5">
                <Mail size={12} className="text-gray-400 shrink-0" />
                <span>{business.email}</span>
              </p>
            )}
            {business.phone && (
              <p className="flex items-center gap-1.5">
                <Phone size={12} className="text-gray-400 shrink-0" />
                <span>{business.phone}</span>
              </p>
            )}
            {business.website && (
              <p className="flex items-center gap-1.5">
                <Globe size={12} className="text-gray-400 shrink-0" />
                <span>{business.website}</span>
              </p>
            )}
          </div>
        </div>

        <div className="sm:text-right space-y-2">
          <div className="flex sm:justify-end items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 uppercase">
              Invoice
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(
                status
              )}`}
            >
              {status}
            </span>
          </div>

          <p className="text-sm font-mono font-bold text-gray-900">
            {invoice.invoiceNumber || 'LEX-INV-0001'}
          </p>

          <div className="text-xs text-gray-500 space-y-1 pt-1">
            <p>
              <span className="text-gray-400">Invoice Date: </span>
              <span className="font-medium text-gray-800">
                {formatDate(invoice.invoiceDate || new Date())}
              </span>
            </p>
            {invoice.dueDate && (
              <p>
                <span className="text-gray-400">Due Date: </span>
                <span className="font-medium text-gray-800">
                  {formatDate(invoice.dueDate)}
                </span>
              </p>
            )}
            {invoice.paymentTerms && (
              <p>
                <span className="text-gray-400">Terms: </span>
                <span className="font-medium text-gray-800">{invoice.paymentTerms}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Client / Bill To Section ─── */}
      <div className="py-6 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
            Billed To
          </span>
          <h2 className="text-base font-bold text-gray-900">
            {client.name || invoice.clientName || 'Client Name'}
          </h2>
          {client.company && (
            <p className="text-xs font-medium text-gray-700">{client.company}</p>
          )}
          {client.email && (
            <p className="text-xs text-gray-500 mt-0.5">{client.email}</p>
          )}
          {client.phone && (
            <p className="text-xs text-gray-500">{client.phone}</p>
          )}
          {client.address && (
            <p className="text-xs text-gray-500 mt-0.5">{client.address}</p>
          )}
        </div>

        {invoice.projectName && (
          <div className="sm:text-right">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
              Project Reference
            </span>
            <p className="text-sm font-semibold text-gray-800">{invoice.projectName}</p>
            {invoice.packageTitle && (
              <p className="text-xs text-gray-500 mt-0.5">{invoice.packageTitle}</p>
            )}
          </div>
        )}
      </div>

      {/* ─── Line Items Table ─── */}
      <div className="py-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50/70 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <th className="py-3 px-4 rounded-l-lg">Item &amp; Description</th>
              <th className="py-3 px-4 text-center w-20">Qty</th>
              <th className="py-3 px-4 text-right w-32">Rate ({symbol})</th>
              <th className="py-3 px-4 text-right w-36 rounded-r-lg">Total ({symbol})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, index) => (
              <tr
                key={item.id || index}
                className={index % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}
              >
                <td className="py-3.5 px-4 align-top">
                  <p className="font-semibold text-gray-900 text-sm">
                    {item.title || item.description || `Item #${index + 1}`}
                  </p>
                  {item.title && item.description && item.title !== item.description && (
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">
                      {item.description}
                    </p>
                  )}
                </td>
                <td className="py-3.5 px-4 text-center align-top text-gray-700 font-medium">
                  {item.quantity || 1}
                </td>
                <td className="py-3.5 px-4 text-right align-top text-gray-700 font-mono">
                  {formatCurrency(item.unitPrice || 0, currency, symbol)}
                </td>
                <td className="py-3.5 px-4 text-right align-top font-bold text-gray-900 font-mono">
                  {formatCurrency(item.total || 0, currency, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Summary & Calculations Section ─── */}
      <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row justify-between items-start gap-8">
        {/* Left column: Payment instructions, notes & terms */}
        <div className="w-full sm:max-w-md space-y-4 text-xs text-gray-600">
          {invoice.paymentInstructions && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <p className="font-bold text-gray-800 text-[11px] uppercase tracking-wider mb-1">
                Payment Instructions
              </p>
              <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                {invoice.paymentInstructions}
              </p>
            </div>
          )}

          {invoice.notes && (
            <div>
              <p className="font-bold text-gray-700 text-[11px] uppercase tracking-wider mb-1">
                Notes &amp; Instructions
              </p>
              <p className="text-gray-600 whitespace-pre-line leading-relaxed">
                {invoice.notes}
              </p>
            </div>
          )}

          {invoice.terms && (
            <div>
              <p className="font-bold text-gray-700 text-[11px] uppercase tracking-wider mb-1">
                Terms &amp; Conditions
              </p>
              <p className="text-gray-500 whitespace-pre-line leading-relaxed text-[11px]">
                {invoice.terms}
              </p>
            </div>
          )}
        </div>

        {/* Right column: Totals Box */}
        <div className="w-full sm:w-80 bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Subtotal</span>
            <span className="font-mono font-medium text-gray-900">
              {formatCurrency(subtotal, currency, symbol)}
            </span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-xs text-emerald-700">
              <span>
                Discount {invoice.discountType === 'percentage' && invoice.discountValue ? `(${invoice.discountValue}%)` : ''}
              </span>
              <span className="font-mono font-medium">
                -{formatCurrency(discountAmount, currency, symbol)}
              </span>
            </div>
          )}

          {taxAmount > 0 && (
            <div className="flex justify-between text-xs text-gray-600">
              <span>Tax {invoice.taxRate ? `(${invoice.taxRate}%)` : ''}</span>
              <span className="font-mono font-medium text-gray-900">
                +{formatCurrency(taxAmount, currency, symbol)}
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
            <span className="text-sm font-bold text-gray-900">Total</span>
            <span className="text-lg font-extrabold text-gray-900 font-mono">
              {formatCurrency(total, currency, symbol)}
            </span>
          </div>

          {amountPaid > 0 && (
            <div className="flex justify-between text-xs text-emerald-700 pt-1">
              <span>Amount Paid</span>
              <span className="font-mono font-semibold">
                -{formatCurrency(amountPaid, currency, symbol)}
              </span>
            </div>
          )}

          <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900 block">
                Balance Due
              </span>
              {status === 'Paid' && (
                <span className="text-[10px] text-emerald-600 font-medium">Fully Settled</span>
              )}
            </div>
            <span
              className={`text-xl font-black font-mono ${
                balanceDue > 0 ? 'text-blue-700' : 'text-emerald-600'
              }`}
            >
              {formatCurrency(balanceDue, currency, symbol)}
            </span>
          </div>

          {showPaymentButton && paymentUrl && balanceDue > 0 && (
            <div className="pt-3">
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full block py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs text-center shadow transition-colors"
              >
                Pay Securely Online ({formatCurrency(balanceDue, currency, symbol)})
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ─── Thank You & Footer Banner ─── */}
      <div className="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-700">
          {invoice.thankYouMessage || 'Thank you for your business with LexMedia!'}
        </p>
        <p className="text-[11px]">
          For inquiries or assistance regarding this invoice, contact us at {business.email || 'billing@lexmedia.gh'}
        </p>
      </div>
    </div>
  )
}
