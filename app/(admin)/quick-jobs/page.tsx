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
  Package as PackageIcon,
  PlusCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
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
import type {
  QuickJob,
  QuickJobStatus,
  Service,
  Client,
  Package,
  AddOn,
  QuickJobPackageSnapshot,
  QuickJobAddOnSnapshot,
} from '@/lib/types'
import { OFFICIAL_CATEGORIES } from '@/lib/services/catalogueData'
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
  const [packages, setPackages] = useState<Package[]>([])
  const [addOns, setAddOns] = useState<AddOn[]>([])
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

  // Enhanced Form State supporting Catalogue & Add-Ons
  const [formData, setFormData] = useState({
    clientId: '',
    selectedCategory: '',
    serviceId: '',
    packageId: '',
    packagePrice: 0,
    packagePricingType: 'fixed',
    selectedAddOnIds: [] as string[],
    jobDescription: '',
    originalAgreedPrice: 0,
    depositType: 'percentage' as 'percentage' | 'fixed' | 'none',
    depositValue: 50,
    depositPaid: 0, // Deposit Amount
    amountPaid: 0,
    quantity: 1,
    deadline: '',
    notes: '',
    status: 'Pending' as QuickJobStatus,
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
      }
    } finally {
      setIsReleasingDirect(false)
    }
  }

  // Real-time Subscriptions
  useEffect(() => {
    let isMounted = true

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

    const unsubPackages = subscribeToCollection<Package>(
      COLLECTIONS.PACKAGES,
      [],
      (data) => {
        if (isMounted) setPackages(data)
      }
    )

    const unsubAddOns = subscribeToCollection<AddOn>(
      COLLECTIONS.ADD_ONS,
      [],
      (data) => {
        if (isMounted) setAddOns(data)
      }
    )

    const unsubClients = subscribeToCollection<Client>(
      COLLECTIONS.CLIENTS,
      [],
      (data) => {
        if (isMounted) setClients(data)
      }
    )

    // Initial fetch fallback
    Promise.all([
      getDocuments<QuickJob>(COLLECTIONS.QUICK_JOBS),
      getDocuments<Service>(COLLECTIONS.SERVICES),
      getDocuments<Package>(COLLECTIONS.PACKAGES),
      getDocuments<AddOn>(COLLECTIONS.ADD_ONS),
      getDocuments<Client>(COLLECTIONS.CLIENTS),
    ])
      .then(([jData, sData, pData, aData, cData]) => {
        if (isMounted) {
          if (jData && jData.length > 0) setQuickJobs(jData)
          if (sData && sData.length > 0) setServices(sData)
          if (pData && pData.length > 0) setPackages(pData)
          if (aData && aData.length > 0) setAddOns(aData)
          if (cData && cData.length > 0) setClients(cData)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
      unsubJobs()
      unsubServices()
      unsubPackages()
      unsubAddOns()
      unsubClients()
    }
  }, [])

  // Calculate sum of selected add-ons
  const getSelectedAddOnsTotal = (selectedIds: string[]) => {
    return addOns
      .filter((a) => selectedIds.includes(a.id))
      .reduce((sum, item) => sum + (Number(item.price) || 0), 0)
  }

  // Form Reset
  const resetForm = () => {
    setFormData({
      clientId: clients[0]?.id || '',
      selectedCategory: '',
      serviceId: '',
      packageId: '',
      packagePrice: 0,
      packagePricingType: 'fixed',
      selectedAddOnIds: [],
      jobDescription: '',
      originalAgreedPrice: 0,
      depositType: 'percentage',
      depositValue: 50,
      depositPaid: 0,
      amountPaid: 0,
      quantity: 1,
      deadline: '',
      notes: '',
      status: 'Pending',
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
    const matchedPkg = packages.find((p) => p.id === job.packageId)
    const existingAddOnIds = job.selectedAddOns ? job.selectedAddOns.map((a) => a.id || '') : []

    setFormData({
      clientId: job.clientId || '',
      selectedCategory: job.serviceSnapshot?.category || matchedPkg?.category || '',
      serviceId: job.serviceId || '',
      packageId: job.packageId || '',
      packagePrice: job.packageSnapshot?.price || matchedPkg?.price || 0,
      packagePricingType: job.packageSnapshot?.pricingType || matchedPkg?.pricingType || 'fixed',
      selectedAddOnIds: existingAddOnIds.filter(Boolean),
      jobDescription: job.jobDescription || '',
      originalAgreedPrice: job.originalAgreedPrice || 0,
      depositType: job.packageSnapshot?.depositType || 'percentage',
      depositValue: job.packageSnapshot?.depositValue ?? 50,
      depositPaid: job.depositPaid || 0,
      amountPaid: job.amountPaid || 0,
      quantity: job.quantity || 1,
      deadline: job.deadline || '',
      notes: job.notes || '',
      status: job.status || 'Pending',
      currency: job.currency || 'GHS',
    })
    setIsFormModalOpen(true)
  }

  // Handle Category selection
  const handleCategoryChange = (category: string) => {
    setFormData((prev) => {
      // Find matching service if any
      const matchingSvc = services.find(
        (s) => s.category.toLowerCase() === category.toLowerCase() || s.name.toLowerCase() === category.toLowerCase()
      )
      return {
        ...prev,
        selectedCategory: category,
        serviceId: matchingSvc ? matchingSvc.id : prev.serviceId,
        packageId: '',
        packagePrice: 0,
      }
    })
  }

  // Handle Package Selection
  const handlePackageSelect = (packageId: string) => {
    if (!packageId) {
      setFormData((prev) => {
        const addOnsTotal = getSelectedAddOnsTotal(prev.selectedAddOnIds)
        return {
          ...prev,
          packageId: '',
          packagePrice: 0,
          packagePricingType: 'fixed',
          originalAgreedPrice: addOnsTotal,
        }
      })
      return
    }

    const pkg = packages.find((p) => p.id === packageId)
    if (!pkg) return

    setFormData((prev) => {
      const addOnsTotal = getSelectedAddOnsTotal(prev.selectedAddOnIds)
      const basePrice = (pkg.price || 0) * (prev.quantity || 1)
      const finalPrice = basePrice + addOnsTotal

      // Calculate deposit
      const depType = pkg.depositType || 'percentage'
      const depVal = pkg.depositValue ?? 50
      let requiredDeposit = 0
      if (depType === 'percentage') {
        requiredDeposit = Math.round((finalPrice * depVal) / 100)
      } else if (depType === 'fixed') {
        requiredDeposit = depVal
      }

      // Auto-populate description if empty or default
      const inclusionsText = pkg.inclusions && pkg.inclusions.length > 0 ? pkg.inclusions.slice(0, 3).join(', ') : ''
      const defaultDesc = `${pkg.title || pkg.name}${inclusionsText ? ` (${inclusionsText})` : ''}`
      const jobDescription = !prev.jobDescription.trim() ? defaultDesc : prev.jobDescription

      return {
        ...prev,
        packageId,
        packagePrice: pkg.price || 0,
        packagePricingType: pkg.pricingType || 'fixed',
        selectedCategory: pkg.category || prev.selectedCategory,
        serviceId: pkg.serviceId || prev.serviceId,
        jobDescription,
        originalAgreedPrice: finalPrice,
        depositType: depType,
        depositValue: depVal,
        depositPaid: requiredDeposit,
      }
    })
  }

  // Handle Add-on Toggle
  const handleToggleAddOn = (addonId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedAddOnIds.includes(addonId)
      const newAddOnIds = exists
        ? prev.selectedAddOnIds.filter((id) => id !== addonId)
        : [...prev.selectedAddOnIds, addonId]

      const addOnsTotal = getSelectedAddOnsTotal(newAddOnIds)
      const basePackagePrice = (prev.packagePrice || 0) * (prev.quantity || 1)
      const finalPrice = basePackagePrice + addOnsTotal

      // Recalculate deposit
      let requiredDeposit = prev.depositPaid
      if (prev.depositType === 'percentage') {
        requiredDeposit = Math.round((finalPrice * (prev.depositValue || 50)) / 100)
      } else if (prev.depositType === 'none') {
        requiredDeposit = 0
      }

      return {
        ...prev,
        selectedAddOnIds: newAddOnIds,
        originalAgreedPrice: finalPrice,
        depositPaid: requiredDeposit,
      }
    })
  }

  // Handle Admin Manual Agreed Price Override
  const handlePriceOverride = (newPrice: number) => {
    setFormData((prev) => {
      let requiredDeposit = prev.depositPaid
      if (prev.depositType === 'percentage') {
        requiredDeposit = Math.round((newPrice * (prev.depositValue || 50)) / 100)
      }
      return {
        ...prev,
        originalAgreedPrice: newPrice,
        depositPaid: requiredDeposit,
      }
    })
  }

  // Handle Quantity Change
  const handleQuantityChange = (qty: number) => {
    const safeQty = Math.max(1, qty)
    setFormData((prev) => {
      const addOnsTotal = getSelectedAddOnsTotal(prev.selectedAddOnIds)
      const basePrice = (prev.packagePrice || 0) * safeQty
      const finalPrice = basePrice + addOnsTotal

      let requiredDeposit = prev.depositPaid
      if (prev.depositType === 'percentage') {
        requiredDeposit = Math.round((finalPrice * (prev.depositValue || 50)) / 100)
      }

      return {
        ...prev,
        quantity: safeQty,
        originalAgreedPrice: finalPrice,
        depositPaid: requiredDeposit,
      }
    })
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
      const createdClient: Client = {
        id: newId,
        ...newClientPayload,
        createdAt: now as any,
        updatedAt: now as any,
        createdBy: 'admin',
      }
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
    const selectedPkg = packages.find((p) => p.id === formData.packageId)

    // Build Package Snapshot so historical job data is protected
    const packageSnapshot: QuickJobPackageSnapshot | undefined = selectedPkg
      ? {
          id: selectedPkg.id,
          title: selectedPkg.title || selectedPkg.name || '',
          price: selectedPkg.price,
          pricingType: selectedPkg.pricingType || 'fixed',
          inclusions: selectedPkg.inclusions || selectedPkg.whatsIncluded?.map((i) => i.text) || [],
          depositType: selectedPkg.depositType || formData.depositType,
          depositValue: selectedPkg.depositValue ?? formData.depositValue,
        }
      : undefined

    // Build AddOns Snapshot
    const selectedAddOns: QuickJobAddOnSnapshot[] = addOns
      .filter((a) => formData.selectedAddOnIds.includes(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        pricingType: a.pricingType,
      }))

    const serviceSnapshot = selectedSvc
      ? {
          id: selectedSvc.id,
          name: selectedSvc.name,
          category: String(selectedSvc.category),
          description: selectedSvc.description || '',
          defaultPrice: selectedSvc.defaultPrice,
        }
      : formData.selectedCategory
      ? {
          id: 'cat_' + formData.selectedCategory,
          name: formData.selectedCategory,
          category: formData.selectedCategory,
          description: '',
          defaultPrice: 0,
        }
      : undefined

    const price = Number(formData.originalAgreedPrice) || 0
    const amtPaid = Number(formData.amountPaid) || 0
    const outstanding = Math.max(0, price - amtPaid)
    const paymentStatus = amtPaid >= price ? 'Paid' : amtPaid > 0 ? 'Partially Paid' : 'Unpaid'

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const payload: Partial<QuickJob> = {
        clientId: formData.clientId,
        clientName: selectedClient?.fullName || 'Walk-in Client',
        clientEmail: selectedClient?.email || '',
        clientPhone: selectedClient?.phone || '',
        serviceId: formData.serviceId || '',
        serviceSnapshot,
        packageId: formData.packageId || '',
        packageTitle: selectedPkg?.title || selectedPkg?.name || '',
        packageSnapshot,
        selectedAddOns,
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
          deliveryStatus: 'Not Ready' as const,
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

  // Packages filtered for modal dropdown
  const filteredPackagesForModal = packages.filter((p) => {
    if (!formData.selectedCategory || formData.selectedCategory === 'custom') return true
    const pCat = (p.category || p.serviceName || '').trim().toLowerCase()
    return pCat === formData.selectedCategory.trim().toLowerCase()
  })

  // Add-ons available for modal
  const availableAddOnsForModal = addOns.filter((a) => {
    if (a.active === false) return false
    if (!a.category || a.category === 'General') return true
    if (!formData.selectedCategory) return true
    return a.category.toLowerCase() === formData.selectedCategory.toLowerCase()
  })

  // Filter Quick Jobs on main view
  const filteredJobs = quickJobs.filter((job) => {
    const searchLower = search.toLowerCase()
    const matchesSearch =
      job.clientName.toLowerCase().includes(searchLower) ||
      job.jobDescription.toLowerCase().includes(searchLower) ||
      (job.packageTitle && job.packageTitle.toLowerCase().includes(searchLower)) ||
      (job.serviceSnapshot?.name && job.serviceSnapshot.name.toLowerCase().includes(searchLower))

    const matchesStatus = statusFilter === 'all' ? true : job.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const selectedPkg = packages.find((p) => p.id === formData.packageId)
  const addOnsTotal = getSelectedAddOnsTotal(formData.selectedAddOnIds)

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Quick Jobs"
        subtitle="Manage fast turnaround deliverables, packages, and client links."
        action={
          <Button onClick={openAddModal} variant="primary" icon={<Plus size={18} />}>
            New Quick Job
          </Button>
        }
      />

      {/* Controls & Filter */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search by client, package, or job description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} className="text-gray-400" />}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <Filter size={14} />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-300 outline-none"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Quick Jobs */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <Spinner size="lg" />
          <p className="text-xs text-gray-500">Loading jobs...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Zap size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {search || statusFilter !== 'all' ? 'No quick jobs match your filter' : 'No quick jobs created yet'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Create a job by picking a client, service package, and add-ons to generate instant payments and delivery links.
            </p>
          </div>
          <Button onClick={openAddModal} variant="primary" size="sm" icon={<Plus size={14} />}>
            Create Quick Job
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map((job) => {
            const stColor = statusColorMap[job.status] || statusColorMap['Pending']
            const packageLabel = job.packageSnapshot?.title || job.packageTitle

            return (
              <div
                key={job.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 transition-all p-5 flex flex-col justify-between shadow-xs hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Top Category & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40 truncate max-w-[150px]">
                          {job.serviceSnapshot?.category || 'Service'}
                        </span>
                        {packageLabel && (
                          <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded flex items-center gap-1 truncate max-w-[140px]">
                            <PackageIcon size={10} className="text-indigo-500 shrink-0" />
                            <span className="truncate">{packageLabel}</span>
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
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

                  {/* Pricing & Deadline Box */}
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-2.5 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-medium">Agreed Price</span>
                      <span className="font-bold text-gray-900 dark:text-gray-100 font-mono text-sm">
                        {formatCurrency(job.originalAgreedPrice, job.currency)}
                      </span>
                      {job.selectedAddOns && job.selectedAddOns.length > 0 && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block">
                          +{job.selectedAddOns.length} add-on{job.selectedAddOns.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-medium">Deadline</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {job.deadline ? formatDate(job.deadline) : 'No deadline'}
                      </span>
                    </div>
                  </div>

                  {/* Payment & Deliverables Status */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] px-0.5">
                      <span className="text-gray-500">Payment:</span>
                      <span
                        className={`font-semibold ${
                          job.paymentStatus === 'Paid'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : job.paymentStatus === 'Partially Paid'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {job.paymentStatus} ({formatCurrency(job.amountPaid || 0, job.currency)})
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] px-0.5">
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
                          <PackageCheck size={12} /> {job.fileIds!.length} ready
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">No files uploaded</span>
                      )}
                    </div>
                  </div>

                  {/* Action Bar / Release Button */}
                  <div className="pt-2">
                    {job.deliveryStatus === 'Released' || job.deliveryStatus === 'Sent' ? (
                      <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate">
                          <CheckCircle2 size={12} className="shrink-0" />
                          Delivery Active
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePromptRelease(job, true)}
                          icon={<RotateCcw size={11} />}
                          className="text-[11px] h-6 px-2 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"
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
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-8"
                      >
                        Release Delivery
                      </Button>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingJob(job)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                      title="View Details & Payments"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(job)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      title="Edit Job"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeletingJob(job)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Delete Job"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE / EDIT QUICK JOB (With Catalogue & Add-Ons)  */}
      {/* ────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingJob ? 'Edit Quick Job' : 'Create Quick Job'}
        size="lg"
      >
        <form onSubmit={handleSaveJob} className="space-y-4">
          {/* Step 1: Client Selection & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Client *
                </label>
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(true)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Add Client
                </button>
              </div>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData((prev) => ({ ...prev, clientId: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Service Category
              </label>
              <select
                value={formData.selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                <option value="">All Categories</option>
                {OFFICIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="custom">Custom / Other</option>
              </select>
            </div>
          </div>

          {/* Step 2: Package Selection from Catalogue */}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-900 dark:text-gray-100">
                Package Catalogue Item
              </label>
              {formData.packageId && (
                <button
                  type="button"
                  onClick={() => handlePackageSelect('')}
                  className="text-[11px] text-gray-400 hover:text-rose-500 transition-colors"
                >
                  Clear Package
                </button>
              )}
            </div>

            <select
              value={formData.packageId}
              onChange={(e) => handlePackageSelect(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
            >
              <option value="">No predefined package (Custom pricing)</option>
              {filteredPackagesForModal.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.title || pkg.name} — {pkg.pricingType === 'starting_from' ? 'From ' : ''}
                  {formatCurrency(pkg.price)}
                </option>
              ))}
            </select>

            {/* Selected Package Details Pill */}
            {selectedPkg && (
              <div className="pt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-300 font-semibold">
                  <span>{selectedPkg.title || selectedPkg.name}</span>
                  <span>
                    {selectedPkg.pricingType === 'starting_from' ? 'From ' : ''}
                    {formatCurrency(selectedPkg.price)}
                  </span>
                </div>
                {selectedPkg.inclusions && selectedPkg.inclusions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selectedPkg.inclusions.map((inc, i) => (
                      <span
                        key={i}
                        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded text-[10px]"
                      >
                        ✓ {inc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Add-Ons Selector */}
          {availableAddOnsForModal.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Add-Ons ({availableAddOnsForModal.length} available)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800">
                {availableAddOnsForModal.map((addon) => {
                  const isChecked = formData.selectedAddOnIds.includes(addon.id)
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => handleToggleAddOn(addon.id)}
                      className={`p-2 rounded-lg border text-left text-xs transition-all flex items-center justify-between gap-2 ${
                        isChecked
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-semibold'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      <span className="truncate">{addon.name}</span>
                      <span className="shrink-0 text-[11px] font-mono text-gray-500">
                        +{formatCurrency(addon.price)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 4: Job Description */}
          <Textarea
            label="Job Description & Scope *"
            value={formData.jobDescription}
            onChange={(e) => setFormData((prev) => ({ ...prev, jobDescription: e.target.value }))}
            placeholder="Describe deliverables, specs, or photoshoot requirements..."
            rows={2}
            required
          />

          {/* Step 5: Final Agreed Price, Deposit & Balance */}
          <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 block">
              Pricing, Deposit &amp; Balance Breakdown
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Input
                  label="Final Agreed Price (GH₵) *"
                  type="number"
                  step="0.01"
                  value={formData.originalAgreedPrice}
                  onChange={(e) => handlePriceOverride(parseFloat(e.target.value) || 0)}
                  required
                />
                {formData.packageId && (
                  <span className="text-[10px] text-gray-400 mt-0.5 block truncate">
                    Base: {formatCurrency(formData.packagePrice)}
                    {addOnsTotal > 0 ? ` + ${formatCurrency(addOnsTotal)} add-ons` : ''}
                  </span>
                )}
              </div>

              <div>
                <Input
                  label="Required Deposit (GH₵)"
                  type="number"
                  step="0.01"
                  value={formData.depositPaid}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      depositPaid: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                <span className="text-[10px] text-gray-500 mt-0.5 block">
                  {formData.depositType === 'percentage'
                    ? `${formData.depositValue}% of agreed price`
                    : 'Fixed or manual deposit'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Balance on Completion
                </label>
                <div className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center font-mono font-bold text-xs text-gray-900 dark:text-gray-100">
                  {formatCurrency(
                    Math.max(0, formData.originalAgreedPrice - (formData.depositPaid || 0)),
                    formData.currency
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Step 6: Deadline, Quantity, Status, Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
              required
            />
            <Input
              label="Deadline / Target Date"
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
            />
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Job Status
              </label>
              <select
                value={formData.status}
                onChange={(e: any) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-medium text-gray-800 dark:text-gray-200 outline-none"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Textarea
            label="Internal Notes (Optional)"
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Technical details, gear specifications, editing instructions..."
            rows={2}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
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
            label="Full Name *"
            value={newClientData.fullName}
            onChange={(e) => setNewClientData((prev) => ({ ...prev, fullName: e.target.value }))}
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
        const activeViewingJob = viewingJob
          ? quickJobs.find((j) => j.id === viewingJob.id) || viewingJob
          : null
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
                    {activeViewingJob.serviceSnapshot?.category || 'Service'}
                  </span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                    {activeViewingJob.jobDescription}
                  </h3>
                </div>
                <Badge variant={statusColorMap[activeViewingJob.status]?.badgeVariant || 'default'}>
                  {activeViewingJob.status}
                </Badge>
              </div>

              {/* Package & Addons Snapshot banner */}
              {(activeViewingJob.packageSnapshot || activeViewingJob.packageTitle) && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-gray-900 dark:text-gray-100">
                    <span className="flex items-center gap-1.5">
                      <PackageIcon size={14} className="text-indigo-600" />
                      <span>{activeViewingJob.packageSnapshot?.title || activeViewingJob.packageTitle}</span>
                    </span>
                    <span className="font-mono">
                      {formatCurrency(activeViewingJob.packageSnapshot?.price || 0, activeViewingJob.currency)}
                    </span>
                  </div>

                  {activeViewingJob.selectedAddOns && activeViewingJob.selectedAddOns.length > 0 && (
                    <div className="pt-1 border-t border-gray-200 dark:border-gray-700/60 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400">Selected Add-Ons</span>
                      <div className="flex flex-wrap gap-1">
                        {activeViewingJob.selectedAddOns.map((addon, idx) => (
                          <span
                            key={idx}
                            className="bg-white dark:bg-gray-900 px-2 py-0.5 rounded text-[11px] border border-gray-200 dark:border-gray-700"
                          >
                            {addon.name} (+{formatCurrency(addon.price, activeViewingJob.currency)})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Client & Deadline */}
              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                <div>
                  <span className="text-gray-400 block mb-0.5">Client</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {activeViewingJob.clientName}
                  </span>
                  {activeViewingJob.clientEmail && (
                    <span className="text-[11px] text-gray-500 block">{activeViewingJob.clientEmail}</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Deadline</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {activeViewingJob.deadline ? formatDate(activeViewingJob.deadline) : 'No deadline'}
                  </span>
                </div>
              </div>

              {/* Financial Box */}
              <div className="grid grid-cols-3 gap-3 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-xl">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Agreed Price</span>
                  <span className="font-bold text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {formatCurrency(activeViewingJob.originalAgreedPrice, activeViewingJob.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Deposit Required</span>
                  <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 font-mono">
                    {formatCurrency(activeViewingJob.depositPaid || 0, activeViewingJob.currency)}
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
                  <span className="text-gray-400 block mb-1 font-semibold">Notes &amp; Instructions</span>
                  <p className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {activeViewingJob.notes}
                  </p>
                </div>
              )}

              {/* Payment & Delivery Manager Integration */}
              <QuickJobPaymentDelivery
                job={activeViewingJob}
                onUpdate={async (updatedData) => {
                  await updateDocument(COLLECTIONS.QUICK_JOBS, activeViewingJob.id, updatedData)
                  setViewingJob((prev) => (prev ? { ...prev, ...updatedData } : null))
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
              Are you sure you want to delete this quick job for{' '}
              <strong className="text-gray-900 dark:text-gray-100">{deletingJob.clientName}</strong>? This action
              cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDeletingJob(null)}>
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
                  <strong>Recipient Email:</strong>{' '}
                  {releasingJob.clientEmail || 'Client registered email address'}
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
