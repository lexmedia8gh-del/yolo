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
  Plus,
  Link2,
  Eye,
  DollarSign,
  PiggyBank,
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
} from '@/lib/firebase/firestore'
import type { Payment } from '@/lib/types'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal'
import { PaymentDetailsModal } from '@/components/payments/PaymentDetailsModal'
import { PaymentLinkModal } from '@/components/payments/PaymentLinkModal'
import toast from 'react-hot-toast'

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Modals state
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<Payment | null>(null)

  const fetchPayments = async () => {
    try {
      const data = await getDocuments<Payment>(COLLECTIONS.PAYMENTS)
      if (data && data.length > 0) {
        setPayments(
          [...data].sort((a, b) => {
            const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
            const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
            return bDate - aDate
          })
        )
      } else {
        setPayments([])
      }
    } catch (err) {
      console.error('Fetch payments error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Payment>(
      COLLECTIONS.PAYMENTS,
      [],
      (data) => {
        const sorted = [...data].sort((a, b) => {
          const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
          const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
          return bDate - aDate
        })
        setPayments(sorted)
        setLoading(false)
      }
    )

    fetchPayments()

    return () => unsubscribe()
  }, [])

  const filtered = payments.filter((p) => {
    const matchesSearch =
      p.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      p.paystackReference?.toLowerCase().includes(search.toLowerCase()) ||
      p.notes?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ? true : p.status === statusFilter

    const isDeposit = p.paymentType === 'deposit' || p.isDeposit
    const matchesType =
      typeFilter === 'all'
        ? true
        : typeFilter === 'deposit'
        ? isDeposit
        : !isDeposit

    return matchesSearch && matchesStatus && matchesType
  })

  const totalPaid = payments
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const totalDeposits = payments
    .filter((p) => p.status === 'success' && (p.paymentType === 'deposit' || p.isDeposit))
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Payments & Deposits</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Record deposits, track client balances, and manage payment links across all clients.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            icon={<Link2 size={15} />}
            onClick={() => setShowLinkModal(true)}
          >
            Payment Link
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => setShowRecordModal(true)}
          >
            Record Payment / Deposit
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {[
            {
              label: 'Total Received',
              value: formatCurrency(totalPaid),
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
              icon: CheckCircle2,
            },
            {
              label: 'Total Deposits',
              value: formatCurrency(totalDeposits),
              color: 'text-amber-600',
              bg: 'bg-amber-50',
              icon: PiggyBank,
            },
            {
              label: 'Transactions',
              value: payments.filter((p) => p.status === 'success').length.toString(),
              color: 'text-indigo-600',
              bg: 'bg-indigo-50',
              icon: CreditCard,
            },
            {
              label: 'Pending / Other',
              value: payments.filter((p) => !['success'].includes(p.status)).length.toString(),
              color: 'text-gray-600',
              bg: 'bg-gray-100',
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
            placeholder="Search by client, invoice, reference, or note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Filter size={14} />
            <span>Type:</span>
            <select
              value={typeFilter}
              onChange={(e: any) => setTypeFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="all">All Types</option>
              <option value="deposit">Deposits Only</option>
              <option value="payment">Final / Regular Payments</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              <option value="all">All Statuses</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>
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
              {search || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No payments match your filter'
                : 'No payment records yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
              {search || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Record manual deposits and payments or accept online payments via Paystack.'}
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowRecordModal(true)}
            >
              Record First Payment
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Invoice / Project</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filtered.map((pmt) => {
                  const isDeposit = pmt.paymentType === 'deposit' || pmt.isDeposit
                  return (
                    <tr
                      key={pmt.id}
                      onClick={() => setSelectedPaymentForDetails(pmt)}
                      className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <code className="text-[11px] font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {pmt.paystackReference?.slice(0, 18)}…
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        {isDeposit ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            Deposit
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Payment
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900" onClick={(e) => e.stopPropagation()}>
                        {pmt.clientId ? (
                          <Link
                            href={`/clients/${pmt.clientId}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {pmt.clientName}
                          </Link>
                        ) : (
                          <span>{pmt.clientName || '—'}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {pmt.invoiceNumber ? (
                          <span className="font-mono text-[11px]">{pmt.invoiceNumber}</span>
                        ) : (
                          <span className="text-gray-400">Direct Client</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-600">
                        {formatCurrency(pmt.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(pmt.status)}`}>
                          {pmt.status === 'success' ? 'Successful' : pmt.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-[11px] capitalize">
                        {pmt.paymentMethod || pmt.channel || 'Card'}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-[11px] whitespace-nowrap">
                        {formatDate(pmt.paidAt)}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedPaymentForDetails(pmt)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex"
                            title="View Details"
                          >
                            <Eye size={15} />
                          </button>
                          {pmt.clientId && (
                            <Link
                              href={`/clients/${pmt.clientId}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex"
                              title="View Client"
                            >
                              <ExternalLink size={14} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment / Deposit Modal */}
      <RecordPaymentModal
        isOpen={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        onSuccess={() => {
          fetchPayments()
          toast.success('Payment recorded successfully')
        }}
      />

      {/* Payment Details & Deletion Modal */}
      <PaymentDetailsModal
        isOpen={!!selectedPaymentForDetails}
        onClose={() => setSelectedPaymentForDetails(null)}
        payment={selectedPaymentForDetails}
        onPaymentDeleted={() => {
          fetchPayments()
        }}
      />

      {/* Custom Supplied Payment Link Modal */}
      <PaymentLinkModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onSuccess={() => {
          toast.success('Payment link saved')
        }}
      />
    </div>
  )
}
