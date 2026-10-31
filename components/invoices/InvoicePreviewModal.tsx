'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InvoiceDocument } from './InvoiceDocument'
import { InvoiceStage } from './InvoiceStage'
import { downloadInvoicePdf, printInvoiceDocument } from '@/lib/utils/pdfGenerator'
import {
  copyToClipboard,
  getPaymentLink,
  getProductionUrl,
  isVercelPlatformDomain,
  formatActionError,
} from '@/lib/utils'
import type { Invoice } from '@/lib/types'
import {
  Check,
  Copy,
  Download,
  Edit2,
  Mail,
  Monitor,
  Printer,
  Share2,
  Smartphone,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface InvoicePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  paymentUrl?: string
  onEdit?: (invoice: Invoice) => void
  onSendEmail?: (invoice: Invoice) => void
}

export function InvoicePreviewModal({
  isOpen,
  onClose,
  invoice,
  paymentUrl,
  onEdit,
  onSendEmail,
}: InvoicePreviewModalProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [hasCopiedLink, setHasCopiedLink] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setIsGeneratingPdf(false)
    }
  }, [isOpen])

  if (!invoice) return null

  const baseId = `invoice-preview-${invoice.id || 'current'}`
  const exportTargetId = viewMode === 'mobile' ? `${baseId}-a4-export` : baseId

  const resolvedPaymentUrl =
    paymentUrl && !isVercelPlatformDomain(paymentUrl)
      ? getProductionUrl(paymentUrl)
      : invoice.paymentLinkToken
      ? getPaymentLink(invoice.paymentLinkToken)
      : invoice.paymentLinkUrl && !isVercelPlatformDomain(invoice.paymentLinkUrl)
      ? getProductionUrl(invoice.paymentLinkUrl)
      : invoice.invoiceNumber
      ? getPaymentLink(invoice.invoiceNumber)
      : ''

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return
    setIsGeneratingPdf(true)
    const toastId = toast.loading('Generating A4 invoice PDF...')
    try {
      const filename = `${invoice.invoiceNumber || 'Invoice'}.pdf`
      const success = await downloadInvoicePdf(exportTargetId, { filename })
      if (success) {
        toast.success('Invoice PDF downloaded.', { id: toastId })
      } else {
        toast.error('Failed to generate PDF. Please try Print.', { id: toastId })
      }
    } catch (err) {
      toast.error(formatActionError(err, 'Error generating PDF.'), { id: toastId })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handlePrint = () => {
    printInvoiceDocument(exportTargetId, invoice.invoiceNumber || 'Invoice')
  }

  const handleCopyPaymentLink = async () => {
    if (!resolvedPaymentUrl) {
      toast.error('No payment link generated for this invoice.')
      return
    }
    const success = await copyToClipboard(resolvedPaymentUrl)
    if (success) {
      setHasCopiedLink(true)
      toast.success('Payment link copied to clipboard.')
      setTimeout(() => setHasCopiedLink(false), 2500)
    } else {
      toast.error('Failed to copy link.')
    }
  }

  const handleShareWhatsApp = () => {
    const clientName = invoice.clientName || 'Valued Client'
    const invNumber = invoice.invoiceNumber
    const balance =
      invoice.balanceDue !== undefined ? invoice.balanceDue : invoice.total
    const currency = invoice.currency || 'GHS'
    const link = resolvedPaymentUrl

    const msg = `Hello ${clientName}, here is your invoice ${invNumber} from ${
      invoice.businessInfo?.name || 'lexmedia.gh'
    }.\n\nBalance Due: ${currency} ${Number(balance || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}${link ? `\n\nView and pay securely online:\n${link}` : ''}`
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isGeneratingPdf && onClose()}
      preventClose={isGeneratingPdf}
      title=""
      size="full"
    >
      <div className="space-y-4">
        {/* ─── Top Action & Viewport Control Bar ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-gray-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-bold text-gray-900 text-base truncate">
              Invoice Preview
            </span>
            <span className="invoice-mono text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
              {invoice.invoiceNumber}
            </span>
          </div>

          {/* Viewport Switcher (A4 Document vs Mobile Compact) */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold text-gray-600 border border-gray-200/70">
            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'desktop'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Monitor size={13} />
              A4 Document
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'mobile'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Smartphone size={13} />
              Mobile View
            </button>
          </div>

          {/* Primary Document Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                icon={<Edit2 size={13} />}
                onClick={() => {
                  onClose()
                  onEdit(invoice)
                }}
              >
                Edit
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={<Printer size={13} />}
              onClick={handlePrint}
            >
              Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              loading={isGeneratingPdf}
              loadingText="Generating PDF..."
              onClick={handleDownloadPdf}
            >
              Download PDF
            </Button>

            {resolvedPaymentUrl && (
              <Button
                variant="outline"
                size="sm"
                icon={
                  hasCopiedLink ? (
                    <Check size={13} className="text-emerald-600" />
                  ) : (
                    <Copy size={13} />
                  )
                }
                onClick={handleCopyPaymentLink}
              >
                {hasCopiedLink ? 'Copied' : 'Copy Link'}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={<Share2 size={13} />}
              onClick={handleShareWhatsApp}
              className="text-emerald-700 hover:bg-emerald-50 border-emerald-200"
            >
              WhatsApp
            </Button>

            {onSendEmail && (
              <Button
                variant="primary"
                size="sm"
                icon={<Mail size={13} />}
                onClick={() => {
                  onClose()
                  onSendEmail(invoice)
                }}
              >
                Send Email
              </Button>
            )}
          </div>
        </div>

        {/* ─── Responsive Preview Stage ─── */}
        <InvoiceStage mode={viewMode}>
          <InvoiceDocument
            invoice={invoice}
            elementId={baseId}
            compact={viewMode === 'mobile'}
            showPaymentButton={true}
            paymentUrl={resolvedPaymentUrl}
          />
        </InvoiceStage>

        {/* Offscreen canonical A4 export sheet when user is in Mobile View */}
        {viewMode === 'mobile' && (
          <div
            aria-hidden="true"
            className="fixed -left-[9999px] top-0 pointer-events-none opacity-0"
          >
            <InvoiceDocument
              invoice={invoice}
              elementId={exportTargetId}
              compact={false}
              showPaymentButton={false}
              paymentUrl={resolvedPaymentUrl}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
