'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import { updateDocument, addDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { Invoice, InvoiceStatus } from '@/lib/types'
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
  const [notes, setNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (invoice) {
      const remainingBalance = Number(invoice.balanceDue) !== undefined ? Number(invoice.balanceDue) : Number(invoice.total) || 0
      setPaymentAmount(remainingBalance > 0 ? remainingBalance : 0)
      setReference(`PAY-${Date.now().toString(36).toUpperCase()}`)
      setPaymentDate(new Date().toISOString().split('T')[0])
    }
  }, [invoice])

  if (!invoice) return null

  const currency = invoice.currency || 'GHS'
  const symbol = invoice.currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'GH₵')
  const total = Number(invoice.total) || 0
  const currentPaid = Number(invoice.amountPaid) || 0
  const currentBalance = Number(invoice.balanceDue) !== undefined ? Number(invoice.balanceDue) : total - currentPaid

  const newTotalPaid = currentPaid + Number(paymentAmount || 0)
  const newBalance = Math.max(0, total - newTotalPaid)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('Payment amount must be greater than 0.')
      return
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Recording payment...')

    try {
      const nextStatus: InvoiceStatus = newBalance <= 0 ? 'Paid' : 'Partially Paid'

      // 1. Update the invoice
      await updateDocument(COLLECTIONS.INVOICES, invoice.id, {
        amountPaid: newTotalPaid,
        balanceDue: newBalance,
        status: nextStatus,
        paymentMethod,
        paymentReference: reference,
        paymentDate,
        paymentNotes: notes,
        paidAt: nextStatus === 'Paid' ? new Date().toISOString() : invoice.paidAt,
        updatedAt: new Date().toISOString(),
      })

      // 2. Add an entry to the payments collection for audit trail
      try {
        await addDocument(COLLECTIONS.PAYMENTS, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientId: invoice.clientId,
          clientName: invoice.clientName,
          amount: Number(paymentAmount),
          currency,
          paymentMethod,
          reference,
          notes,
          paymentDate,
          createdAt: new Date().toISOString(),
        })
      } catch (err) {
        console.warn('Could not write to payments collection:', err)
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
