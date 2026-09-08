'use client'

import React, { useState } from 'react'
import {
  CreditCard,
  DollarSign,
  Calendar,
  FileText,
  User,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  ShieldCheck,
  Hash,
  Share2,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Payment } from '@/lib/types'
import { formatCurrency, formatDate, copyToClipboard } from '@/lib/utils'
import toast from 'react-hot-toast'

interface PaymentDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  payment: Payment | null
  onDeleteSuccess?: () => void
  onPaymentDeleted?: () => void
}

export function PaymentDetailsModal({
  isOpen,
  onClose,
  payment,
  onDeleteSuccess,
  onPaymentDeleted,
}: PaymentDetailsModalProps) {
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const handleDeletedCallback = () => {
    if (onPaymentDeleted) onPaymentDeleted()
    if (onDeleteSuccess) onDeleteSuccess()
  }

  if (!payment) return null

  const isDeposit = payment.isDeposit || payment.paymentType === 'deposit'
  const refCode = payment.reference || payment.paystackReference || payment.id

  const handleCopyReceipt = async () => {
    const summary = [
      `--- PAYMENT RECEIPT ---`,
      `Type: ${isDeposit ? 'Deposit' : 'Payment'}`,
      `Reference: ${refCode}`,
      `Client: ${payment.clientName}`,
      payment.projectName ? `Project: ${payment.projectName}` : null,
      payment.invoiceNumber ? `Invoice: #${payment.invoiceNumber}` : null,
      `Amount: ${payment.currency || 'GHS'} ${payment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      `Status: ${payment.status.toUpperCase()}`,
      `Method: ${payment.channel || payment.paymentMethod || 'Manual'}`,
      `Date: ${formatDate(payment.paidAt)}`,
      payment.notes ? `Notes: ${payment.notes}` : null,
      `-----------------------`,
    ]
      .filter(Boolean)
      .join('\n')

    await copyToClipboard(summary)
    setCopied(true)
    toast.success('Receipt details copied!')
    setTimeout(() => setCopied(false), 2500)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/payments/record?paymentId=${encodeURIComponent(payment.id)}&revertBalances=true`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove payment')

      toast.success('Payment record removed and balances updated.')
      setShowConfirmDelete(false)
      handleDeletedCallback()
      onClose()
    } catch (err: any) {
      console.error('Error deleting payment:', err)
      toast.error(err.message || 'Failed to delete payment.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDeposit ? 'Deposit Details' : 'Payment Details'}
      subtitle={`Reference: ${refCode}`}
      size="md"
    >
      <div className="space-y-5">
        {/* Header Amount Box */}
        <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 rounded-2xl p-5 text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                isDeposit
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {isDeposit ? 'Client Deposit' : 'Payment'}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                payment.status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : payment.status === 'pending'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {payment.status === 'success' ? 'Confirmed' : payment.status}
            </span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-gray-900">
            {formatCurrency(payment.amount, payment.currency || 'GHS')}
          </p>
          <p className="text-xs text-gray-500">Paid on {formatDate(payment.paidAt)}</p>
        </div>

        {/* Detailed Grid */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-xs">
          <div className="p-3 flex items-center justify-between">
            <span className="text-gray-500 font-medium">Client</span>
            <span className="font-semibold text-gray-900">{payment.clientName}</span>
          </div>

          {payment.projectName && (
            <div className="p-3 flex items-center justify-between">
              <span className="text-gray-500 font-medium">Project</span>
              <span className="font-semibold text-gray-900">{payment.projectName}</span>
            </div>
          )}

          {payment.invoiceNumber && (
            <div className="p-3 flex items-center justify-between">
              <span className="text-gray-500 font-medium">Invoice Number</span>
              <span className="font-mono font-semibold text-gray-900">#{payment.invoiceNumber}</span>
            </div>
          )}

          <div className="p-3 flex items-center justify-between">
            <span className="text-gray-500 font-medium">Payment Channel / Method</span>
            <span className="font-medium text-gray-800">{payment.channel || payment.paymentMethod || 'Manual'}</span>
          </div>

          <div className="p-3 flex items-center justify-between">
            <span className="text-gray-500 font-medium">Transaction Reference</span>
            <div className="flex items-center gap-1.5 font-mono text-gray-700">
              <span>{refCode}</span>
              <button
                type="button"
                onClick={() => {
                  copyToClipboard(refCode)
                  toast.success('Reference copied!')
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          {payment.recordedBy && (
            <div className="p-3 flex items-center justify-between">
              <span className="text-gray-500 font-medium">Recorded By</span>
              <span className="text-gray-700">{payment.recordedBy}</span>
            </div>
          )}

          {payment.notes && (
            <div className="p-3 space-y-1">
              <span className="text-gray-500 font-medium">Notes</span>
              <p className="text-gray-700 bg-gray-50 p-2 rounded-lg whitespace-pre-wrap">{payment.notes}</p>
            </div>
          )}
        </div>

        {/* Delete Confirmation or Actions */}
        {showConfirmDelete ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-800">
                <p className="font-bold">Delete this payment record?</p>
                <p className="mt-0.5">
                  This will remove the transaction and automatically revert the client&apos;s and project&apos;s
                  outstanding balances.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={handleDelete}
                icon={<Trash2 size={13} />}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmDelete(true)}
              icon={<Trash2 size={13} className="text-rose-500" />}
              className="text-rose-600 hover:bg-rose-50 border-rose-200"
            >
              Delete
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReceipt}
                icon={copied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              >
                {copied ? 'Copied' : 'Copy Receipt'}
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
