'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreVertical,
  Edit2,
  Eye,
  Power,
  Mail,
  Phone,
  MessageSquare,
  Building2,
  Calendar,
  DollarSign,
  Briefcase,
  AlertCircle,
  X,
  Check,
  Trash2,
  Sparkles,
  ArrowUpDown,
  FileText,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { QuickClientCreationModal } from '@/components/clients/QuickClientCreationModal'
import { ClientInformationTemplatesModal } from '@/components/clients/ClientInformationTemplatesModal'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { Client, ClientStatus } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'balance' | 'projects'>('recent')

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deactivatingClient, setDeactivatingClient] = useState<Client | null>(null)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    whatsappNumber: '',
    company: '',
    address: '',
    notes: '',
    status: 'active' as ClientStatus,
  })
  const [sendWelcomeSms, setSendWelcomeSms] = useState(true)

  // Load clients
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<Client>(
      COLLECTIONS.CLIENTS,
      [],
      (data) => {
        setClients(data)
        setLoading(false)
      }
    )

    // Fallback initial load
    getDocuments<Client>(COLLECTIONS.CLIENTS).then((data) => {
      if (data && data.length > 0) {
        setClients(data)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      whatsappNumber: '',
      company: '',
      address: '',
      notes: '',
      status: 'active',
    })
    setSendWelcomeSms(true)
    setEditingClient(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsAddModalOpen(true)
  }

  const openEditModal = (client: Client) => {
    setEditingClient(client)
    setFormData({
      fullName: client.fullName || '',
      email: client.email || '',
      phone: client.phone || '',
      whatsappNumber: client.whatsappNumber || client.phone || '',
      company: client.company || '',
      address: client.address || '',
      notes: client.notes || '',
      status: client.status || 'active',
    })
    setIsAddModalOpen(true)
  }

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.fullName.trim()) {
      toast.error('Please enter the client full name')
      return
    }
    if (!formData.email.trim()) {
      toast.error('Please enter a valid email address')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingClient) {
        await updateDocument(COLLECTIONS.CLIENTS, editingClient.id, {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          whatsappNumber: formData.whatsappNumber || formData.phone,
          company: formData.company,
          address: formData.address,
          notes: formData.notes,
          status: formData.status,
        })
        toast.success('Client updated successfully.')
        setIsAddModalOpen(false)
        resetForm()
      } else {
        const newClientId = await addDocument(COLLECTIONS.CLIENTS, {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          whatsappNumber: formData.whatsappNumber || formData.phone,
          company: formData.company,
          address: formData.address,
          notes: formData.notes,
          status: 'active',
          projectCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          createdBy: 'admin',
        })
        toast.success('Client created successfully.')

        // Trigger welcome SMS if requested and phone is provided
        const targetPhone = formData.phone?.trim() || formData.whatsappNumber?.trim()
        if (sendWelcomeSms && targetPhone) {
          const smsToastId = toast.loading('Sending welcome SMS...')
          try {
            const smsRes = await fetch('/api/sms/welcome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: targetPhone,
                clientName: formData.fullName.trim(),
                clientId: newClientId,
              }),
            })
            const smsData = await smsRes.json()

            if (smsRes.ok && smsData.success === true) {
              toast.success('Welcome SMS delivered successfully!', { id: smsToastId })
            } else {
              const errMsg = smsData?.error || 'Failed to deliver SMS'
              toast.error(`Welcome SMS notice: ${errMsg}`, { id: smsToastId, duration: 5000 })
            }
          } catch (smsErr) {
            console.error('SMS sending error:', smsErr)
            toast.error('Welcome SMS notice: Network error sending SMS', { id: smsToastId, duration: 4000 })
          }
        } else if (sendWelcomeSms && !targetPhone) {
          toast('Welcome SMS skipped: No phone number entered', { icon: 'ℹ️' })
        }

        setIsAddModalOpen(false)
        resetForm()
        router.push(`/clients/${newClientId}?action=new-project`)
      }
    } catch (err) {
      console.error('Error saving client:', err)
      toast.error('Failed to save client details.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!deactivatingClient) return
    const newStatus: ClientStatus = deactivatingClient.status === 'active' ? 'inactive' : 'active'
    setIsSubmitting(true)
    try {
      await updateDocument(COLLECTIONS.CLIENTS, deactivatingClient.id, {
        status: newStatus,
      })
      toast.success(
        newStatus === 'inactive'
          ? 'Client deactivated successfully.'
          : 'Client activated successfully.'
      )
      setDeactivatingClient(null)
    } catch (err) {
      console.error('Status update failed:', err)
      toast.error('Failed to update client status.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!deletingClient) return
    setIsSubmitting(true)
    try {
      await deleteDocument(COLLECTIONS.CLIENTS, deletingClient.id)
      toast.success('Client deleted successfully.')
      setDeletingClient(null)
    } catch (err) {
      console.error('Failed to delete client:', err)
      toast.error('Failed to delete client.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveClientDirectly = async (payload: any): Promise<string> => {
    const newClientId = await addDocument(COLLECTIONS.CLIENTS, payload)
    return newClientId
  }

  // Filtered & sorted clients list
  const filteredClients = clients
    .filter((c) => {
      const matchesSearch =
        c.fullName.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search))

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? c.status === 'active'
          : c.status === 'inactive'

      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return (a.fullName || '').localeCompare(b.fullName || '')
      }
      if (sortBy === 'balance') {
        return (b.outstandingBalance || 0) - (a.outstandingBalance || 0)
      }
      if (sortBy === 'projects') {
        return (b.projectCount || 0) - (a.projectCount || 0)
      }
      // 'recent' default
      const timeA = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : 0
      const timeB = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : 0
      return timeB - timeA
    })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Clients"
        subtitle="Manage client records, view project history, and track payment balances."
        action={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              onClick={() => setIsTemplatesModalOpen(true)}
              variant="outline"
              icon={<FileText size={16} />}
            >
              Templates
            </Button>
            <Button
              onClick={() => setIsQuickAddOpen(true)}
              variant="outline"
              className="border-accent-300 text-accent-700 hover:bg-accent-50"
              icon={<Sparkles size={16} className="text-accent-600" />}
            >
              Quick Add (Paste)
            </Button>
            <Button onClick={openAddModal} variant="primary" icon={<UserPlus size={18} />}>
              Add Client
            </Button>
          </div>
        }
      />

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by name, email, company, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={16} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-accent-500 outline-none"
          >
            <option value="all">All Clients</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <div className="flex items-center gap-2 text-sm text-gray-500 ml-1">
            <ArrowUpDown size={15} />
            <span>Sort:</span>
          </div>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-accent-500 outline-none"
          >
            <option value="recent">Most Recent</option>
            <option value="name">Name (A-Z)</option>
            <option value="balance">Highest Outstanding</option>
            <option value="projects">Most Projects</option>
          </select>
        </div>
      </div>

      {/* Client Table / Content */}
      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-muted">Loading clients database...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center mx-auto mb-3">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {search || statusFilter !== 'all' ? 'No clients match your filter' : 'No clients added yet'}
            </h3>
            <p className="text-sm text-muted max-w-sm mx-auto mb-6">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Get started by creating your first client record.'}
            </p>
            {!search && statusFilter === 'all' && (
              <Button onClick={openAddModal} variant="primary" icon={<UserPlus size={18} />}>
                Add First Client
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Client Name</th>
                  <th className="py-4 px-6">Contact Info</th>
                  <th className="py-4 px-6">Company</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Projects</th>
                  <th className="py-4 px-6">Total Paid</th>
                  <th className="py-4 px-6">Outstanding</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-gray-900">{client.fullName}</div>
                      <div className="text-xs text-muted">
                        Added {client.createdAt ? formatDate(client.createdAt) : 'Recently'}
                      </div>
                    </td>

                    <td className="py-4 px-6 space-y-1">
                      <div className="flex items-center gap-1.5 text-gray-600 text-xs">
                        <Mail size={13} className="text-gray-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{client.email}</span>
                      </div>
                      {client.phone && (
                        <div className="flex items-center gap-1.5 text-gray-600 text-xs">
                          <Phone size={13} className="text-gray-400 shrink-0" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      {client.company ? (
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Building2 size={14} className="text-gray-400 shrink-0" />
                          <span>{client.company}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      <Badge
                        variant={client.status === 'active' ? 'success' : 'muted'}
                        size="sm"
                      >
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="py-4 px-6 font-medium text-gray-700">
                      {client.projectCount || 0}
                    </td>

                    <td className="py-4 px-6 font-semibold text-success-600">
                      {formatCurrency(client.totalPaid || 0)}
                    </td>

                    <td className="py-4 px-6 font-semibold text-danger-600">
                      {formatCurrency(client.outstandingBalance || 0)}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/clients/${client.id}`}
                          className="p-2 rounded-xl text-gray-500 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                          title="View Client Profile"
                        >
                          <Eye size={16} />
                        </Link>
                        <button
                          onClick={() => openEditModal(client)}
                          className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit Client"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setDeactivatingClient(client)}
                          className={`p-2 rounded-xl transition-colors ${
                            client.status === 'active'
                              ? 'text-gray-500 hover:text-danger-600 hover:bg-danger-50'
                              : 'text-gray-500 hover:text-success-600 hover:bg-success-50'
                          }`}
                          title={client.status === 'active' ? 'Deactivate Client' : 'Activate Client'}
                        >
                          <Power size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingClient(client)}
                          className="p-2 rounded-xl text-gray-500 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                          title="Delete Client"
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

      {/* Add / Edit Client Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingClient ? 'Edit Client Details' : 'Add New Client'}
        size="md"
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          {!editingClient && (
            <div className="p-3 bg-accent-50/60 rounded-xl border border-accent-200/70 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-accent-900">
                <Sparkles size={15} className="text-accent-600 shrink-0" />
                <span>Have a WhatsApp message or raw notes?</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false)
                  setIsQuickAddOpen(true)
                }}
                className="text-xs font-semibold text-accent-700 hover:text-accent-900 underline shrink-0 cursor-pointer"
              >
                Use Quick Paste
              </button>
            </div>
          )}

          <Input
            label="Full Name *"
            placeholder="e.g. Ama Mensah"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address *"
              type="email"
              placeholder="ama@company.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Input
              label="Phone Number"
              placeholder="+233 24 000 0000"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="WhatsApp Number"
              placeholder="+233 24 000 0000"
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
            />
            <Input
              label="Company / Business Name"
              placeholder="e.g. Apex Marketing"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>

          <Input
            label="Address"
            placeholder="e.g. Accra, Ghana"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />

          {editingClient && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Client Status</label>
              <select
                value={formData.status}
                onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Client Notes</label>
            <textarea
              rows={3}
              placeholder="Add internal notes about this client..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm focus:ring-2 focus:ring-accent-500 outline-none"
            />
          </div>

          {!editingClient && (
            <div className="p-3.5 bg-gray-50/90 rounded-xl border border-gray-200/80 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendWelcomeSms}
                  onChange={(e) => setSendWelcomeSms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-gray-800 flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-indigo-600" />
                    Send Welcome SMS Notification
                  </span>
                  <p className="text-gray-500 mt-0.5">
                    Automatically sends a personalized greeting via Textbelt once the client record is created.
                  </p>
                </div>
              </label>
              {sendWelcomeSms && (
                <div className="text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-200/60 font-sans italic">
                  &ldquo;Hello {formData.fullName.trim() || '[Client Name]'}, welcome to Ctrl Room. Thank you for choosing us. We are pleased to have you with us and will keep you updated regarding your service.&rdquo;
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              {editingClient ? 'Update Client' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={!!deactivatingClient}
        onClose={() => setDeactivatingClient(null)}
        title={deactivatingClient?.status === 'active' ? 'Deactivate Client' : 'Activate Client'}
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
            deactivatingClient?.status === 'active' ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600'
          }`}>
            <AlertCircle size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              {deactivatingClient?.status === 'active'
                ? `Deactivate ${deactivatingClient?.fullName}?`
                : `Re-activate ${deactivatingClient?.fullName}?`}
            </h4>
            <p className="text-sm text-muted mt-1">
              {deactivatingClient?.status === 'active'
                ? 'Deactivating this client will mark them as inactive in your records.'
                : 'Activating this client will restore them to your active clients list.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setDeactivatingClient(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivatingClient?.status === 'active' ? 'danger' : 'primary'}
              onClick={handleToggleStatus}
              loading={isSubmitting}
            >
              {deactivatingClient?.status === 'active' ? 'Deactivate Client' : 'Activate Client'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingClient}
        onClose={() => setDeletingClient(null)}
        title="Delete Client"
        size="sm"
      >
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-danger-50 text-danger-600">
            <Trash2 size={24} />
          </div>

          <div>
            <h4 className="font-bold text-gray-900">
              Delete {deletingClient?.fullName}?
            </h4>
            <p className="text-sm text-muted mt-1">
              Are you sure you want to delete this client? This action cannot be undone and may affect associated projects.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setDeletingClient(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteClient}
              loading={isSubmitting}
            >
              Delete Client
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Client Creation Modal (Paste from WhatsApp / Notes) */}
      <QuickClientCreationModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onApplyToNormalForm={(extractedData) => {
          setFormData({
            fullName: extractedData.fullName || '',
            email: extractedData.email || '',
            phone: extractedData.phone || '',
            whatsappNumber: extractedData.whatsappNumber || extractedData.phone || '',
            company: extractedData.company || '',
            address: extractedData.address || '',
            notes: extractedData.notes
              ? `${extractedData.notes}${extractedData.serviceOrProject ? `\nRequested Service: ${extractedData.serviceOrProject}` : ''}`
              : extractedData.serviceOrProject
              ? `Requested Service: ${extractedData.serviceOrProject}`
              : '',
            status: 'active',
          })
          setIsAddModalOpen(true)
        }}
        onClientCreatedDirectly={(newClientId) => {
          router.push(`/clients/${newClientId}?action=new-project`)
        }}
        saveClientDirectly={saveClientDirectly}
      />

      {/* Client Information Templates Modal (WhatsApp / Intake / Briefs) */}
      <ClientInformationTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
      />
    </div>
  )
}
