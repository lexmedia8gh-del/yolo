'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InvoiceDocument } from './InvoiceDocument'
import { downloadInvoicePdf, printInvoiceDocument } from '@/lib/utils/pdfGenerator'
import { copyToClipboard } from '@/lib/utils'
import type { Invoice } from '@/lib/types'
import {
  Download,
  Printer,
  Mail,
  Share2,
  Copy,
  ExternalLink,
  Edit2,
  Smartphone,
  Monitor,
  Check,
  CheckCircle2,
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

  if (!invoice) return null

  const elementId = `invoice-preview-${invoice.id || 'current'}`
  const resolvedPaymentUrl = paymentUrl || invoice.paymentLinkUrl || ''

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true)
    const toastId = toast.loading('Generating high-resolution PDF...')
    try {
      const filename = `${invoice.invoiceNumber || 'Invoice'}.pdf`
      const success = await downloadInvoicePdf(elementId, { filename })
      if (success) {
        toast.success('Invoice PDF downloaded successfully!', { id: toastId })
      } else {
        toast.error('Failed to generate PDF. Please try browser print.', { id: toastId })
      }
    } catch (e) {
      toast.error('Error generating PDF', { id: toastId })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handlePrint = () => {
    printInvoiceDocument(elementId)
  }

  const handleCopyPaymentLink = async () => {
    if (!resolvedPaymentUrl) {
      toast.error('No payment link generated for this invoice.')
      return
    }
    const success = await copyToClipboard(resolvedPaymentUrl)
    if (success) {
      setHasCopiedLink(true)
      toast.success('Payment link copied to clipboard!')
      setTimeout(() => setHasCopiedLink(false), 2500)
    } else {
      toast.error('Failed to copy link')
    }
  }

  const handleShareWhatsApp = () => {
    const clientName = invoice.clientName || 'Valued Client'
    const invNumber = invoice.invoiceNumber
    const balance = invoice.balanceDue || invoice.total
    const currency = invoice.currency || 'GHS'
    const link = resolvedPaymentUrl

    const msg = `Hello ${clientName}, here is your invoice ${invNumber} from LEXMEDIA.GH.\n\nTotal Due: ${currency} ${Number(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nView and pay your invoice securely online here:\n${link}`
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="full"
    >
      <div className="space-y-4">
        {/* ─── Top Control Bar ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-base">
              Invoice Preview: <span className="font-mono text-blue-600">{invoice.invoiceNumber}</span>
            </span>
          </div>

          {/* View Mode Switcher (Desktop vs Mobile Preview) */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold text-gray-600">
            <button
              type="button"
              onClick={() => setViewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'desktop'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Monitor size={14} />
              Desktop
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
              <Smartphone size={14} />
              Mobile
            </button>
          </div>

          {/* Action Buttons */}
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
              onClick={handleDownloadPdf}
            >
              Download PDF
            </Button>

            {resolvedPaymentUrl && (
              <Button
                variant="outline"
                size="sm"
                icon={hasCopiedLink ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                onClick={handleCopyPaymentLink}
              >
                {hasCopiedLink ? 'Copied!' : 'Copy Link'}
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

        {/* ─── Scrollable Preview Container ─── */}
        <div className="bg-slate-100 p-4 sm:p-8 rounded-xl max-h-[75vh] overflow-y-auto flex justify-center">
          <div
            className={`transition-all duration-300 w-full ${
              viewMode === 'mobile'
                ? 'max-w-sm shadow-2xl rounded-2xl overflow-hidden border-8 border-gray-900 bg-white'
                : 'max-w-3xl'
            }`}
          >
            <InvoiceDocument
              invoice={invoice}
              elementId={elementId}
              compact={viewMode === 'mobile'}
              showPaymentButton={true}
              paymentUrl={resolvedPaymentUrl}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
