'use client'

import React, { useState, useEffect } from 'react'
import {
  CreditCard,
  DollarSign,
  Calendar,
  FileText,
  User,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Hash,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  getDocument,
} from '@/lib/firebase/firestore'
import type { Client, Project, Invoice } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface RecordPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (payment: any) => void
  initialClientId?: string
  preselectedClientId?: string
  initialProjectId?: string
  preselectedProjectId?: string
  initialInvoiceId?: string
  preselectedInvoiceId?: string
  defaultType?: 'deposit' | 'payment'
}

const PAYMENT_METHODS = [
  'Mobile Money (MTN MoMo)',
  'Mobile Money (Telecel Cash)',
  'Mobile Money (AT Money)',
  'Bank Transfer',
  'Cash',
  'Card / POS',
  'Cheque',
  'Direct Online',
  'Other',
]

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  initialClientId,
  preselectedClientId,
  initialProjectId,
  preselectedProjectId,
  initialInvoiceId,
  preselectedInvoiceId,
  defaultType = 'payment',
}: RecordPaymentModalProps) {
  const effectiveClientId = initialClientId || preselectedClientId || ''
  const effectiveProjectId = initialProjectId || preselectedProjectId || ''
  const effectiveInvoiceId = initialInvoiceId || preselectedInvoiceId || ''

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingInitial, setLoadingInitial] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Selected entities
  const [selectedClientId, setSelectedClientId] = useState(effectiveClientId)
  const [selectedProjectId, setSelectedProjectId] = useState(effectiveProjectId)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(effectiveInvoiceId)

  // Form fields
  const [paymentType, setPaymentType] = useState<'deposit' | 'payment'>(defaultType)
  const [amount, setAmount] = useState<string>('')
  const [currency, setCurrency] = useState<string>('GHS')
  const [channel, setChannel] = useState<string>('Mobile Money (MTN MoMo)')
  const [reference, setReference] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState<'success' | 'pending'>('success')
  const [notes, setNotes] = useState<string>('')

  // Load clients
  useEffect(() => {
    if (!isOpen) return
    let active = true

    async function loadData() {
      setLoadingInitial(true)
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
        console.error('Failed to load clients/projects for payment recording:', err)
      } finally {
        if (active) setLoadingInitial(false)
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
    if (defaultType) setPaymentType(defaultType)
  }, [initialClientId, initialProjectId, initialInvoiceId, defaultType, isOpen])

  // Auto-generate a clean reference code when opening or switching type
  useEffect(() => {
    if (isOpen) {
      const prefix = paymentType === 'deposit' ? 'DEP' : 'PAY'
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
      const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '')
      setReference((prev) => {
        if (!prev || prev.startsWith('DEP-') || prev.startsWith('PAY-')) {
          return `${prefix}-${datePart}-${randomSuffix}`
        }
        return prev
      })
    }
  }, [paymentType, isOpen])

  // Get selected client object
  const currentClient = clients.find((c) => c.id === selectedClientId)

  // Filter projects and invoices for selected client
  const clientProjects = selectedClientId
    ? projects.filter((p) => p.clientId === selectedClientId)
    : projects

  const clientInvoices = selectedClientId
    ? invoices.filter((i) => i.clientId === selectedClientId)
    : invoices

  const currentProject = projects.find((p) => p.id === selectedProjectId)
  const currentInvoice = invoices.find((i) => i.id === selectedInvoiceId)

  // Outstanding balance calculation
  const outstandingBalance = currentInvoice?.balanceDue ?? currentProject?.outstandingBalance ?? currentClient?.outstandingBalance ?? 0

  // Quick amount buttons helper
  const handleQuickAmount = (fraction: number) => {
    if (outstandingBalance > 0) {
      const calc = Math.round(outstandingBalance * fraction)
      setAmount(calc.toString())
    } else if (currentProject?.price) {
      const calc = Math.round(currentProject.price * fraction)
      setAmount(calc.toString())
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedClientId) {
      toast.error('Please select a client')
      return
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/payments/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          clientName: currentClient?.fullName || 'Client',
          projectId: selectedProjectId || undefined,
          projectName: currentProject?.name || undefined,
          invoiceId: selectedInvoiceId || undefined,
          invoiceNumber: currentInvoice?.invoiceNumber || undefined,
          amount: numAmount,
          currency,
          paymentType,
          isDeposit: paymentType === 'deposit',
          channel,
          reference: reference.trim(),
          paidAt,
          status,
          notes: notes.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to record payment')

      toast.success(
        paymentType === 'deposit'
          ? `Deposit of ${currency} ${numAmount.toLocaleString()} recorded!`
          : `Payment of ${currency} ${numAmount.toLocaleString()} recorded!`
      )

      if (onSuccess) onSuccess(data.payment)
      onClose()
    } catch (err: any) {
      console.error('Error recording payment:', err)
      toast.error(err.message || 'Failed to record payment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={paymentType === 'deposit' ? 'Record Client Deposit' : 'Record Client Payment'}
      subtitle="Record offline, mobile money, cash, or bank payments directly to client accounts."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Payment Type Selector */}
        <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
          <button
            type="button"
            onClick={() => setPaymentType('deposit')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              paymentType === 'deposit'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ShieldCheck size={14} />
            Client Deposit (Initial Commitment)
          </button>
          <button
            type="button"
            onClick={() => setPaymentType('payment')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              paymentType === 'payment'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CreditCard size={14} />
            Regular / Balance Payment
          </button>
        </div>

        {/* Client Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">
            Client <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value)
              setSelectedProjectId('')
              setSelectedInvoiceId('')
            }}
            required
            className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
          >
            <option value="">-- Select Client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} {c.company ? `(${c.company})` : ''} — Bal: {formatCurrency(c.outstandingBalance || 0)}
              </option>
            ))}
          </select>
        </div>

        {/* Client Financial Snapshot Pill */}
        {currentClient && (
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <User size={15} className="text-indigo-600" />
              <span className="font-semibold text-gray-900">{currentClient.fullName}</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-gray-500">Total Paid: </span>
                <span className="font-bold text-emerald-600">{formatCurrency(currentClient.totalPaid || 0)}</span>
              </div>
              <div className="border-l border-indigo-200 pl-4">
                <span className="text-gray-500">Outstanding: </span>
                <span className={`font-bold ${currentClient.outstandingBalance ? 'text-rose-600' : 'text-gray-700'}`}>
                  {formatCurrency(currentClient.outstandingBalance || 0)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Optional Project & Invoice link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Link to Project (Optional)
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="">-- No specific project (General) --</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Val: {formatCurrency(p.price)} · Bal: {formatCurrency(p.outstandingBalance || 0)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Link to Invoice (Optional)
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => {
                const invId = e.target.value
                setSelectedInvoiceId(invId)
                const found = invoices.find((i) => i.id === invId)
                if (found?.balanceDue) {
                  setAmount(found.balanceDue.toString())
                }
              }}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="">-- No specific invoice --</option>
              {clientInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  Invoice #{inv.invoiceNumber} — Bal: {formatCurrency(inv.balanceDue || 0)} ({inv.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Amount & Currency */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-gray-700">
              {paymentType === 'deposit' ? 'Deposit Amount' : 'Payment Amount'} <span className="text-rose-500">*</span>
            </label>
            {outstandingBalance > 0 && (
              <span className="text-[11px] text-gray-500">
                Outstanding: <strong className="text-rose-600">{formatCurrency(outstandingBalance)}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-24 h-10 px-2 rounded-lg border border-gray-300 bg-gray-50 text-sm font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
            >
              <option value="GHS">GHS (GH₵)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
            </select>
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                {currency === 'GHS' ? 'GH₵' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full h-10 pl-14 pr-3 rounded-lg border border-gray-300 bg-white text-base font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Quick preset buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-gray-400">Quick fill:</span>
            {outstandingBalance > 0 && (
              <button
                type="button"
                onClick={() => handleQuickAmount(1.0)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
              >
                Full Balance ({formatCurrency(outstandingBalance)})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleQuickAmount(0.5)}
              className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            >
              50% Deposit
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(0.3)}
              className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            >
              30% Milestone
            </button>
          </div>
        </div>

        {/* Payment Method & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Payment Method / Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Payment Date</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Reference & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Reference / Transaction ID
            </label>
            <div className="relative">
              <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. MTN-9982348 or Bank Ref"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-300 bg-white text-xs font-mono text-gray-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Payment Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="success">Successful / Confirmed</option>
              <option value="pending">Pending Clearance / Verification</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">Notes / Memo (Optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Paid via client's MTN MoMo number, received confirmation SMS."
            className="w-full p-2.5 rounded-lg border border-gray-300 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-gray-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={submitting}
            icon={<CheckCircle2 size={15} />}
          >
            {paymentType === 'deposit' ? 'Record Deposit' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
