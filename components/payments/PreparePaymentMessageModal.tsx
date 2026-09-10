'use client'

import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  Copy,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Send,
  Phone,
  User,
  DollarSign,
  Link2,
  ShieldCheck,
  Mail,
  Loader2,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { Client, Project, Invoice } from '@/lib/types'
import { formatCurrency, copyToClipboard, generateWhatsAppLink, formatWhatsAppPhone, getProductionUrl } from '@/lib/utils'
import toast from 'react-hot-toast'

interface PreparePaymentMessageModalProps {
  isOpen: boolean
  onClose: () => void
  client?: Client | null
  project?: Project | null
  invoice?: Invoice | null
  paymentLinkUrl?: string
  paymentUrl?: string
  invoiceNumber?: string
  linkTitle?: string
  amount?: number
  currency?: string
  isDeposit?: boolean
}

type MessageTemplate = 'whatsapp_standard' | 'deposit_request' | 'delivery_release' | 'bank_momo'

export function PreparePaymentMessageModal({
  isOpen,
  onClose,
  client,
  project,
  invoice,
  paymentLinkUrl = '',
  paymentUrl,
  invoiceNumber,
  linkTitle,
  amount,
  currency = 'GHS',
  isDeposit = false,
}: PreparePaymentMessageModalProps) {
  // Authoritative production payment link — never contains localhost
  const effectiveUrl = getProductionUrl(paymentUrl || paymentLinkUrl || '')

  const [template, setTemplate] = useState<MessageTemplate>(
    isDeposit ? 'deposit_request' : 'whatsapp_standard'
  )
  const [recipientPhone, setRecipientPhone] = useState<string>('')
  const [recipientEmail, setRecipientEmail] = useState<string>('')
  const [customMessage, setCustomMessage] = useState<string>('')
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  const phoneValidation = formatWhatsAppPhone(recipientPhone)

  // Initialize recipient phone and email from client or invoice
  useEffect(() => {
    if (client?.whatsappNumber) {
      setRecipientPhone(client.whatsappNumber)
    } else if (client?.phone) {
      setRecipientPhone(client.phone)
    }

    const emailCandidate = client?.email || (invoice as any)?.clientEmail || ''
    if (emailCandidate) {
      setRecipientEmail(emailCandidate)
    }
  }, [client, invoice])

  const dueAmount = amount ?? invoice?.balanceDue ?? project?.outstandingBalance ?? 0

  // Generate message based on template
  useEffect(() => {
    const clientName = client?.fullName || 'Valued Client'
    const projName = project?.name || linkTitle || 'your project'
    const invNum = invoice?.invoiceNumber ? ` #${invoice.invoiceNumber}` : invoiceNumber ? ` #${invoiceNumber}` : ''
    const formattedAmount = `${currency} ${dueAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const linkStr = effectiveUrl || '[Payment Link]'

    let text = ''
    switch (template) {
      case 'deposit_request':
        text = `Hello ${clientName}! 👋\n\nThank you for partnering with LexMedia on *${projName}*.\n\nTo officially schedule your project and begin creative production, please complete the initial deposit of *${formattedAmount}*.\n\n👉 Secure Payment Link:\n${linkStr}\n\nWe are excited to bring your vision to life! Let us know once completed. 🙏`
        break

      case 'delivery_release':
        text = `Hello ${clientName}! 👋\n\nGreat news! The final deliverables for *${projName}* have been completed and are ready for release on our studio portal.\n\nTo unlock and download your high-resolution project files, kindly complete the remaining balance of *${formattedAmount}*${invNum ? ` for Invoice${invNum}` : ''}.\n\n👉 Payment & Delivery Access:\n${linkStr}\n\nYour delivery link will unlock instantly once verified. Thank you!`
        break

      case 'bank_momo':
        text = `Hello ${clientName}! 👋\n\nHere are the payment details for *${projName}*${invNum ? ` (Invoice${invNum})` : ''}.\n\n💰 *Amount Due:* ${formattedAmount}\n\n💳 *Online Payment Link:*\n${linkStr}\n\n📲 *Direct Mobile Money:* \n• MTN MoMo Merchant: 829104 (LexMedia Studio)\n• Reference: ${invoice?.invoiceNumber || invoiceNumber || clientName}\n\n🏦 *Bank Transfer:* \n• Bank: Stanbic Bank Ghana\n• Account Name: LexMedia Creative Ltd\n• Account Number: 9040008892101\n• Branch: Airport City, Accra\n\nKindly send receipt or confirmation once payment is made. Thank you! 🙏`
        break

      case 'whatsapp_standard':
      default:
        text = `Hello ${clientName}! 👋\n\nYour payment request${invNum ? ` for Invoice${invNum}` : ''} (*${projName}*) is ready.\n\n💰 *Amount:* ${formattedAmount}\n\nYou can view your invoice and complete payment securely using the link below:\n${linkStr}\n\nThank you for your business! If you have any questions, feel free to reply directly here.`
        break
    }

    setCustomMessage(text)
  }, [template, client, project, invoice, effectiveUrl, invoiceNumber, linkTitle, dueAmount, currency, isOpen])

  const handleCopyMessage = async () => {
    if (!customMessage.trim()) {
      toast.error('Message is empty')
      return
    }
    await copyToClipboard(customMessage)
    setCopiedMessage(true)
    toast.success('Message copied to clipboard!')
    setTimeout(() => setCopiedMessage(false), 2500)
  }

  const handleCopyLinkOnly = async () => {
    if (!effectiveUrl) {
      toast.error('No payment link available.')
      return
    }
    await copyToClipboard(effectiveUrl)
    setCopiedLink(true)
    toast.success('Payment link copied!')
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const handleOpenWhatsApp = () => {
    if (!customMessage.trim()) {
      toast.error('Payment message is empty. Please enter message text.')
      return
    }

    const phoneToUse = recipientPhone.trim()
    const url = generateWhatsAppLink(phoneToUse, customMessage)

    if (phoneToUse && !phoneValidation.isValid) {
      toast(
        `Note: "${phoneToUse}" might be an invalid number format. Opening WhatsApp...`,
        { icon: '⚠️' }
      )
    } else if (phoneToUse && phoneValidation.isValid) {
      toast.success(`Opening WhatsApp chat with ${phoneValidation.displayFormatted}...`)
    } else {
      toast('Opening WhatsApp with contact picker...', { icon: '💬' })
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSendEmailViaBrevo = async () => {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      toast.error('Please enter a valid client email address')
      return
    }
    if (!effectiveUrl) {
      toast.error('Payment URL is missing')
      return
    }

    try {
      setIsSendingEmail(true)
      const res = await fetch('/api/payments/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: recipientEmail.trim(),
          clientName: client?.fullName || (invoice as any)?.clientName || 'Valued Client',
          paymentUrl: effectiveUrl,
          amount: dueAmount,
          currency: currency,
          currencySymbol: currency === 'GHS' ? 'GH₵' : currency,
          projectName: project?.name || linkTitle,
          invoiceNumber: invoice?.invoiceNumber || invoiceNumber,
          personalMessage: customMessage,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Payment email successfully sent via Brevo to ${recipientEmail}!`)
      } else {
        toast.error(data.error || 'Failed to dispatch email via Brevo')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error communicating with Brevo service')
    } finally {
      setIsSendingEmail(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prepare Payment Message"
      subtitle="Craft and customize ready-to-send payment messages for WhatsApp, SMS, or Email."
      size="lg"
    >
      <div className="space-y-4">
        {/* Template Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">Message Template / Purpose</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'whatsapp_standard', label: 'Standard Request' },
              { id: 'deposit_request', label: 'Initial Deposit' },
              { id: 'delivery_release', label: 'Delivery Release' },
              { id: 'bank_momo', label: 'Bank & MoMo' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id as MessageTemplate)}
                className={`py-2 px-2.5 text-xs font-semibold rounded-lg border transition-all text-center truncate ${
                  template === t.id
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recipient Phone & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-gray-600">
              Recipient Phone / WhatsApp
            </label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+233XXXXXXXXX or 024XXXXXXX"
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
              />
            </div>
            {recipientPhone ? (
              <div className="text-[11px] flex items-center gap-1.5 pt-0.5">
                {phoneValidation.isValid ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ Valid: {phoneValidation.displayFormatted}
                  </span>
                ) : (
                  <span className="text-amber-700">
                    ⚠️ {phoneValidation.error || 'Check number format'}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 pt-0.5">
                No phone provided (will open WhatsApp contact picker).
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-gray-600">
              Recipient Email (for Brevo)
            </label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
              />
            </div>
            <p className="text-[11px] text-gray-500 pt-0.5">
              Email will be delivered with verified branding via Brevo.
            </p>
          </div>
        </div>

        {/* Payment Link Pill */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-semibold text-gray-600">Authoritative Payment Link</label>
            {effectiveUrl && (
              <button
                type="button"
                onClick={handleCopyLinkOnly}
                className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-medium"
              >
                {copiedLink ? 'Copied!' : 'Copy Link Only'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 h-8 px-2.5 bg-emerald-50/60 rounded-lg border border-emerald-200 text-xs">
            <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
            <span className="truncate font-mono text-emerald-900 text-[11px] font-medium">
              {effectiveUrl || 'No link associated yet'}
            </span>
          </div>
        </div>

        {/* Message Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-gray-700">Message Content (Editable)</label>
            <span className="text-[11px] text-gray-400">{customMessage.length} characters</span>
          </div>
          <textarea
            rows={6}
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-xs font-sans leading-relaxed focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors resize-none text-gray-800"
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyMessage}
                icon={copiedMessage ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              >
                {copiedMessage ? 'Copied!' : 'Copy Text'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSendEmailViaBrevo}
                disabled={isSendingEmail || !recipientEmail}
                icon={isSendingEmail ? <Loader2 size={14} className="animate-spin text-blue-600" /> : <Mail size={14} className="text-blue-600" />}
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {isSendingEmail ? 'Sending via Brevo...' : 'Send Email (Brevo)'}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenWhatsApp}
                icon={<MessageSquare size={14} />}
                className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
              >
                Open in WhatsApp
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 italic text-center sm:text-right">
            * Direct links sent via Brevo or WhatsApp route clients to the official payment portal powered by Paystack.
          </p>
        </div>
      </div>
    </Modal>
  )
}
