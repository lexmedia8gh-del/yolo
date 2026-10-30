'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import {
  updateDocument,
  addDocument,
  getDocuments,
  syncRecordedPaymentToLocalCache,
  COLLECTIONS,
} from '@/lib/firebase/firestore'
import { getAdminAuthHeaders } from '@/lib/firebase/auth'
import type { Client, Invoice, InvoiceStatus } from '@/lib/types'
import { DollarSign, CreditCard, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface RecordPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  invoice: Invoice | null
  onSuccess?: () => void
}

const PAYMENT_METHODS = [
  'Mobile Money (MTN / Telecel / AT)',
  'Paystack Online',
  'Bank Transfer',
  'Cash',
  'Cheque',
  'Credit / Debit Card',
  'Other',
]

function buildInvoicePaymentRef(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `PAY-${datePart}-${randomSuffix}`
}

function buildIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: RecordPaymentModalProps) {
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0])
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [reference, setReference] = useState<string>('')
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => buildIdempotencyKey())
  const [notes, setNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      submittingRef.current = false
      return
    }
    if (invoice) {
      const remainingBalance =
        invoice.balanceDue !== undefined && invoice.balanceDue !== null
          ? Number(invoice.balanceDue)
          : Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amountPaid) || 0))
      setPaymentAmount(remainingBalance > 0 ? remainingBalance : 0)
      setReference(buildInvoicePaymentRef())
      setIdempotencyKey(buildIdempotencyKey())
      setPaymentDate(new Date().toISOString().split('T')[0])
      setNotes('')
    }
  }, [invoice, isOpen])

  useEffect(() => {
    if (!isOpen) return
    setIdempotencyKey(buildIdempotencyKey())
  }, [isOpen, paymentAmount, invoice?.id])

  if (!invoice) return null

  const currency = invoice.currency || 'GHS'
  const symbol = invoice.currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'GH₵')
  const total = Number(invoice.total) || 0
  const currentPaid = Number(invoice.amountPaid) || 0
  const currentBalance =
    invoice.balanceDue !== undefined && invoice.balanceDue !== null
      ? Number(invoice.balanceDue)
      : Math.max(0, total - currentPaid)

  const newTotalPaid = currentPaid + Number(paymentAmount || 0)
  const newBalance = Math.max(0, total - newTotalPaid)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittingRef.current || isSubmitting) return

    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('Payment amount must be greater than 0.')
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    const toastId = toast.loading('Recording payment...')

    try {
      const nextStatus: InvoiceStatus = newBalance <= 0 ? 'Paid' : 'Partially Paid'
      const cleanRef = reference.trim() || buildInvoicePaymentRef()

      // Determine whether this invoice is associated with an existing client
      const explicitClientId = (invoice.clientId || (invoice as any).clientInfo?.id || '').trim()
      let resolvedClientId = explicitClientId

      if (!resolvedClientId) {
        try {
          const allClients = await getDocuments<Client>(COLLECTIONS.CLIENTS)
          const invEmail = (invoice.clientEmail || (invoice as any).clientInfo?.email || '')
            .trim()
            .toLowerCase()
          const invName = (invoice.clientName || (invoice as any).clientInfo?.name || '')
            .trim()
            .toLowerCase()

          if (invEmail) {
            const emailMatches = allClients.filter(
              (c) => c.email && c.email.trim().toLowerCase() === invEmail
            )
            if (emailMatches.length === 1) {
              resolvedClientId = emailMatches[0].id
            }
          }
          if (!resolvedClientId && invName) {
            const nameMatches = allClients.filter(
              (c) => c.fullName && c.fullName.trim().toLowerCase() === invName
            )
            if (nameMatches.length === 1) {
              resolvedClientId = nameMatches[0].id
            }
          }
        } catch {
          // Ignore client list lookup error; server will validate if explicitClientId exists
        }
      }

      if (resolvedClientId) {
        // Client-linked invoice: use canonical server payment endpoint so client, project,
        // invoice, payment history, and payment links all update atomically.
        const authHeaders = await getAdminAuthHeaders(true)
        const res = await fetch('/api/payments/record', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            clientId: resolvedClientId,
            clientName: invoice.clientName,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            projectId: (invoice as any).projectId || undefined,
            amount: Number(paymentAmount),
            currency,
            paymentType: 'payment',
            isDeposit: false,
            channel: paymentMethod,
            reference: cleanRef,
            idempotencyKey,
            paidAt: paymentDate,
            status: 'success',
            notes: notes.trim(),
          }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || 'Failed to record payment')
        }

        syncRecordedPaymentToLocalCache(data)
      } else {
        // Standalone custom/walk-in invoice without a client account
        const paidAtIso = paymentDate
          ? new Date(paymentDate).toISOString()
          : new Date().toISOString()

        await updateDocument(COLLECTIONS.INVOICES, invoice.id, {
          amountPaid: newTotalPaid,
          balanceDue: newBalance,
          status: nextStatus,
          paymentMethod,
          paymentReference: cleanRef,
          paymentDate,
          paymentNotes: notes.trim(),
          paidAt: nextStatus === 'Paid' ? new Date().toISOString() : invoice.paidAt,
          updatedAt: new Date().toISOString(),
        })

        await addDocument(COLLECTIONS.PAYMENTS, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: '',
          clientName: invoice.clientName || 'Walk-in Client',
          projectId: (invoice as any).projectId || '',
          projectName: '',
          paystackReference: cleanRef,
          reference: cleanRef,
          amount: Number(paymentAmount),
          currency,
          paymentType: 'payment',
          isDeposit: false,
          paymentMethod,
          channel: paymentMethod,
          paidAt: paidAtIso,
          status: 'success',
          source: 'manual',
          notes: notes.trim(),
        })
      }

      toast.success(
        nextStatus === 'Paid'
          ? 'Invoice marked as fully PAID!'
          : `Payment recorded! Remaining balance: ${formatCurrency(newBalance, currency, symbol)}`,
        { id: toastId }
      )

      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Failed to record payment:', err)
      toast.error(err.message || 'Failed to record payment', { id: toastId })
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment for Invoice"
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Invoice Summary Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Invoice:</span>
            <span className="font-mono font-bold text-gray-900">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Total Invoice Amount:</span>
            <span className="font-semibold text-gray-900">
              {formatCurrency(total, currency, symbol)}
            </span>
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span className="font-semibold text-gray-500">Previously Paid:</span>
            <span className="font-medium text-emerald-600">
              {formatCurrency(currentPaid, currency, symbol)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-200">
            <span className="font-bold text-gray-700">Current Balance Due:</span>
            <span className="font-mono font-extrabold text-blue-700 text-sm">
              {formatCurrency(currentBalance, currency, symbol)}
            </span>
          </div>
        </div>

        {/* Amount to Record */}
        <Input
          label={`Amount Received (${symbol}) *`}
          type="number"
          step="0.01"
          min="0.01"
          required
          value={paymentAmount || ''}
          onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
        />

        {/* Payment Method */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">Payment Method *</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        {/* Date & Reference */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Payment Date *"
            type="date"
            required
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
          <Input
            label="Reference / Tx ID"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. MTN-892304"
          />
        </div>

        {/* Notes */}
        <Textarea
          label="Payment Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes or teller details..."
        />

        {/* Projected Outcome Preview */}
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">New Total Paid:</span>
            <span className="font-bold text-gray-900">
              {formatCurrency(newTotalPaid, currency, symbol)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Resulting Balance Due:</span>
            <span className={`font-bold ${newBalance <= 0 ? 'text-emerald-600' : 'text-blue-700'}`}>
              {formatCurrency(newBalance, currency, symbol)} {newBalance <= 0 ? '(Fully Paid)' : ''}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            icon={<CheckCircle2 size={14} />}
          >
            Confirm &amp; Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
