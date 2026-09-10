'use client'

import React, { useState, useEffect } from 'react'
import {
  Zap,
  Plus,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Wrench,
  DollarSign,
  FileText,
  X,
  Building,
  Phone,
  Mail,
  Check,
  Lock,
  Unlock,
  ShieldCheck,
  Send,
  RotateCcw,
  PackageCheck,
  CheckCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Card } from '@/components/ui/Card'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { QuickJob, QuickJobStatus, Service, Client } from '@/lib/types'
import { QuickJobPaymentDelivery } from '@/components/quick-jobs/QuickJobPaymentDelivery'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const STATUS_OPTIONS: QuickJobStatus[] = [
  'Pending',
  'In Progress',
  'Ready for Delivery',
  'Completed',
  'Cancelled',
]

const statusColorMap: Record<QuickJobStatus, { bg: string; text: string; badgeVariant: 'warning' | 'accent' | 'success' | 'danger' | 'default' }> = {
  'Pending': { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', badgeVariant: 'warning' },
  'In Progress': { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', badgeVariant: 'accent' },
  'Ready for Delivery': { bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-300', badgeVariant: 'accent' },
  'Completed': { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', badgeVariant: 'success' },
  'Cancelled': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', badgeVariant: 'default' },
}

export default function QuickJobsPage() {
  const [quickJobs, setQuickJobs] = useState<QuickJob[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<QuickJob | null>(null)
  const [viewingJob, setViewingJob] = useState<QuickJob | null>(null)
  const [deletingJob, setDeletingJob] = useState<QuickJob | null>(null)
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Release Delivery Modal State
  const [releasingJob, setReleasingJob] = useState<QuickJob | null>(null)
  const [isReleasingDirect, setIsReleasingDirect] = useState(false)
  const [isResendModal, setIsResendModal] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    serviceId: '',
    jobDescription: '',
    originalAgreedPrice: 0,
    quantity: 1,
    deadline: '',
    notes: '',
    status: 'Pending' as QuickJobStatus,
    depositPaid: 0,
    amountPaid: 0,
    currency: 'GHS',
  })

  // Quick Client Form
  const [newClientData, setNewClientData] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
  })

  // Release Delivery Handlers
  const handlePromptRelease = (job: QuickJob, isResend = false) => {
    setIsResendModal(isResend)
    setReleasingJob(job)
  }

  const handleExecuteRelease = async () => {
    if (!releasingJob) return
    setIsReleasingDirect(true)
    try {
      const res = await fetch('/api/quick-jobs/release-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: releasingJob.id,
          resend: isResendModal,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to release delivery')
      }

      toast.success(
        isResendModal
          ? 'Delivery notification email resent via Brevo!'
          : 'Delivery released! Client notification email sent via Brevo.'
      )

      // Update in local state
      setQuickJobs((prev) =>
        prev.map((j) =>
          j.id === releasingJob.id
            ? {
                ...j,
                deliveryStatus: 'Released',
                status: 'Completed',
                deliveryReleasedAt: data.releasedAt,
                deliveryEmailSent: true,
                deliveryLink: data.deliveryLink,
                deliveryAccessToken: data.accessToken,
              }
            : j
        )
      )

      if (viewingJob && viewingJob.id === releasingJob.id) {
        setViewingJob((prev) =>
          prev
            ? {
                ...prev,
                deliveryStatus: 'Released',
                status: 'Completed',
                deliveryReleasedAt: data.releasedAt,
                deliveryEmailSent: true,
                deliveryLink: data.deliveryLink,
                deliveryAccessToken: data.accessToken,
              }
            : null
        )
      }

      setReleasingJob(null)
    } catch (err: any) {
      console.error('Release delivery error:', err)
      toast.error(err?.message || 'Failed to release delivery.')
      if (err?.message && err.message.includes('upload delivery files')) {
        setViewingJob(releasingJob)
        setReleasingJob(null)
      }
    } finally {
      setIsReleasingDirect(false)
    }
  }

  // Load Data
  useEffect(() => {
    let isMounted = true
    setLoading(true)

    const unsubJobs = subscribeToCollection<QuickJob>(
      COLLECTIONS.QUICK_JOBS,
      [],
      (data) => {
        if (isMounted) {
          setQuickJobs(data)
          setLoading(false)
        }
      }
    )

    const unsubServices = subscribeToCollection<Service>(
      COLLECTIONS.SERVICES,
      [],
      (data) => {
        if (isMounted) setServices(data)
      }
    )

    const unsubClients = subscribeToCollection<Client>(
      COLLECTIONS.CLIENTS,
      [],
      (data) => {
        if (isMounted) setClients(data)
      }
    )

    // Fallback getDocuments
    Promise.all([
      getDocuments<QuickJob>(COLLECTIONS.QUICK_JOBS),
      getDocuments<Service>(COLLECTIONS.SERVICES),
      getDocuments<Client>(COLLECTIONS.CLIENTS),
    ]).then(([jData, sData, cData]) => {
      if (isMounted) {
        if (jData && jData.length > 0) setQuickJobs(jData)
        if (sData && sData.length > 0) setServices(sData)
        if (cData && cData.length > 0) setClients(cData)
        setLoading(false)
      }
    }).catch(() => {
      if (isMounted) setLoading(false)
    })

    return () => {
      isMounted = false
      unsubJobs()
      unsubServices()
      unsubClients()
    }
  }, [])

  // Handle service selection auto-fill
  const handleServiceChange = (serviceId: string) => {
    const selectedSvc = services.find((s) => s.id === serviceId)
    if (selectedSvc) {
      setFormData((prev) => ({
        ...prev,
        serviceId,
        jobDescription: prev.jobDescription || selectedSvc.description || selectedSvc.name,
        originalAgreedPrice: selectedSvc.defaultPrice * (prev.quantity || 1),
        currency: selectedSvc.currency || 'GHS',
      }))
    } else {
      setFormData((prev) => ({ ...prev, serviceId: '' }))
    }
  }

  // Handle quantity change
  const handleQuantityChange = (qty: number) => {
    const safeQty = Math.max(1, qty)
    const selectedSvc = services.find((s) => s.id === formData.serviceId)
    const unitPrice = selectedSvc ? selectedSvc.defaultPrice : (formData.originalAgreedPrice / (formData.quantity || 1))
    setFormData((prev) => ({
      ...prev,
      quantity: safeQty,
      originalAgreedPrice: unitPrice * safeQty,
    }))
  }

  const resetForm = () => {
    setFormData({
      clientId: clients[0]?.id || '',
      serviceId: services[0]?.id || '',
      jobDescription: services[0]?.description || services[0]?.name || '',
      originalAgreedPrice: services[0]?.defaultPrice || 0,
      quantity: 1,
      deadline: '',
      notes: '',
      status: 'Pending',
      depositPaid: 0,
      amountPaid: 0,
      currency: 'GHS',
    })
    setEditingJob(null)
  }

  const openAddModal = () => {
    resetForm()
    setIsFormModalOpen(true)
  }

  const openEditModal = (job: QuickJob) => {
    setEditingJob(job)
    setFormData({
      clientId: job.clientId || '',
      serviceId: job.serviceId || '',
      jobDescription: job.jobDescription || '',
      originalAgreedPrice: job.originalAgreedPrice || 0,
      quantity: job.quantity || 1,
      deadline: job.deadline || '',
      notes: job.notes || '',
      status: job.status || 'Pending',
      depositPaid: job.depositPaid || 0,
      amountPaid: job.amountPaid || 0,
      currency: job.currency || 'GHS',
    })
    setIsFormModalOpen(true)
  }

  // Create new client inline
  const handleCreateClientQuick = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClientData.fullName.trim()) {
      toast.error('Please enter client full name')
      return
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const newClientPayload = {
        fullName: newClientData.fullName,
        email: newClientData.email || '',
        phone: newClientData.phone || '',
        company: newClientData.company || '',
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      }
      const newId = await addDocument(COLLECTIONS.CLIENTS, newClientPayload)
      const createdClient: Client = { id: newId, ...newClientPayload, createdAt: now as any, updatedAt: now as any, createdBy: 'admin' }
      setClients((prev) => [createdClient, ...prev])
      setFormData((prev) => ({ ...prev, clientId: newId }))
      toast.success('Client created successfully!')
      setIsNewClientModalOpen(false)
      setNewClientData({ fullName: '', email: '', phone: '', company: '' })
    } catch (err) {
      console.error('Error creating client:', err)
      toast.error('Failed to create client.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Save Quick Job
  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.clientId) {
      toast.error('Please select a client for this quick job')
      return
    }
    if (!formData.jobDescription.trim()) {
      toast.error('Please enter a job description')
      return
    }

    const selectedClient = clients.find((c) => c.id === formData.clientId)
    const selectedSvc = services.find((s) => s.id === formData.serviceId)

    const serviceSnapshot = selectedSvc
      ? {
          id: selectedSvc.id,
          name: selectedSvc.name,
          category: String(selectedSvc.category),
          description: selectedSvc.description || '',
          defaultPrice: selectedSvc.defaultPrice,
        }
      : undefined

    const price = Number(formData.originalAgreedPrice) || 0
    const amtPaid = Number(formData.amountPaid) || 0
    const outstanding = Math.max(0, price - amtPaid)
    const paymentStatus = amtPaid >= price ? 'Paid' : amtPaid > 0 ? 'Partially Paid' : 'Unpaid'

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        clientId: formData.clientId,
        clientName: selectedClient?.fullName || 'Walk-in Client',
        clientEmail: selectedClient?.email || '',
        clientPhone: selectedClient?.phone || '',
        serviceId: formData.serviceId || '',
        serviceSnapshot,
        jobDescription: formData.jobDescription,
        originalAgreedPrice: price,
        quantity: Number(formData.quantity) || 1,
        deadline: formData.deadline || '',
        notes: formData.notes || '',
        status: formData.status,
        paymentStatus,
        depositPaid: Number(formData.depositPaid) || 0,
        amountPaid: amtPaid,
        outstandingBalance: outstanding,
        currency: formData.currency || 'GHS',
        updatedAt: now,
      }

      if (editingJob) {
        await updateDocument(COLLECTIONS.QUICK_JOBS, editingJob.id, payload)
        toast.success('Quick Job updated successfully!')
      } else {
        const createPayload = {
          ...payload,
          createdAt: now,
        }
        await addDocument(COLLECTIONS.QUICK_JOBS, createPayload)
        toast.success('Quick Job created successfully!')
      }

      setIsFormModalOpen(false)
      resetForm()
    } catch (err) {
      console.error('Error saving quick job:', err)
      toast.error('Failed to save quick job.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete Quick Job
  const handleDeleteJob = async () => {
    if (!deletingJob) return
    setIsSubmitting(true)
    try {
      await deleteDocument(COLLECTIONS.QUICK_JOBS, deletingJob.id)
      toast.success('Quick job deleted successfully.')
      setDeletingJob(null)
    } catch (err) {
      console.error('Error deleting quick job:', err)
      toast.error('Failed to delete quick job.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick Status update
  const handleUpdateStatus = async (job: QuickJob, newStatus: QuickJobStatus) => {
    try {
      await updateDocument(COLLECTIONS.QUICK_JOBS, job.id, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      })
      toast.success(`Job status updated to ${newStatus}`)
    } catch (err) {
      console.error('Error updating status:', err)
      toast.error('Failed to update status.')
    }
  }

  const filteredJobs = quickJobs.filter((job) => {
    const matchesSearch =
      job.jobDescription.toLowerCase().includes(search.toLowerCase()) ||
      job.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (job.serviceSnapshot?.name && job.serviceSnapshot.name.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="Quick Jobs"
        subtitle="Fast creation and management of client jobs linked with your service catalog and clients."
        action={
          <Button onClick={openAddModal} icon={<Plus size={16} />}>
            New Quick Job
          </Button>
        }
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by description, client, or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 shrink-0">
            <Filter size={13} /> Status:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All ({quickJobs.length})
          </button>
          {STATUS_OPTIONS.map((st) => {
            const count = quickJobs.filter((j) => j.status === st).length
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {st} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content List / Table */}
      {loading ? (
        <div className="py-20 text-center">
          <Spinner size="lg" className="mx-auto text-indigo-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading quick jobs...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <Card className="text-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Zap size={22} />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No Quick Jobs Found</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1 mb-6">
            {search || statusFilter !== 'all'
              ? 'No jobs match your current search or status filter.'
              : 'Create your first quick job to track clients, pricing, and deadlines instantly.'}
          </p>
          <Button onClick={openAddModal} icon={<Plus size={16} />}>
            Create Quick Job
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => {
            const stColor = statusColorMap[job.status] || statusColorMap['Pending']
            return (
              <Card key={job.id} hover className="flex flex-col justify-between p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide block mb-0.5">
                        {job.serviceSnapshot?.name || 'Quick Service'}
                      </span>
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                        {job.jobDescription}
                      </h4>
                    </div>
                    <Badge variant={stColor.badgeVariant} size="sm" className="shrink-0">
                      {job.status}
                    </Badge>
                  </div>

                  {/* Client Info */}
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300">
                    <User size={13} className="text-gray-400 shrink-0" />
                    <span className="font-medium truncate">{job.clientName}</span>
                  </div>

                  {/* Pricing & Deadline */}
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block">Agreed Price</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100 font-mono">
                        {formatCurrency(job.originalAgreedPrice, job.currency)}
                      </span>
                      {job.quantity > 1 && (
                        <span className="text-[10px] text-gray-500 block">Qty: {job.quantity}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block">Deadline</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {job.deadline ? formatDate(job.deadline) : 'No deadline'}
                      </span>
                    </div>
                  </div>

                  {/* Payment & Upload Status Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] px-1">
                      <span className="text-gray-500">Payment:</span>
                      <span className={`font-semibold ${job.paymentStatus === 'Paid' ? 'text-emerald-600 dark:text-emerald-400' : job.paymentStatus === 'Partially Paid' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {job.paymentStatus} ({formatCurrency(job.amountPaid || 0, job.currency)} paid)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] px-1">
                      <span className="text-gray-500">Deliverables:</span>
                      {job.deliveryStatus === 'Released' || job.deliveryStatus === 'Sent' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 size={12} /> Released
                        </span>
                      ) : job.deliveryStatus === 'Downloaded' ? (
                        <span className="text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                          <CheckCheck size={12} /> Downloaded
                        </span>
                      ) : (job.fileIds?.length || 0) > 0 ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                          <PackageCheck size={12} /> {job.fileIds!.length} {job.fileIds!.length === 1 ? 'file' : 'files'} ready
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1">
                          No files uploaded
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Release Delivery Button on Card */}
                  <div className="pt-2">
                    {job.deliveryStatus === 'Released' || job.deliveryStatus === 'Sent' ? (
                      <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate">
                          <CheckCircle2 size={12} className="shrink-0" />
                          Delivery Released
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePromptRelease(job, true)}
                          icon={<RotateCcw size={11} />}
                          className="text-[11px] h-6 px-2 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                          title="Resend delivery link email to client"
                        >
                          Resend
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handlePromptRelease(job, false)}
                        icon={<Send size={13} />}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 h-8"
                        title="Release delivery files and email secure link to client"
                      >
                        Release Delivery
                      </Button>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div className="flex items-center gap-1">
                    {job.status !== 'Completed' && (
                      <button
                        onClick={() => handleUpdateStatus(job, 'Completed')}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                        title="Mark Completed"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setViewingJob(job)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => openEditModal(job)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                      title="Edit Job"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                  <button
                    onClick={() => setDeletingJob(job)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Delete Job"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit Quick Job Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingJob ? 'Edit Quick Job' : 'Create New Quick Job'}
        size="lg"
      >
        <form onSubmit={handleSaveJob} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Client <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(true)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  + Add New Client
                </button>
              </div>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData((prev) => ({ ...prev, clientId: e.target.value }))}
                className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.company ? `(${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Selection */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Service Catalog Item
              </label>
              <select
                value={formData.serviceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Custom Job (No Catalog Service)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.defaultPrice, s.currency)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Textarea
            label="Job Description & Scope"
            value={formData.jobDescription}
            onChange={(e) => setFormData((prev) => ({ ...prev, jobDescription: e.target.value }))}
            placeholder="Describe the deliverables, specifications, or photoshoot details..."
            rows={3}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Agreed Price"
              type="number"
              step="0.01"
              value={formData.originalAgreedPrice}
              onChange={(e) => setFormData((prev) => ({ ...prev, originalAgreedPrice: parseFloat(e.target.value) || 0 }))}
              required
            />
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
              required
            />
            <Input
              label="Deadline / Due Date"
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Amount Paid So Far"
              type="number"
              step="0.01"
              value={formData.amountPaid}
              onChange={(e) => setFormData((prev) => ({ ...prev, amountPaid: parseFloat(e.target.value) || 0 }))}
            />
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Job Status
              </label>
              <select
                value={formData.status}
                onChange={(e: any) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
                className="w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="GHS">GHS (₵)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <Textarea
            label="Internal Notes & Instructions"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Any extra instructions, camera settings, editing notes..."
            rows={2}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button type="button" variant="ghost" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editingJob ? 'Update Quick Job' : 'Create Quick Job'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Add Client Modal */}
      <Modal
        isOpen={isNewClientModalOpen}
        onClose={() => setIsNewClientModalOpen(false)}
        title="Quick Add Client"
        size="sm"
      >
        <form onSubmit={handleCreateClientQuick} className="space-y-4">
          <Input
            label="Full Name"
            value={newClientData.fullName}
            onChange={(e) => setNewClientData((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Client Name"
            required
          />
          <Input
            label="Email Address"
            type="email"
            value={newClientData.email}
            onChange={(e) => setNewClientData((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="client@example.com"
          />
          <Input
            label="Phone Number"
            value={newClientData.phone}
            onChange={(e) => setNewClientData((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+233..."
          />
          <Input
            label="Company / Brand"
            value={newClientData.company}
            onChange={(e) => setNewClientData((prev) => ({ ...prev, company: e.target.value }))}
            placeholder="Company Ltd"
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsNewClientModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={isSubmitting}>
              Save Client
            </Button>
          </div>
        </form>
      </Modal>

      {/* View Details Modal */}
      {(() => {
        const activeViewingJob = viewingJob ? (quickJobs.find((j) => j.id === viewingJob.id) || viewingJob) : null
        if (!activeViewingJob) return null
        return (
          <Modal
            isOpen={!!activeViewingJob}
            onClose={() => setViewingJob(null)}
            title="Quick Job Details"
            size="md"
          >
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                    {activeViewingJob.serviceSnapshot?.name || 'Quick Service Job'}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                    {activeViewingJob.jobDescription}
                  </h3>
                </div>
                <Badge variant={statusColorMap[activeViewingJob.status]?.badgeVariant || 'default'}>
                  {activeViewingJob.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                <div>
                  <span className="text-gray-400 block mb-0.5">Client</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{activeViewingJob.clientName}</span>
                  {activeViewingJob.clientEmail && <span className="text-[11px] text-gray-500 block">{activeViewingJob.clientEmail}</span>}
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Deadline</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {activeViewingJob.deadline ? formatDate(activeViewingJob.deadline) : 'No deadline'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-xl">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Agreed Price</span>
                  <span className="font-bold text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {formatCurrency(activeViewingJob.originalAgreedPrice, activeViewingJob.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Amount Paid</span>
                  <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatCurrency(activeViewingJob.amountPaid || 0, activeViewingJob.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Outstanding</span>
                  <span className="font-bold text-sm text-rose-600 dark:text-rose-400 font-mono">
                    {formatCurrency(activeViewingJob.outstandingBalance || 0, activeViewingJob.currency)}
                  </span>
                </div>
              </div>

              {activeViewingJob.notes && (
                <div>
                  <span className="text-gray-400 block mb-1 font-semibold">Notes & Instructions</span>
                  <p className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {activeViewingJob.notes}
                  </p>
                </div>
              )}

              <QuickJobPaymentDelivery 
                job={activeViewingJob}
                onUpdate={async (updatedData) => {
                  await updateDocument(COLLECTIONS.QUICK_JOBS, activeViewingJob.id, updatedData)
                  setViewingJob((prev) => prev ? { ...prev, ...updatedData } : null)
                }}
              />

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const j = activeViewingJob
                    setViewingJob(null)
                    openEditModal(j)
                  }}
                >
                  Edit Job
                </Button>
                <Button size="sm" onClick={() => setViewingJob(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* Delete Confirmation Modal */}
      {deletingJob && (
        <Modal
          isOpen={!!deletingJob}
          onClose={() => setDeletingJob(null)}
          title="Delete Quick Job"
          size="sm"
        >
          <div className="space-y-4 text-xs">
            <p className="text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this quick job for <strong className="text-gray-900 dark:text-gray-100">{deletingJob.clientName}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeletingJob(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDeleteJob}
                loading={isSubmitting}
              >
                Delete Job
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Release Delivery Confirmation Modal */}
      {releasingJob && (
        <Modal
          isOpen={!!releasingJob}
          onClose={() => !isReleasingDirect && setReleasingJob(null)}
          title={isResendModal ? 'Resend Delivery Email' : 'Release Delivery'}
          size="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-950 dark:text-indigo-200 space-y-2">
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                {isResendModal
                  ? `Resend delivery link to ${releasingJob.clientName}?`
                  : `Release delivery to ${releasingJob.clientName} and send the secure delivery link to their email?`}
              </p>
              <div className="text-gray-600 dark:text-gray-300 space-y-1 text-xs">
                <p>
                  <strong>Client:</strong> {releasingJob.clientName}
                </p>
                <p>
                  <strong>Recipient Email:</strong> {releasingJob.clientEmail || 'Client registered email address'}
                </p>
                <p>
                  <strong>Job:</strong> {releasingJob.jobDescription}
                </p>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-[11px] leading-relaxed pt-1 border-t border-indigo-100 dark:border-indigo-900/50">
                {isResendModal
                  ? 'This will resend the client delivery portal notification email with their active download link.'
                  : "This will activate the client's secure delivery portal and dispatch an email via Brevo with a direct button to access and download their files."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReleasingJob(null)}
                disabled={isReleasingDirect}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isReleasingDirect}
                disabled={isReleasingDirect}
                onClick={handleExecuteRelease}
                icon={<Send size={13} />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {isResendModal ? 'Resend & Send Email' : 'Release & Send Email'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
