'use client'

import React, { useState, useEffect } from 'react'
import {
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Calendar,
  MessageSquare,
  X,
  CreditCard,
  FileText,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  COLLECTIONS,
  addDocument,
} from '@/lib/firebase/firestore'
import type { Project, Client, ClientLink } from '@/lib/types'
import {
  formatCurrency,
  copyToClipboard,
  generateSecureToken,
  getPaymentLink,
} from '@/lib/utils'
import toast from 'react-hot-toast'

interface ProjectPaymentLinkModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  client?: Client | null
  onSuccess?: (link: ClientLink) => void
}

export function ProjectPaymentLinkModal({
  isOpen,
  onClose,
  project,
  client,
  onSuccess,
}: ProjectPaymentLinkModalProps) {
  // Outstanding balance calculation
  const originalPrice = Number(project.price || 0)
  const amountPaid = Number(project.amountPaid || 0)
  const outstandingBalance = project.outstandingBalance !== undefined
    ? Number(project.outstandingBalance)
    : Math.max(0, originalPrice - amountPaid)

  // Presets and Amount
  const [presetOption, setPresetOption] = useState<'full' | 'half' | 'custom'>('full')
  const [amount, setAmount] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [expiryDate, setExpiryDate] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Success view state
  const [createdLink, setCreatedLink] = useState<ClientLink | null>(null)
  const [copied, setCopied] = useState(false)

  // Initial populate / sync
  useEffect(() => {
    if (!isOpen) {
      setCreatedLink(null)
      setCopied(false)
      return
    }

    if (outstandingBalance > 0) {
      setPresetOption('full')
      setAmount(outstandingBalance.toFixed(2))
    } else {
      setAmount('0.00')
    }
    setDescription(`Payment for ${project.name}`)
    setExpiryDate('')
  }, [isOpen, outstandingBalance, project.name])

  // Live parsed amounts
  const parsedAmount = Math.round((parseFloat(amount) || 0) * 100) / 100
  const remainingBalanceAfterPayment = Math.max(0, Math.round((outstandingBalance - parsedAmount) * 100) / 100)

  const isAmountOverBalance = parsedAmount > outstandingBalance
  const isAmountZeroOrNegative = parsedAmount <= 0
  const isInvalidNumber = isNaN(parsedAmount)
  const isProjectFullyPaid = outstandingBalance <= 0
  const isValid = !isProjectFullyPaid && !isAmountOverBalance && !isAmountZeroOrNegative && !isInvalidNumber

  const handleSelectPreset = (preset: 'full' | 'half' | 'custom') => {
    setPresetOption(preset)
    if (preset === 'full') {
      setAmount(outstandingBalance > 0 ? outstandingBalance.toFixed(2) : '0.00')
    } else if (preset === 'half') {
      const half = Math.round((outstandingBalance * 0.5) * 100) / 100
      setAmount(half > 0 ? half.toFixed(2) : '0.00')
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPresetOption('custom')
    setAmount(e.target.value)
  }

  const handleCreatePaymentLink = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValid) {
      if (isProjectFullyPaid) {
        toast.error('This project is already fully paid')
      } else if (isAmountZeroOrNegative) {
        toast.error('Amount must be greater than zero')
      } else if (isAmountOverBalance) {
        toast.error(`Amount cannot exceed the outstanding balance of ${formatCurrency(outstandingBalance, project.currency || 'GHS')}`)
      }
      return
    }

    setIsSubmitting(true)
    try {
      const token = generateSecureToken('prj_')
      const now = new Date().toISOString()

      const newLinkPayload = {
        token,
        projectId: project.id,
        projectName: project.name,
        clientId: project.clientId,
        clientName: project.clientName || client?.fullName || 'Client',
        invoiceId: project.invoiceId || undefined,
        invoiceNumber: project.invoiceNumber || undefined,
        amount: parsedAmount,
        currency: project.currency || 'GHS',
        title: description.trim() || `Payment Request for ${project.name}`,
        notes: description.trim(),
        expiresAt: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        status: 'Pending Payment',
        paymentStatus: 'Unpaid',
        linkType: 'system',
        viewCount: 0,
        createdAt: now,
        createdBy: 'admin',
      }

      const docId = await addDocument(COLLECTIONS.CLIENT_LINKS, newLinkPayload)
      const savedLink = { id: docId, ...newLinkPayload } as unknown as ClientLink

      setCreatedLink(savedLink)
      toast.success(`Payment link generated for ${formatCurrency(parsedAmount, project.currency || 'GHS')}!`)
      if (onSuccess) onSuccess(savedLink)
    } catch (err: any) {
      console.error('Failed to create project payment link:', err)
      toast.error(err?.message || 'Failed to generate payment link.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!createdLink) return
    const url = getPaymentLink(createdLink.token)
    await copyToClipboard(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Payment link copied to clipboard!')
  }

  const handleShareWhatsApp = () => {
    if (!createdLink) return
    const url = getPaymentLink(createdLink.token)
    const clientName = project.clientName || client?.fullName || 'Valued Client'
    const msg = `Hello ${clientName}! 👋\n\nPlease find your secure payment link for ${project.name} (${formatCurrency(createdLink.amount || parsedAmount, project.currency || 'GHS')}):\n${url}\n\nThank you for choosing LEXMEDIA.GH!`
    const phone = client?.whatsappNumber || client?.phone
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '')
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank')
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={createdLink ? 'Payment Link Ready' : 'Create Project Payment Link'}
      size="md"
    >
      {createdLink ? (
        // ── Success State ──────────────────────────────────────────────
        <div className="space-y-5 animate-fade-in text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-1.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={22} />
            </div>
            <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">Payment Link Created</h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              The payment request for <strong className="font-mono">{formatCurrency(createdLink.amount || parsedAmount, createdLink.currency || project.currency || 'GHS')}</strong> is live and ready to send to the client.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Public Payment URL
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={getPaymentLink(createdLink.token)}
                readOnly
                className="font-mono text-xs bg-gray-50 dark:bg-gray-800"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0 h-9 px-3 text-xs"
                icon={copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700/60 space-y-2 text-xs">
            <div className="flex justify-between text-gray-500">
              <span>Project:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{project.name}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Client:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{project.clientName || client?.fullName}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Collection Amount:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(createdLink.amount || parsedAmount, createdLink.currency || project.currency || 'GHS')}
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Remaining Balance After Payment:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatCurrency(remainingBalanceAfterPayment, project.currency || 'GHS')}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(getPaymentLink(createdLink.token), '_blank')}
              className="w-full sm:flex-1 text-xs"
              icon={<ExternalLink size={14} />}
            >
              Open Payment Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareWhatsApp}
              className="w-full sm:flex-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              icon={<MessageSquare size={14} />}
            >
              Share via WhatsApp
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="w-full sm:w-auto text-xs px-5"
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        // ── Link Creation Form ──────────────────────────────────────────
        <form onSubmit={handleCreatePaymentLink} className="space-y-4 text-xs sm:text-sm">
          {/* Project & Client Context Header */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200/70 dark:border-gray-700/60 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">{project.name}</h4>
                {project.invoiceNumber && (
                  <span className="font-mono text-[10px] text-gray-500 bg-white dark:bg-gray-900 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                    {project.invoiceNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Client: <strong className="text-gray-800 dark:text-gray-200">{project.clientName || client?.fullName || 'Client'}</strong>
              </p>
            </div>
            <Badge variant={isProjectFullyPaid ? 'success' : amountPaid > 0 ? 'warning' : 'danger'}>
              {project.paymentStatus || (isProjectFullyPaid ? 'Paid' : 'Unpaid')}
            </Badge>
          </div>

          {/* Financial Summary Grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block">Original Price</span>
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                {formatCurrency(originalPrice, project.currency || 'GHS')}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block">Amount Paid</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                {formatCurrency(amountPaid, project.currency || 'GHS')}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <span className="text-[10px] uppercase font-semibold text-gray-400 block">Outstanding</span>
              <span className={`font-mono font-bold text-xs sm:text-sm ${isProjectFullyPaid ? 'text-gray-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(outstandingBalance, project.currency || 'GHS')}
              </span>
            </div>
          </div>

          {/* Amount Selection Presets (Specification Section 3) */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Select Amount Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset('full')}
                disabled={isProjectFullyPaid}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all text-center ${
                  presetOption === 'full'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                Full Balance
                <span className="block text-[10px] font-mono font-normal mt-0.5 opacity-80">
                  {formatCurrency(outstandingBalance, project.currency || 'GHS')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('half')}
                disabled={isProjectFullyPaid}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all text-center ${
                  presetOption === 'half'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                50% of Balance
                <span className="block text-[10px] font-mono font-normal mt-0.5 opacity-80">
                  {formatCurrency(Math.round(outstandingBalance * 0.5 * 100) / 100, project.currency || 'GHS')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('custom')}
                disabled={isProjectFullyPaid}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all text-center ${
                  presetOption === 'custom'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                Custom Amount
                <span className="block text-[10px] font-mono font-normal mt-0.5 opacity-80">
                  Manual Entry
                </span>
              </button>
            </div>
          </div>

          {/* Amount to Collect (GH₵) — Editable Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-900 dark:text-gray-100">
                Amount to Collect (GH₵)
              </label>
              <span className="text-[11px] text-gray-400">
                Max: {formatCurrency(outstandingBalance, project.currency || 'GHS')}
              </span>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={outstandingBalance}
                value={amount}
                onChange={handleAmountChange}
                disabled={isProjectFullyPaid}
                placeholder="Enter amount to collect..."
                className={`text-sm font-mono font-bold pr-16 ${
                  isAmountOverBalance ? 'border-rose-500 text-rose-600 focus:border-rose-500' : ''
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none">
                {project.currency || 'GHS'}
              </div>
            </div>

            {/* Validation messages */}
            {isAmountOverBalance && (
              <p className="text-[11px] text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Amount cannot exceed outstanding balance of {formatCurrency(outstandingBalance, project.currency || 'GHS')}
              </p>
            )}
            {isAmountZeroOrNegative && amount !== '' && (
              <p className="text-[11px] text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Amount to collect must be greater than zero
              </p>
            )}
            {isProjectFullyPaid && (
              <p className="text-[11px] text-gray-500 font-medium mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                This project has no outstanding balance.
              </p>
            )}
          </div>

          {/* Live Remaining Balance Calculation */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/70 rounded-xl border border-gray-200/70 dark:border-gray-700 flex items-center justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              Remaining balance after this payment:
            </span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
              {formatCurrency(remainingBalanceAfterPayment, project.currency || 'GHS')}
            </span>
          </div>

          {/* Payment Description or Note (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Payment Description or Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Initial Deposit, 50% Milestone, Final Balance"
              className="text-xs"
            />
          </div>

          {/* Expiry Date (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Payment Link Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              type="date"
              value={expiryDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!isValid || isSubmitting}
              icon={<Link2 size={14} />}
            >
              Generate Payment Link ({formatCurrency(parsedAmount, project.currency || 'GHS')})
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
