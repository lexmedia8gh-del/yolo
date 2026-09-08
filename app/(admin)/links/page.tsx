'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Link2,
  Plus,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Power,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  MessageSquare,
  Eye,
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
import type { ClientLink, Client, Invoice } from '@/lib/types'
import {
  formatCurrency,
  formatDate,
  copyToClipboard,
  generateSecureToken,
  generateWhatsAppLink,
} from '@/lib/utils'
import toast from 'react-hot-toast'

export default function LinksPage() {
  const [links, setLinks] = useState<ClientLink[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [revokingLink, setRevokingLink] = useState<ClientLink | null>(null)
  const [deletingLink, setDeletingLink] = useState<ClientLink | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    invoiceId: '',
    invoiceNumber: '',
    amount: 0,
    currency: 'GHS',
  })

  // Load Firestore collection
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<ClientLink>(
      COLLECTIONS.CLIENT_LINKS,
      [],
      (data) => {
        setLinks(data)
        setLoading(false)
      }
    )

    getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS).then((l) => {
      if (l && l.length > 0) setLinks(l)
      setLoading(false)
    })

    getDocuments<Client>(COLLECTIONS.CLIENTS).then((c) => setClients(c))
    getDocuments<Invoice>(COLLECTIONS.INVOICES).then((invs) => setInvoices(invs))

    return () => unsubscribe()
  }, [])

  const handleInvoiceSelect = (invId: string) => {
    const inv = invoices.find((i) => i.id === invId)
    if (inv) {
      setFormData({
        ...formData,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId,
        clientName: inv.clientName,
        amount: inv.balanceDue ?? inv.total,
        currency: inv.currency || 'GHS',
      })
    }
  }

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.invoiceId) {
      toast.error('Please select an invoice to generate a payment link')
      return
    }

    setIsSubmitting(true)
    try {
      const token = generateSecureToken('pay_')
      await addDocument(COLLECTIONS.CLIENT_LINKS, {
        token,
        clientId: formData.clientId,
        clientName: formData.clientName,
        invoiceId: formData.invoiceId,
        invoiceNumber: formData.invoiceNumber,
        amount: formData.amount,
        currency: formData.currency,
        status: 'Pending Payment',
        createdBy: 'admin',
      })

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const publicUrl = `${origin}/pay/${token}`

      toast.success('Payment request link generated successfully.')
      copyToClipboard(publicUrl)
      toast.success('Link copied to clipboard!')
      setIsAddModalOpen(false)
    } catch (err) {
      console.error('Error generating payment link:', err)
      toast.error('Failed to create payment link')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRevokeLink = async () => {
    if (!revokingLink) return
    setIsSubmitting(true)
    try {
      await updateDocument(COLLECTIONS.CLIENT_LINKS, revokingLink.id, {
        status: 'Cancelled',
      })
      toast.success('Payment link disabled successfully.')
      setRevokingLink(null)
    } catch (err) {
      console.error('Error revoking link:', err)
      toast.error('Failed to disable payment link')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteLink = async () => {
    if (!deletingLink) return
    setIsSubmitting(true)
    try {
      await deleteDocument(COLLECTIONS.CLIENT_LINKS, deletingLink.id)
      toast.success('Payment link deleted successfully.')
      setDeletingLink(null)
    } catch (err) {
      console.error('Failed to delete payment link:', err)
      toast.error('Failed to delete payment link.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter Links
  const filteredLinks = links.filter((l) => {
    const matchesSearch =
      l.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (l.invoiceNumber && l.invoiceNumber.toLowerCase().includes(search.toLowerCase())) ||
      l.token.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ? true : l.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Payment Client Links"
        subtitle="Generate and manage secure, public payment links to send directly to your clients via WhatsApp, Email, or SMS."
        action={
          <Button onClick={() => setIsAddModalOpen(true)} variant="primary" icon={<Plus size={18} />}>
            Create Payment Request
          </Button>
        }
      />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by client, invoice, or token…"
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
          >
            <option value="all">All Links</option>
            <option value="Pending Payment">Pending Payment</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Links Data Table */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2.5">
            <Spinner size="lg" />
            <p className="text-xs text-gray-500">Loading active payment links...</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Link2 size={20} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {search || statusFilter !== 'all' ? 'No payment links match your filter' : 'No payment links generated yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Create secure tokenized links so clients can pay their invoices online.'}
            </p>
            {!search && statusFilter === 'all' && (
              <Button onClick={() => setIsAddModalOpen(true)} variant="primary" size="sm" icon={<Plus size={15} />}>
                Create Payment Link
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredLinks.map((link) => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
                  const publicUrl = `${origin}/pay/${link.token}`
                  const clientObj = clients.find((c) => c.id === link.clientId)
                  const whatsappNum = clientObj?.whatsappNumber || clientObj?.phone

                  return (
                    <tr key={link.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{link.clientName}</div>
                        <div className="font-mono text-[10px] text-gray-400 mt-0.5">{link.token}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-gray-900 font-bold">
                        {link.invoiceNumber || '—'}
                      </td>

                      <td className="py-3 px-4 text-gray-700 max-w-[160px] truncate">
                        {link.projectName || '—'}
                      </td>

                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {formatCurrency(link.amount || 0)}
                      </td>

                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            link.status === 'Paid'
                              ? 'success'
                              : link.status === 'Cancelled'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {link.status}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-[11px] text-gray-500 whitespace-nowrap">
                        {link.createdAt ? formatDate(link.createdAt) : 'Recently'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copy */}
                          <button
                            onClick={() => {
                              copyToClipboard(publicUrl)
                              toast.success('Payment link copied!')
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Copy Link"
                          >
                            <Copy size={14} />
                          </button>

                          {/* Open */}
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Open Payment Page"
                          >
                            <ExternalLink size={14} />
                          </a>

                          {/* View Invoice */}
                          {link.invoiceId && (
                            <Link
                              href="/invoices"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="View Invoices"
                            >
                              <FileText size={14} />
                            </Link>
                          )}

                          {/* Send via WhatsApp */}
                          {whatsappNum && (
                            <button
                              onClick={() => {
                                const msg = `Hello ${link.clientName}! 👋\n\nHere is your secure payment link for invoice ${link.invoiceNumber || ''}:\n${publicUrl}\n\nAmount due: ${formatCurrency(link.amount || 0)}\n\nThank you! 🙏`
                                window.open(generateWhatsAppLink(whatsappNum, msg), '_blank')
                              }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Send Link via WhatsApp"
                            >
                              <MessageSquare size={14} />
                            </button>
                          )}

                          {/* Revoke */}
                          {link.status !== 'Cancelled' && link.status !== 'Paid' && (
                            <button
                              onClick={() => setRevokingLink(link)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Disable Link"
                            >
                              <Power size={14} />
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => setDeletingLink(link)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            title="Delete Link"
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

      {/* Create Payment Request Link Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create Payment Request Link"
        size="md"
      >
        <form onSubmit={handleCreateLink} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Select Invoice *</label>
            <select
              value={formData.invoiceId}
              onChange={(e) => handleInvoiceSelect(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              required
            >
              <option value="">-- Choose Pending Invoice --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.clientName} ({formatCurrency(inv.balanceDue ?? inv.total)})
                </option>
              ))}
            </select>
          </div>

          {formData.invoiceNumber && (
            <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-100 space-y-1 text-xs text-purple-900">
              <div className="flex justify-between">
                <span className="font-semibold">Client:</span>
                <span>{formData.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Amount to Pay:</span>
                <span className="font-bold">{formatCurrency(formData.amount)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Generate & Copy Link
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revoke Modal */}
      <Modal
        isOpen={!!revokingLink}
        onClose={() => setRevokingLink(null)}
        title="Disable Payment Link"
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">Disable link for {revokingLink?.invoiceNumber}?</h4>
            <p className="text-sm text-muted mt-1">
              Disabling this link will prevent anyone from opening or paying through this URL.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setRevokingLink(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRevokeLink} loading={isSubmitting}>
              Disable Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingLink}
        onClose={() => setDeletingLink(null)}
        title="Delete Payment Link"
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-danger-50 text-danger-600">
            <Trash2 size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              Delete link for {deletingLink?.invoiceNumber}?
            </h4>
            <p className="text-sm text-muted mt-1">
              Are you sure you want to delete this payment link? This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setDeletingLink(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteLink}
              loading={isSubmitting}
            >
              Delete Link
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
