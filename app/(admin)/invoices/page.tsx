'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Edit2,
  Eye,
  DollarSign,
  Calendar,
  AlertCircle,
  Link2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
  Printer,
  Trash2,
  CopyPlus,
  Download,
  CreditCard,
  ChevronDown,
  ArrowUpDown,
  Share2,
  Check,
  RefreshCw,
  Clock,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { InvoiceBuilderModal } from '@/components/invoices/InvoiceBuilderModal'
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal'
import { SendInvoiceEmailModal } from '@/components/invoices/SendInvoiceEmailModal'
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal'
import {
  COLLECTIONS,
  getDocuments,
  deleteDocument,
  subscribeToCollection,
  addDocument,
  updateDocument,
} from '@/lib/firebase/firestore'
import type { Invoice, InvoiceStatus, Client, Service, Package, ClientLink } from '@/lib/types'
import {
  formatCurrency,
  formatDate,
  generateLxmInvoiceNumber,
  generateSecureToken,
  getPaymentLink,
  copyToClipboard,
} from '@/lib/utils'
import { downloadInvoicePdf } from '@/lib/utils/pdfGenerator'
import toast from 'react-hot-toast'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)

  // Filter & Search States
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low' | 'due_date'>('newest')

  // Modal Controls
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [duplicatedDraft, setDuplicatedDraft] = useState<Partial<Invoice> | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [emailingInvoice, setEmailingInvoice] = useState<Invoice | null>(null)
  const [paymentRecordingInvoice, setPaymentRecordingInvoice] = useState<Invoice | null>(null)
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Copied link toast feedback tracker
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  // Real-time listener for Invoices
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Invoice>(
      COLLECTIONS.INVOICES,
      [],
      (data) => {
        setInvoices(data)
        setLoading(false)
      }
    )

    getDocuments<Client>(COLLECTIONS.CLIENTS).then((c) => setClients(c)).catch(() => {})
    getDocuments<Service>(COLLECTIONS.SERVICES).then((s) => setServices(s)).catch(() => {})
    getDocuments<Package>(COLLECTIONS.PACKAGES).then((p) => setPackages(p)).catch(() => {})

    return () => unsubscribe()
  }, [])

  // KPI Calculations
  const metrics = useMemo(() => {
    const totalCount = invoices.length
    let totalRevenue = 0
    let draftCount = 0
    let sentCount = 0
    let partiallyPaidCount = 0
    let paidCount = 0
    let overdueCount = 0
    let cancelledCount = 0

    const now = new Date()

    invoices.forEach((inv) => {
      totalRevenue += Number(inv.total) || 0
      const st = inv.status || 'Draft'

      if (st === 'Draft') draftCount++
      else if (st === 'Sent' || st === 'Pending') sentCount++
      else if (st === 'Partially Paid') partiallyPaidCount++
      else if (st === 'Paid') paidCount++
      else if (st === 'Cancelled') cancelledCount++

      // Check if overdue: status not paid/cancelled and dueDate is past
      if (st !== 'Paid' && st !== 'Cancelled' && inv.dueDate) {
        try {
          const due = typeof inv.dueDate === 'string' ? new Date(inv.dueDate) : (inv.dueDate as any).toDate()
          if (due < now) overdueCount++
        } catch {}
      }
    })

    return {
      totalCount,
      totalRevenue,
      draftCount,
      sentCount,
      partiallyPaidCount,
      paidCount,
      overdueCount,
      cancelledCount,
    }
  }, [invoices])

  // Filter & Sort Logic
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        // Search
        if (search.trim()) {
          const q = search.toLowerCase()
          const invNum = (inv.invoiceNumber || '').toLowerCase()
          const clientName = (inv.clientName || '').toLowerCase()
          const clientEmail = (inv.clientEmail || '').toLowerCase()
          const clientCompany = (inv.clientCompany || '').toLowerCase()
          const matchItems = inv.items?.some(
            (it) =>
              (it.title || '').toLowerCase().includes(q) ||
              (it.description || '').toLowerCase().includes(q)
          )

          if (
            !invNum.includes(q) &&
            !clientName.includes(q) &&
            !clientEmail.includes(q) &&
            !clientCompany.includes(q) &&
            !matchItems
          ) {
            return false
          }
        }

        // Status Filter
        if (statusFilter !== 'all') {
          if (statusFilter === 'Overdue') {
            const now = new Date()
            if (inv.status === 'Paid' || inv.status === 'Cancelled' || !inv.dueDate) return false
            const due = typeof inv.dueDate === 'string' ? new Date(inv.dueDate) : (inv.dueDate as any).toDate()
            if (due >= now) return false
          } else if (statusFilter === 'Sent') {
            if (inv.status !== 'Sent' && inv.status !== 'Pending') return false
          } else if (inv.status !== statusFilter) {
            return false
          }
        }

        // Date Filter
        if (dateFilter !== 'all') {
          const invDate = inv.invoiceDate
            ? typeof inv.invoiceDate === 'string'
              ? new Date(inv.invoiceDate)
              : (inv.invoiceDate as any).toDate()
            : null

          if (!invDate) return true
          const now = new Date()

          if (dateFilter === 'today') {
            return invDate.toDateString() === now.toDateString()
          } else if (dateFilter === 'this_week') {
            const weekAgo = new Date()
            weekAgo.setDate(now.getDate() - 7)
            return invDate >= weekAgo && invDate <= now
          } else if (dateFilter === 'this_month') {
            return (
              invDate.getMonth() === now.getMonth() &&
              invDate.getFullYear() === now.getFullYear()
            )
          } else if (dateFilter === 'this_year') {
            return invDate.getFullYear() === now.getFullYear()
          }
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          const dateA = a.createdAt ? new Date(a.createdAt as any).getTime() : 0
          const dateB = b.createdAt ? new Date(b.createdAt as any).getTime() : 0
          return dateB - dateA
        } else if (sortBy === 'oldest') {
          const dateA = a.createdAt ? new Date(a.createdAt as any).getTime() : 0
          const dateB = b.createdAt ? new Date(b.createdAt as any).getTime() : 0
          return dateA - dateB
        } else if (sortBy === 'amount_high') {
          return (Number(b.total) || 0) - (Number(a.total) || 0)
        } else if (sortBy === 'amount_low') {
          return (Number(a.total) || 0) - (Number(b.total) || 0)
        } else if (sortBy === 'due_date') {
          const dueA = a.dueDate ? new Date(a.dueDate as any).getTime() : Infinity
          const dueB = b.dueDate ? new Date(b.dueDate as any).getTime() : Infinity
          return dueA - dueB
        }
        return 0
      })
  }, [invoices, search, statusFilter, dateFilter, sortBy])

  // Actions
  const handleOpenCreateModal = () => {
    setEditingInvoice(null)
    setDuplicatedDraft(null)
    setIsBuilderOpen(true)
  }

  const handleEdit = (inv: Invoice) => {
    setEditingInvoice(inv)
    setDuplicatedDraft(null)
    setIsBuilderOpen(true)
  }

  const handleDuplicate = (inv: Invoice) => {
    const newNumber = generateLxmInvoiceNumber(invoices.length)
    const clonedDraft: Partial<Invoice> = {
      invoiceNumber: newNumber,
      clientId: inv.clientId,
      clientName: inv.clientName,
      clientCompany: inv.clientCompany,
      clientEmail: inv.clientEmail,
      clientPhone: inv.clientPhone,
      clientAddress: inv.clientAddress,
      businessInfo: inv.businessInfo,
      items: inv.items ? JSON.parse(JSON.stringify(inv.items)) : [],
      subtotal: inv.subtotal,
      discountType: inv.discountType,
      discountValue: inv.discountValue,
      discountAmount: inv.discountAmount,
      taxRate: inv.taxRate,
      taxAmount: inv.taxAmount,
      total: inv.total,
      amountPaid: 0,
      balanceDue: inv.total,
      currency: inv.currency,
      currencySymbol: inv.currencySymbol,
      status: 'Draft',
      paymentTerms: inv.paymentTerms,
      notes: inv.notes,
      terms: inv.terms,
      paymentInstructions: inv.paymentInstructions,
      thankYouMessage: inv.thankYouMessage,
    }
    setEditingInvoice(null)
    setDuplicatedDraft(clonedDraft)
    setIsBuilderOpen(true)
    toast.success(`Cloned invoice as draft: ${newNumber}`)
  }

  const handleCopyPaymentLink = async (inv: Invoice) => {
    let link = inv.paymentLinkUrl

    if (!link) {
      // Generate one on the fly and persist
      try {
        const token = generateSecureToken('pay_')
        link = getPaymentLink(token)

        const linkDocId = await addDocument(COLLECTIONS.CLIENT_LINKS, {
          token,
          clientId: inv.clientId || '',
          clientName: inv.clientName,
          clientEmail: inv.clientEmail,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.balanceDue || inv.total,
          currency: inv.currency || 'GHS',
          status: inv.status === 'Paid' ? 'Paid' : 'Pending Payment',
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
        })

        await updateDocument(COLLECTIONS.INVOICES, inv.id, {
          paymentLinkId: linkDocId,
          paymentLinkToken: token,
          paymentLinkUrl: link,
        })
      } catch (err) {
        console.warn('Could not generate payment link:', err)
      }
    }

    if (link) {
      const success = await copyToClipboard(link)
      if (success) {
        setCopiedLinkId(inv.id)
        toast.success(`Payment link copied for ${inv.invoiceNumber}!`)
        setTimeout(() => setCopiedLinkId(null), 2500)
      }
    } else {
      toast.error('Could not generate payment link.')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deletingInvoice) return
    setIsDeleting(true)
    const toastId = toast.loading('Deleting invoice...')
    try {
      await deleteDocument(COLLECTIONS.INVOICES, deletingInvoice.id)
      toast.success(`Invoice ${deletingInvoice.invoiceNumber} deleted!`, { id: toastId })
      setDeletingInvoice(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete invoice', { id: toastId })
    } finally {
      setIsDeleting(false)
    }
  }

  const getStatusBadge = (inv: Invoice) => {
    const s = inv.status || 'Draft'
    const now = new Date()
    const isOverdue = s !== 'Paid' && s !== 'Cancelled' && inv.dueDate && new Date(inv.dueDate as any) < now

    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle size={11} />
          Overdue
        </span>
      )
    }

    switch (s) {
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={11} />
            Paid
          </span>
        )
      case 'Partially Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={11} />
            Partially Paid
          </span>
        )
      case 'Sent':
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Send size={11} />
            {s === 'Sent' ? 'Sent' : 'Pending'}
          </span>
        )
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            <XCircle size={11} />
            Cancelled
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Draft
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ─── Page Header ─── */}
      <PageHeader
        title="Invoices"
        subtitle="Create, customize, track, and dispatch professional invoices for any client, service, or product."
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Create Invoice
          </Button>
        }
      />

      {/* ─── Metric KPI Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
            Total Invoices
          </span>
          <p className="text-xl font-bold text-gray-900">{metrics.totalCount}</p>
          <span className="text-[10px] text-gray-500 font-mono">
            {formatCurrency(metrics.totalRevenue, 'GHS')}
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Draft
          </span>
          <p className="text-xl font-bold text-slate-700">{metrics.draftCount}</p>
          <span className="text-[10px] text-slate-400">Unsent</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
            Sent / Pending
          </span>
          <p className="text-xl font-bold text-blue-700">{metrics.sentCount}</p>
          <span className="text-[10px] text-blue-500">Awaiting payment</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block">
            Partially Paid
          </span>
          <p className="text-xl font-bold text-amber-700">{metrics.partiallyPaidCount}</p>
          <span className="text-[10px] text-amber-500">Balance remaining</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            Paid
          </span>
          <p className="text-xl font-bold text-emerald-700">{metrics.paidCount}</p>
          <span className="text-[10px] text-emerald-500">Fully settled</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block">
            Overdue
          </span>
          <p className="text-xl font-bold text-rose-700">{metrics.overdueCount}</p>
          <span className="text-[10px] text-rose-500">Action needed</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
            Cancelled
          </span>
          <p className="text-xl font-bold text-gray-600">{metrics.cancelledCount}</p>
          <span className="text-[10px] text-gray-400">Voided</span>
        </div>
      </div>

      {/* ─── Search, Filters & Sorting Toolbar ─── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by invoice #, client name, email, company, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Date Filter Dropdown */}
          <div className="w-full md:w-auto">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full md:w-40 px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Date: All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="this_year">This Year</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="w-full md:w-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full md:w-48 px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="amount_high">Sort: Highest Total</option>
              <option value="amount_low">Sort: Lowest Total</option>
              <option value="due_date">Sort: Due Date (Soonest)</option>
            </select>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-gray-400 mr-1 flex items-center gap-1">
            <Filter size={12} /> Status:
          </span>
          {[
            { id: 'all', label: 'All Invoices' },
            { id: 'Draft', label: 'Draft' },
            { id: 'Sent', label: 'Sent' },
            { id: 'Partially Paid', label: 'Partially Paid' },
            { id: 'Paid', label: 'Paid' },
            { id: 'Overdue', label: 'Overdue' },
            { id: 'Cancelled', label: 'Cancelled' },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                statusFilter === pill.id
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Invoices Table ─── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <p className="text-xs text-gray-500">Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <FileText size={22} />
            </div>
            <h3 className="text-base font-bold text-gray-900">No invoices found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || dateFilter !== 'all'
                ? 'Try adjusting your search query or filters to find what you are looking for.'
                : 'You have not created any custom invoices yet. Click below to create your first invoice.'}
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={handleOpenCreateModal}
            >
              Create First Invoice
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Invoice Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredInvoices.map((inv) => {
                  const currency = inv.currency || 'GHS'
                  const symbol = inv.currencySymbol || (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : 'GH₵')
                  const total = Number(inv.total) || 0
                  const paid = Number(inv.amountPaid) || 0
                  const balance = Number(inv.balanceDue) !== undefined ? Number(inv.balanceDue) : Math.max(0, total - paid)

                  const now = new Date()
                  const isOverdue = inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.dueDate && new Date(inv.dueDate as any) < now

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50/70 transition-colors group"
                    >
                      {/* Invoice # */}
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">
                        <button
                          type="button"
                          onClick={() => setViewingInvoice(inv)}
                          className="hover:text-blue-600 hover:underline flex items-center gap-1.5"
                        >
                          <FileText size={13} className="text-gray-400" />
                          <span>{inv.invoiceNumber}</span>
                        </button>
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-gray-900">{inv.clientName || 'Valued Client'}</p>
                        {inv.clientCompany && (
                          <p className="text-[11px] text-gray-500">{inv.clientCompany}</p>
                        )}
                        {inv.clientEmail && (
                          <p className="text-[10px] text-gray-400 truncate max-w-[160px]">
                            {inv.clientEmail}
                          </p>
                        )}
                      </td>

                      {/* Invoice Date */}
                      <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                        {formatDate(inv.invoiceDate)}
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-gray-600'}>
                          {formatDate(inv.dueDate)}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                        {formatCurrency(total, currency, symbol)}
                      </td>

                      {/* Amount Paid */}
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 whitespace-nowrap">
                        {paid > 0 ? formatCurrency(paid, currency, symbol) : '—'}
                      </td>

                      {/* Balance Due */}
                      <td className="py-3 px-4 text-right font-mono font-black whitespace-nowrap">
                        <span className={balance > 0 ? 'text-blue-700' : 'text-emerald-600'}>
                          {formatCurrency(balance, currency, symbol)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(inv)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Preview */}
                          <button
                            type="button"
                            title="View Invoice Document"
                            onClick={() => setViewingInvoice(inv)}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-blue-600 transition-colors"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            title="Edit Invoice"
                            onClick={() => handleEdit(inv)}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>

                          {/* Record Payment */}
                          {balance > 0 && inv.status !== 'Cancelled' && (
                            <button
                              type="button"
                              title="Record Payment"
                              onClick={() => setPaymentRecordingInvoice(inv)}
                              className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors"
                            >
                              <CreditCard size={14} />
                            </button>
                          )}

                          {/* Send Email */}
                          <button
                            type="button"
                            title="Send via Email"
                            onClick={() => setEmailingInvoice(inv)}
                            className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600 transition-colors"
                          >
                            <Send size={14} />
                          </button>

                          {/* Copy Payment Link */}
                          <button
                            type="button"
                            title="Copy Payment Link"
                            onClick={() => handleCopyPaymentLink(inv)}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-blue-600 transition-colors"
                          >
                            {copiedLinkId === inv.id ? (
                              <Check size={14} className="text-emerald-600" />
                            ) : (
                              <Link2 size={14} />
                            )}
                          </button>

                          {/* Duplicate */}
                          <button
                            type="button"
                            title="Duplicate Invoice"
                            onClick={() => handleDuplicate(inv)}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 hover:text-amber-600 transition-colors"
                          >
                            <CopyPlus size={14} />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            title="Delete Invoice"
                            onClick={() => setDeletingInvoice(inv)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* ─── MODAL 1: Invoice Builder Modal (Create / Edit / Duplicate) ─── */}
      <InvoiceBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => {
          setIsBuilderOpen(false)
          setEditingInvoice(null)
          setDuplicatedDraft(null)
        }}
        invoiceToEdit={editingInvoice}
        initialDraft={duplicatedDraft}
        existingInvoicesCount={invoices.length}
        clients={clients}
        services={services}
        packages={packages}
        onSuccess={(saved) => {
          // Replaced by real-time listener
        }}
        onSaveAndSend={(saved) => {
          setEmailingInvoice(saved)
        }}
      />

      {/* ─── MODAL 2: Live Preview Modal (Desktop/Mobile, PDF, Print, Share) ─── */}
      <InvoicePreviewModal
        isOpen={!!viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        invoice={viewingInvoice}
        onEdit={(inv) => {
          setViewingInvoice(null)
          handleEdit(inv)
        }}
        onSendEmail={(inv) => {
          setViewingInvoice(null)
          setEmailingInvoice(inv)
        }}
      />

      {/* ─── MODAL 3: Send Invoice Email Modal ─── */}
      <SendInvoiceEmailModal
        isOpen={!!emailingInvoice}
        onClose={() => setEmailingInvoice(null)}
        invoice={emailingInvoice}
      />

      {/* ─── MODAL 4: Record Payment Modal ─── */}
      <RecordPaymentModal
        isOpen={!!paymentRecordingInvoice}
        onClose={() => setPaymentRecordingInvoice(null)}
        invoice={paymentRecordingInvoice}
      />

      {/* ─── MODAL 5: Delete Confirmation Modal ─── */}
      <Modal
        isOpen={!!deletingInvoice}
        onClose={() => setDeletingInvoice(null)}
        title="Confirm Delete Invoice"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            Are you sure you want to delete invoice{' '}
            <strong className="text-gray-900 font-mono">
              {deletingInvoice?.invoiceNumber}
            </strong>{' '}
            issued to <strong>{deletingInvoice?.clientName}</strong>?
          </p>
          <p className="text-xs text-rose-600">
            This action cannot be undone. Any recorded payments and active payment links for this invoice will no longer be linked.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="ghost"
              onClick={() => setDeletingInvoice(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={isDeleting}
              icon={<Trash2 size={14} />}
              onClick={handleDeleteConfirm}
            >
              Delete Invoice
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
