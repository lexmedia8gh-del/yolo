'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Edit2,
  Eye,
  Power,
  DollarSign,
  Calendar,
  AlertCircle,
  Link2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
  X,
  Printer,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { Invoice, InvoiceStatus, Client, Service, Package, ClientLink } from '@/lib/types'
import {
  formatCurrency,
  formatDate,
  generateLxmInvoiceNumber,
  generateSecureToken,
  copyToClipboard,
  calculateInvoiceTotals,
} from '@/lib/utils'
import toast from 'react-hot-toast'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)
  const [generatedLinkData, setGeneratedLinkData] = useState<{ url: string; token: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    clientEmail: '',
    itemType: 'service' as 'service' | 'package' | 'custom',
    selectedId: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    discountValue: 0,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
    status: 'Pending' as InvoiceStatus,
  })

  // Load Firestore collections
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

    getDocuments<Invoice>(COLLECTIONS.INVOICES).then((invs) => {
      if (invs && invs.length > 0) setInvoices(invs)
      setLoading(false)
    })

    getDocuments<Client>(COLLECTIONS.CLIENTS).then((c) => setClients(c))
    getDocuments<Service>(COLLECTIONS.SERVICES).then((s) => setServices(s))
    getDocuments<Package>(COLLECTIONS.PACKAGES).then((p) => setPackages(p))

    return () => unsubscribe()
  }, [])

  const resetForm = () => {
    const firstClient = clients[0]
    setFormData({
      clientId: firstClient?.id || '',
      clientName: firstClient?.fullName || '',
      clientEmail: firstClient?.email || '',
      itemType: 'service',
      selectedId: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      discountValue: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      status: 'Pending',
    })
    setEditingInvoice(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsAddModalOpen(true)
  }

  const handleClientChange = (cId: string) => {
    const selectedClient = clients.find((c) => c.id === cId)
    if (selectedClient) {
      setFormData({
        ...formData,
        clientId: selectedClient.id,
        clientName: selectedClient.fullName,
        clientEmail: selectedClient.email,
      })
    }
  }

  const handleItemSelect = (id: string) => {
    if (formData.itemType === 'service') {
      const s = services.find((serv) => serv.id === id)
      if (s) {
        setFormData({
          ...formData,
          selectedId: s.id,
          description: s.name,
          unitPrice: s.defaultPrice || 0,
        })
      }
    } else if (formData.itemType === 'package') {
      const pkg = packages.find((p) => p.id === id)
      if (pkg) {
        setFormData({
          ...formData,
          selectedId: pkg.id,
          description: pkg.title,
          unitPrice: pkg.price || 0,
        })
      }
    }
  }

  // Calculate totals
  const subtotal = Math.max(0, (formData.quantity || 1) * (formData.unitPrice || 0))
  const discountAmount = Math.max(0, formData.discountValue || 0)
  const totalAmount = Math.max(0, subtotal - discountAmount)

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.clientId) {
      toast.error('Please select a client for this invoice')
      return
    }
    if (!formData.description.trim()) {
      toast.error('Please enter a description or select a service/package')
      return
    }
    if (totalAmount <= 0) {
      toast.error('Total invoice amount must be greater than zero')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingInvoice) {
        await updateDocument(COLLECTIONS.INVOICES, editingInvoice.id, {
          clientId: formData.clientId || '',
          clientName: formData.clientName || '',
          clientEmail: formData.clientEmail || '',
          items: [
            {
              id: 'item_1',
              description: formData.description || '',
              quantity: formData.quantity || 1,
              unitPrice: formData.unitPrice || 0,
              total: subtotal,
            },
          ],
          subtotal,
          discountAmount,
          total: totalAmount,
          balanceDue: totalAmount - (editingInvoice.amountPaid || 0),
          dueDate: formData.dueDate || '',
          notes: formData.notes || '',
          status: formData.status || 'Pending',
        })
        toast.success('Invoice updated successfully.')
      } else {
        const autoNum = generateLxmInvoiceNumber(invoices.length)
        await addDocument(COLLECTIONS.INVOICES, {
          invoiceNumber: autoNum,
          clientId: formData.clientId || '',
          clientName: formData.clientName || '',
          clientEmail: formData.clientEmail || '',
          items: [
            {
              id: 'item_1',
              description: formData.description || '',
              quantity: formData.quantity || 1,
              unitPrice: formData.unitPrice || 0,
              total: subtotal,
            },
          ],
          subtotal,
          discountAmount,
          total: totalAmount,
          amountPaid: 0,
          balanceDue: totalAmount,
          currency: 'GHS',
          status: 'Pending',
          invoiceDate: new Date().toISOString(),
          dueDate: formData.dueDate || '',
          notes: formData.notes || '',
          createdBy: 'admin',
        })
        toast.success(`Invoice ${autoNum} created successfully.`)
      }
      setIsAddModalOpen(false)
      resetForm()
    } catch (err: any) {
      console.error('Error saving invoice:', err)
      toast.error(err?.message || 'Failed to save invoice.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Generate Payment Link
  const handleGeneratePaymentLink = async (inv: Invoice) => {
    setIsSubmitting(true)
    try {
      const token = generateSecureToken('pay_')
      await addDocument(COLLECTIONS.CLIENT_LINKS, {
        token,
        clientId: inv.clientId,
        clientName: inv.clientName,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.balanceDue || inv.total,
        currency: inv.currency || 'GHS',
        status: 'Pending Payment',
        createdBy: 'admin',
      })

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const publicUrl = `${origin}/pay/${token}`

      setGeneratedLinkData({ url: publicUrl, token })
      toast.success(`Payment link generated for ${inv.invoiceNumber}`)
    } catch (err) {
      console.error('Error generating link:', err)
      toast.error('Failed to generate payment link')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter Invoices
  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.clientEmail && inv.clientEmail.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all' ? true : inv.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return
    setDeletingInvoiceId(invoiceToDelete.id)
    try {
      await deleteDocument(COLLECTIONS.INVOICES, invoiceToDelete.id)
      setInvoices((prev) => prev.filter((i) => i.id !== invoiceToDelete.id))
      toast.success('Invoice deleted successfully')
    } catch (err) {
      console.error('Delete invoice error:', err)
      toast.error('Failed to delete invoice. Please try again.')
    } finally {
      setDeletingInvoiceId(null)
      setInvoiceToDelete(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Invoices"
        subtitle="Issue professional invoices (LXM-INV-XXXX), track payment balances, and generate client payment links."
        action={
          <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
            Create Invoice
          </Button>
        }
      />

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by LXM-INV-0001, client name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-accent-500 outline-none"
          >
            <option value="all">All Invoices</option>
            <option value="Draft">Draft</option>
            <option value="Pending">Pending</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-muted">Loading invoices ledger...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center mx-auto mb-3">
              <FileText size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {search || statusFilter !== 'all' ? 'No invoices match your filter' : 'No invoices created yet'}
            </h3>
            <p className="text-sm text-muted max-w-sm mx-auto mb-6">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first LXM-INV invoice to start receiving online client payments.'}
            </p>
            {!search && statusFilter === 'all' && (
              <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
                Create First Invoice
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Invoice #</th>
                  <th className="py-4 px-6">Client</th>
                  <th className="py-4 px-6">Due Date</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Total Amount</th>
                  <th className="py-4 px-6">Amount Paid</th>
                  <th className="py-4 px-6">Balance Due</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-accent-700">
                      {inv.invoiceNumber}
                    </td>

                    <td className="py-4 px-6">
                      <div className="font-semibold text-gray-900">{inv.clientName}</div>
                      <div className="text-xs text-muted">{inv.clientEmail}</div>
                    </td>

                    <td className="py-4 px-6 text-xs text-gray-600">
                      {inv.dueDate ? formatDate(inv.dueDate) : 'No due date'}
                    </td>

                    <td className="py-4 px-6">
                      <Badge
                        variant={
                          inv.status === 'Paid'
                            ? 'success'
                            : inv.status === 'Overdue'
                            ? 'danger'
                            : inv.status === 'Partially Paid'
                            ? 'accent'
                            : 'muted'
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </td>

                    <td className="py-4 px-6 font-semibold text-gray-900">
                      {formatCurrency(inv.total)}
                    </td>

                    <td className="py-4 px-6 font-semibold text-success-600">
                      {formatCurrency(inv.amountPaid || 0)}
                    </td>

                    <td className="py-4 px-6 font-semibold text-danger-600">
                      {formatCurrency(inv.balanceDue ?? inv.total)}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingInvoice(inv)}
                          className="p-2 rounded-xl text-gray-500 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                          title="View Invoice Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleGeneratePaymentLink(inv)}
                          className="p-2 rounded-xl text-purple-600 hover:bg-purple-50 transition-colors"
                          title="Generate Payment Link"
                        >
                          <Send size={16} />
                        </button>
                        <button
                          onClick={() => setInvoiceToDelete(inv)}
                          className="p-2 rounded-xl text-danger-500 hover:bg-danger-50 transition-colors"
                          title="Delete Invoice"
                        >
                          <Trash2 size={16} />
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

      {/* Create / Edit Invoice Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}
        size="lg"
      >
        <form onSubmit={handleSaveInvoice} className="space-y-4">
          <div className="p-3 bg-accent-50/60 rounded-xl border border-accent-100 flex items-center justify-between text-xs text-accent-800">
            <span className="font-semibold">Invoice Number:</span>
            <span className="font-mono font-bold text-sm">
              {editingInvoice ? editingInvoice.invoiceNumber : generateLxmInvoiceNumber(invoices.length)}
            </span>
          </div>

          {/* Client Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Select Client *</label>
            <select
              value={formData.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              required
            >
              <option value="">-- Choose Client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
          </div>

          {/* Service/Package Item Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Item Source</label>
              <select
                value={formData.itemType}
                onChange={(e: any) => setFormData({ ...formData, itemType: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              >
                <option value="service">Individual Service</option>
                <option value="package">Bundled Package</option>
                <option value="custom">Custom Line Item</option>
              </select>
            </div>

            {formData.itemType !== 'custom' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">Choose Catalog Item</label>
                <select
                  value={formData.selectedId}
                  onChange={(e) => handleItemSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                >
                  <option value="">-- Select Item --</option>
                  {formData.itemType === 'service'
                    ? services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatCurrency(s.defaultPrice)})
                        </option>
                      ))
                    : packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({formatCurrency(p.price)})
                        </option>
                      ))}
                </select>
              </div>
            )}
          </div>

          <Input
            label="Line Item Description *"
            placeholder="e.g. Executive Photography session & 20 edited images"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Quantity *"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: Math.max(1, Number(e.target.value)) })}
              required
            />
            <Input
              label="Unit Price (GH₵) *"
              type="number"
              min="0"
              step="0.01"
              value={formData.unitPrice}
              onChange={(e) => setFormData({ ...formData, unitPrice: Math.max(0, Number(e.target.value)) })}
              required
            />
            <Input
              label="Discount (GH₵)"
              type="number"
              min="0"
              step="0.01"
              value={formData.discountValue}
              onChange={(e) => setFormData({ ...formData, discountValue: Math.max(0, Number(e.target.value)) })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Due Date *"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              required
            />
          </div>

          {/* Financial Calculation Summary Box */}
          <div className="p-4 bg-gray-50 rounded-xl border border-border space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-danger-600">
                <span>Discount:</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-border pt-2 text-base">
              <span>Total Invoice Amount:</span>
              <span className="text-accent-700">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {editingInvoice ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Generated Link Result Modal */}
      <Modal
        isOpen={!!generatedLinkData}
        onClose={() => setGeneratedLinkData(null)}
        title="Payment Link Generated Successfully!"
        size="md"
      >
        <div className="space-y-5 py-2">
          <div className="w-12 h-12 rounded-full bg-success-50 text-success-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Share this secure public payment link with your client via WhatsApp, Email, or SMS:
            </p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-border flex items-center justify-between gap-2">
            <input
              type="text"
              readOnly
              value={generatedLinkData?.url || ''}
              className="bg-transparent text-xs text-accent-700 font-mono flex-1 outline-none truncate"
            />
            <Button
              size="sm"
              variant="outline"
              icon={<Copy size={14} />}
              onClick={() => {
                if (generatedLinkData?.url) {
                  copyToClipboard(generatedLinkData.url)
                  toast.success('Payment link copied to clipboard!')
                }
              }}
            >
              Copy
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <a href={generatedLinkData?.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" icon={<ExternalLink size={14} />}>
                Preview Page
              </Button>
            </a>
            <Button variant="primary" onClick={() => setGeneratedLinkData(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Invoice Modal */}
      <Modal
        isOpen={!!viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        title={`Invoice ${viewingInvoice?.invoiceNumber}`}
        size="md"
      >
        {viewingInvoice && (
          <div className="space-y-5 py-2 text-sm">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">LEXMEDIA</h3>
                <p className="text-xs text-muted">Creative Agency & Studio</p>
              </div>
              <div className="text-right">
                <Badge variant="status" status={viewingInvoice.status}>
                  {viewingInvoice.status}
                </Badge>
                <p className="text-xs text-muted mt-1">
                  Due: {viewingInvoice.dueDate ? formatDate(viewingInvoice.dueDate) : 'N/A'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Billed To</p>
              <p className="font-bold text-gray-900">{viewingInvoice.clientName}</p>
              <p className="text-xs text-muted">{viewingInvoice.clientEmail}</p>
            </div>

            <div className="border border-border rounded-xl p-4 bg-gray-50/50 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Invoice Line Items</p>
              {viewingInvoice.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span>{item.description} (x{item.quantity})</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Subtotal:</span>
                <span>{formatCurrency(viewingInvoice.subtotal)}</span>
              </div>
              {viewingInvoice.discountAmount > 0 && (
                <div className="flex justify-between text-xs text-danger-600">
                  <span>Discount:</span>
                  <span>-{formatCurrency(viewingInvoice.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-border pt-2">
                <span>Total Amount:</span>
                <span className="text-accent-700">{formatCurrency(viewingInvoice.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-success-600 font-medium">
                <span>Amount Paid:</span>
                <span>{formatCurrency(viewingInvoice.amountPaid || 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-danger-600 font-bold">
                <span>Balance Due:</span>
                <span>{formatCurrency(viewingInvoice.balanceDue ?? viewingInvoice.total)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setViewingInvoice(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={<Send size={14} />}
                onClick={() => {
                  const inv = viewingInvoice
                  setViewingInvoice(null)
                  handleGeneratePaymentLink(inv)
                }}
              >
                Generate Payment Link
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        title="Delete Invoice"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-danger-600 bg-danger-50 p-3 rounded-xl border border-danger-100">
            <AlertCircle size={24} className="shrink-0" />
            <p className="text-sm font-semibold">
              Are you sure you want to delete invoice {invoiceToDelete?.invoiceNumber}?
            </p>
          </div>
          <p className="text-sm text-gray-600">
            This action cannot be undone. Associated data may remain in the database but this invoice will be removed.
          </p>
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setInvoiceToDelete(null)} disabled={deletingInvoiceId !== null}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger-600 hover:bg-danger-700 text-white border-none"
              onClick={handleDeleteInvoice}
              loading={deletingInvoiceId !== null}
            >
              Delete Invoice
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
