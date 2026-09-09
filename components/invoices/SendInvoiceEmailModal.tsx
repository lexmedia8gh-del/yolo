'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { formatCurrency, formatDate, getPaymentLink } from '@/lib/utils'
import type { Invoice } from '@/lib/types'
import { Mail, Send, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

interface SendInvoiceEmailModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  onSuccess?: () => void
}

export function SendInvoiceEmailModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: SendInvoiceEmailModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('')
  const [personalMessage, setPersonalMessage] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (invoice) {
      setRecipientEmail(invoice.clientEmail || '')
      setPersonalMessage(
        `Thank you for partnering with LEXMEDIA.GH. Please find your invoice ${invoice.invoiceNumber} attached with convenient online payment options.`
      )
    }
  }, [invoice])

  if (!invoice) return null

  const currency = invoice.currency || 'GHS'
  const symbol = invoice.currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'GH₵')
  const total = Number(invoice.total) || 0
  const balance = Number(invoice.balanceDue) !== undefined ? Number(invoice.balanceDue) : total

  // Resolve payment URL using authoritative token
  const resolvedPaymentUrl = invoice.paymentLinkUrl || (invoice.paymentLinkToken ? getPaymentLink(invoice.paymentLinkToken) : '')

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipientEmail) {
      toast.error('Recipient email address is required.')
      return
    }

    setIsSending(true)
    const toastId = toast.loading('Sending invoice email...')

    try {
      const res = await fetch('/api/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          toEmail: recipientEmail.trim(),
          clientName: invoice.clientName || 'Valued Client',
          invoiceNumber: invoice.invoiceNumber,
          dueDate: invoice.dueDate ? formatDate(invoice.dueDate) : undefined,
          totalAmount: total,
          balanceDue: balance,
          currencySymbol: symbol,
          paymentUrl: resolvedPaymentUrl,
          personalMessage: personalMessage.trim(),
          items: invoice.items?.map((it) => ({
            description: it.title ? `${it.title} — ${it.description || ''}` : it.description,
            quantity: it.quantity || 1,
            total: it.total || 0,
          })),
          businessName: invoice.businessInfo?.name || 'LexMedia',
          businessLogoUrl: invoice.businessInfo?.logo,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch email')
      }

      toast.success(`Invoice sent to ${recipientEmail}!`, { id: toastId })
      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Send invoice email failed:', err)
      toast.error(err.message || 'Error sending invoice email', { id: toastId })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Invoice to Client"
      size="md"
    >
      <form onSubmit={handleSend} className="space-y-4">
        {/* Recipient summary banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Invoice:</span>
            <span className="font-mono font-bold text-gray-900">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Recipient Name:</span>
            <span className="font-medium text-gray-900">{invoice.clientName || 'Valued Client'}</span>
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Balance Due:</span>
            <span className="font-bold text-blue-700 font-mono">
              {formatCurrency(balance, currency, symbol)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-gray-500 border-t border-slate-200">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>Sender display name: <strong>LEXMEDIA.GH</strong></span>
          </div>
        </div>

        {/* Recipient Email */}
        <Input
          label="Client Email Address *"
          type="email"
          required
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="client@company.com"
          helperText="The invoice notification and secure payment button will be sent to this address."
        />

        {/* Personal Message */}
        <Textarea
          label="Personal Message (Optional)"
          rows={3}
          value={personalMessage}
          onChange={(e) => setPersonalMessage(e.target.value)}
          placeholder="Add an optional message or note for your client..."
        />

        {/* Secure Link Notice */}
        {resolvedPaymentUrl && (
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <p className="font-semibold mb-0.5">Secure Online Payment Link Included:</p>
            <p className="font-mono text-[11px] text-blue-600 truncate">{resolvedPaymentUrl}</p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSending}
            icon={<Send size={14} />}
          >
            Send Invoice Now
          </Button>
        </div>
      </form>
    </Modal>
  )
}
