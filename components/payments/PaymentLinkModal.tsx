'use client'

import React, { useState, useEffect } from 'react'
import {
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Globe,
  User,
  DollarSign,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
} from '@/lib/firebase/firestore'
import type { Client, Project, Invoice, ClientLink } from '@/lib/types'
import {
  formatCurrency,
  copyToClipboard,
  generateSecureToken,
} from '@/lib/utils'
import { PreparePaymentMessageModal } from './PreparePaymentMessageModal'
import toast from 'react-hot-toast'

interface PaymentLinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (link: ClientLink) => void
  initialClientId?: string
  preselectedClientId?: string
  initialProjectId?: string
  preselectedProjectId?: string
  initialInvoiceId?: string
  preselectedInvoiceId?: string
}

export function PaymentLinkModal({
  isOpen,
  onClose,
  onSuccess,
  initialClientId,
  preselectedClientId,
  initialProjectId,
  preselectedProjectId,
  initialInvoiceId,
  preselectedInvoiceId,
}: PaymentLinkModalProps) {
  const effectiveClientId = initialClientId || preselectedClientId || ''
  const effectiveProjectId = initialProjectId || preselectedProjectId || ''
  const effectiveInvoiceId = initialInvoiceId || preselectedInvoiceId || ''

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form selections
  const [selectedClientId, setSelectedClientId] = useState(effectiveClientId)
  const [selectedProjectId, setSelectedProjectId] = useState(effectiveProjectId)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(effectiveInvoiceId)

  // Link Source: User Supplied custom URL vs Studio Generated token link
  const [linkSource, setLinkSource] = useState<'custom' | 'system'>('custom')
  const [customUrl, setCustomUrl] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [currency, setCurrency] = useState<string>('GHS')
  const [notes, setNotes] = useState<string>('')

  // After-creation state
  const [createdLink, setCreatedLink] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)

  // Load clients, projects, invoices
  useEffect(() => {
    if (!isOpen) return
    let active = true

    async function loadData() {
      setLoading(true)
      try {
        const [cls, prjs, invs] = await Promise.all([
          getDocuments<Client>(COLLECTIONS.CLIENTS),
          getDocuments<Project>(COLLECTIONS.PROJECTS),
          getDocuments<Invoice>(COLLECTIONS.INVOICES),
        ])
        if (active) {
          setClients(cls)
          setProjects(prjs)
          setInvoices(invs)
        }
      } catch (err) {
        console.error('Failed to load data for payment link modal:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()
    return () => {
      active = false
    }
  }, [isOpen])

  // Sync initial props
  useEffect(() => {
    if (initialClientId) setSelectedClientId(initialClientId)
    if (initialProjectId) setSelectedProjectId(initialProjectId)
    if (initialInvoiceId) setSelectedInvoiceId(initialInvoiceId)
  }, [initialClientId, initialProjectId, initialInvoiceId, isOpen])

  const currentClient = clients.find((c) => c.id === selectedClientId)
  const currentProject = projects.find((p) => p.id === selectedProjectId)
  const currentInvoice = invoices.find((i) => i.id === selectedInvoiceId)

  // Auto prefill amount when invoice or project is selected
  useEffect(() => {
    if (currentInvoice?.balanceDue) {
      setAmount(currentInvoice.balanceDue.toString())
      setTitle((prev) => prev || `Payment for Invoice #${currentInvoice.invoiceNumber}`)
    } else if (currentProject?.outstandingBalance) {
      setAmount(currentProject.outstandingBalance.toString())
      setTitle((prev) => prev || `Payment for ${currentProject.name}`)
    }
  }, [currentInvoice, currentProject])

  const getEffectiveUrl = (token?: string, url?: string) => {
    if (url) return url
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    return `${origin}/pay/${token || 'sample'}`
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedClientId) {
      toast.error('Please select a client to associate this payment link with')
      return
    }

    if (linkSource === 'custom' && !customUrl.trim()) {
      toast.error('Please enter the payment link URL (e.g. Paystack, Hubtel, or bank checkout link)')
      return
    }

    setSubmitting(true)
    try {
      const token = generateSecureToken('pay_')
      const numAmount = parseFloat(amount) || 0

      const payload = {
        token,
        clientId: selectedClientId,
        clientName: currentClient?.fullName || 'Client',
        projectId: selectedProjectId || undefined,
        projectName: currentProject?.name || undefined,
        invoiceId: selectedInvoiceId || undefined,
        invoiceNumber: currentInvoice?.invoiceNumber || undefined,
        amount: numAmount,
        currency,
        title: title.trim() || `Payment Request for ${currentClient?.fullName || 'Client'}`,
        notes: notes.trim(),
        customUrl: linkSource === 'custom' ? customUrl.trim() : undefined,
        linkType: linkSource,
        status: 'Pending Payment',
        paymentStatus: 'Unpaid',
        viewCount: 0,
        createdBy: 'admin',
      }

      const docId = await addDocument(COLLECTIONS.CLIENT_LINKS, payload)
      const savedLink = { id: docId, ...payload } as any
      setCreatedLink(savedLink)

      const finalUrl = linkSource === 'custom' ? customUrl.trim() : getEffectiveUrl(token)
      copyToClipboard(finalUrl)

      toast.success('Payment link saved & copied to clipboard!')
      if (onSuccess) onSuccess(savedLink)
    } catch (err: any) {
      console.error('Error saving payment link:', err)
      toast.error(err.message || 'Failed to save payment link.')
    } finally {
      setSubmitting(false)
    }
  }

  const activeUrl = createdLink
    ? createdLink.customUrl || getEffectiveUrl(createdLink.token)
    : linkSource === 'custom'
    ? customUrl
    : 'Will generate studio link (/pay/...)'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={createdLink ? 'Payment Link Ready' : 'Save / Associate Payment Link'}
        subtitle="Associate custom user-supplied payment links or studio portal links with clients."
        size="lg"
      >
        {createdLink ? (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
              <h3 className="text-base font-bold text-gray-900">Payment Link Saved Successfully!</h3>
              <p className="text-xs text-gray-600">
                Associated with <strong>{createdLink.clientName}</strong>
                {createdLink.projectName ? ` · ${createdLink.projectName}` : ''}
              </p>
            </div>

            {/* Link Box */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Payment Link URL</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2">
                <code className="text-xs text-gray-800 flex-1 truncate font-mono">{activeUrl}</code>
                <button
                  type="button"
                  onClick={async () => {
                    await copyToClipboard(activeUrl)
                    setCopied(true)
                    toast.success('Copied to clipboard!')
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 flex items-center gap-1 shrink-0"
                >
                  {copied ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => window.open(activeUrl, '_blank')}
                icon={<ExternalLink size={14} />}
              >
                Test Link in Browser
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={() => setShowMessageModal(true)}
                icon={<MessageSquare size={14} />}
                className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
              >
                Prepare Payment Message
              </Button>
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreatedLink(null)
                  onClose()
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Link Source Toggle */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Link Type</label>
              <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
                <button
                  type="button"
                  onClick={() => setLinkSource('custom')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    linkSource === 'custom'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Globe size={13} />
                  User-Supplied Payment Link (Paystack, Hubtel, Bank)
                </button>
                <button
                  type="button"
                  onClick={() => setLinkSource('system')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    linkSource === 'system'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles size={13} />
                  Studio Hosted Portal Link (/pay/...)
                </button>
              </div>
            </div>

            {/* Custom URL Input if user supplied */}
            {linkSource === 'custom' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  Supplied Payment URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    required
                    placeholder="https://paystack.com/pay/your-custom-link or https://..."
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 bg-white text-xs font-mono text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                  />
                </div>
                <p className="text-[11px] text-gray-500">
                  Paste any payment page URL from your payment processor or bank portal.
                </p>
              </div>
            )}

            {/* Client selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">
                Associated Client <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value)
                  setSelectedProjectId('')
                  setSelectedInvoiceId('')
                }}
                required
                className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
              >
                <option value="">-- Select Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.company ? `(${c.company})` : ''} — Bal: {formatCurrency(c.outstandingBalance || 0)}
                  </option>
                ))}
              </select>
            </div>

            {/* Project & Invoice links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-gray-600">
                  Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
                >
                  <option value="">-- None / General --</option>
                  {projects
                    .filter((p) => !selectedClientId || p.clientId === selectedClientId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-gray-600">
                  Invoice / Request (Optional)
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
                >
                  <option value="">-- None --</option>
                  {invoices
                    .filter((i) => !selectedClientId || i.clientId === selectedClientId)
                    .map((i) => (
                      <option key={i.id} value={i.id}>#{i.invoiceNumber} — Bal: {formatCurrency(i.balanceDue || 0)}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Title & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] font-semibold text-gray-600">Link Title / Label</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 50% Project Deposit or Final Balance"
                  className="w-full h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-gray-600">Requested Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-gray-600">Instructions / Notes (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Pay via Card or MTN MoMo; reference client name on checkout."
                className="w-full p-2 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                loading={submitting}
                icon={<Link2 size={14} />}
              >
                Save Payment Link
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Embedded message preparer if opened */}
      {createdLink && (
        <PreparePaymentMessageModal
          isOpen={showMessageModal}
          onClose={() => setShowMessageModal(false)}
          client={currentClient}
          project={currentProject}
          invoice={currentInvoice}
          paymentLinkUrl={activeUrl}
          amount={createdLink.amount}
          currency={createdLink.currency}
          isDeposit={title.toLowerCase().includes('deposit')}
        />
      )}
    </>
  )
}
