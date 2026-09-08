'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  COLLECTIONS,
  getDocuments,
  subscribeToCollection,
  deleteDocument,
} from '@/lib/firebase/firestore'
import type { Payment } from '@/lib/types'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null)

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Payment>(
      COLLECTIONS.PAYMENTS,
      [],
      (data) => {
        // Sort by paidAt descending
        const sorted = [...data].sort((a, b) => {
          const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
          const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
          return bDate - aDate
        })
        setPayments(sorted)
        setLoading(false)
      }
    )

    getDocuments<Payment>(COLLECTIONS.PAYMENTS).then((data) => {
      if (data && data.length > 0) {
        setPayments([...data].sort((a, b) => {
          const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
          const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
          return bDate - aDate
        }))
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const filtered = payments.filter((p) => {
    const matchesSearch =
      p.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.paystackReference?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ? true : p.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const totalPaid = filtered.reduce(
    (sum, p) => (p.status === 'success' ? sum + (p.amount || 0) : sum),
    0
  )

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return
    setDeletingPaymentId(paymentToDelete.id)
    try {
      await deleteDocument(COLLECTIONS.PAYMENTS, paymentToDelete.id)
      setPayments((prev) => prev.filter((p) => p.id !== paymentToDelete.id))
      toast.success('Payment deleted successfully')
    } catch (err) {
      console.error('Delete payment error:', err)
      toast.error('Failed to delete payment.')
    } finally {
      setDeletingPaymentId(null)
      setPaymentToDelete(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Payments"
        subtitle="All Paystack transaction records received across all clients."
      />

      {/* Stats bar */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {[
            {
              label: 'Total Received',
              value: formatCurrency(payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0)),
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
              icon: CheckCircle2,
            },
            {
              label: 'Transactions',
              value: payments.filter((p) => p.status === 'success').length.toString(),
              color: 'text-indigo-600',
              bg: 'bg-indigo-50',
              icon: CreditCard,
            },
            {
              label: 'Failed',
              value: payments.filter((p) => p.status === 'failed').length.toString(),
              color: 'text-rose-600',
              bg: 'bg-rose-50',
              icon: AlertCircle,
            },
            {
              label: 'Pending',
              value: payments.filter((p) => !['success', 'failed'].includes(p.status)).length.toString(),
              color: 'text-amber-600',
              bg: 'bg-amber-50',
              icon: Clock,
            },
          ].map((card) => (
            <div key={card.label} className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${card.bg} ${card.color} flex items-center justify-center shrink-0`}>
                <card.icon size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{card.label}</p>
                <p className={`font-bold text-base tracking-tight mt-0.5 ${card.color}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by client, invoice, or Paystack reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Filter size={14} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
          >
            <option value="all">All Payments</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-2.5">
            <Spinner size="lg" />
            <p className="text-xs text-gray-500">Loading payment records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CreditCard size={20} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {search || statusFilter !== 'all' ? 'No payments match your filter' : 'No payment records yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or status filter.'
                : 'Payment records will appear here once clients complete a Paystack transaction.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Invoice</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filtered.map((pmt) => (
                  <tr key={pmt.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <code className="text-[11px] font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {pmt.paystackReference?.slice(0, 20)}…
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      {pmt.clientId ? (
                        <Link
                          href={`/clients/${pmt.clientId}`}
                          className="font-medium text-indigo-600 hover:underline"
                        >
                          {pmt.clientName}
                        </Link>
                      ) : (
                        <span className="text-gray-700">{pmt.clientName || '—'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] text-gray-700">
                        {pmt.invoiceNumber || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">
                      {formatCurrency(pmt.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(pmt.status)}`}>
                        {pmt.status === 'success' ? 'Successful' : pmt.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[11px] capitalize">
                      {pmt.channel || pmt.paymentMethod || 'Card'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[11px] whitespace-nowrap">
                      {formatDate(pmt.paidAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {pmt.clientId && (
                          <Link
                            href={`/clients/${pmt.clientId}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex"
                            title="View Client"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        )}
                        <button
                          onClick={() => setPaymentToDelete(pmt)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors inline-flex"
                          title="Delete Payment"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!paymentToDelete}
        onClose={() => setPaymentToDelete(null)}
        title="Delete Payment Record"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-danger-600 bg-danger-50 p-3 rounded-xl border border-danger-100">
            <AlertCircle size={24} className="shrink-0" />
            <p className="text-sm font-semibold">
              Delete payment {paymentToDelete?.paystackReference}?
            </p>
          </div>
          <p className="text-sm text-gray-600">
            This will permanently remove the payment record. If this payment is linked to an invoice, the invoice balance will NOT be automatically updated by deleting this record.
          </p>
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setPaymentToDelete(null)} disabled={deletingPaymentId !== null}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger-600 hover:bg-danger-700 text-white border-none"
              onClick={handleDeletePayment}
              loading={deletingPaymentId !== null}
            >
              Delete Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
