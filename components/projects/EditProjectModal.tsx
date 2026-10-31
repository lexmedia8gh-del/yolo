'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  DollarSign,
  FileText,
  ShieldAlert,
} from 'lucide-react'
import { Modal, Button, Input, Textarea } from '@/components/ui/index'
import {
  COLLECTIONS,
  getDocuments,
  updateDocument,
  addDocument,
} from '@/lib/firebase/firestore'
import { where } from '@/lib/firebase/firestore'
import type {
  Project,
  ProjectStatus,
  ProjectPriority,
  PaymentStatus,
  Client,
  Service,
  Package,
  Payment,
  ClientLink,
} from '@/lib/types'
import { formatCurrency, resolveDateValue, formatActionError, fetchWithTimeout } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
  project: Project
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  payments?: Payment[]
  links?: ClientLink[]
}

const PROJECT_STATUSES: ProjectStatus[] = [
  'Inquiry',
  'Awaiting Payment',
  'Paid',
  'In Progress',
  'Review',
  'Revision',
  'Completed',
  'Cancelled',
]

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

function toDateInputString(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return val.trim()
  }
  const resolved = resolveDateValue(val as any)
  if (!resolved) return ''
  const year = resolved.getFullYear()
  const month = String(resolved.getMonth() + 1).padStart(2, '0')
  const day = String(resolved.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function EditProjectModal({
  project,
  isOpen,
  onClose,
  onSuccess,
  payments,
  links,
}: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [projectPayments, setProjectPayments] = useState<Payment[]>(payments || [])
  const [projectLinks, setProjectLinks] = useState<ClientLink[]>(links || [])

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: '',
    serviceId: '',
    packageId: '',
    price: '0',
    depositAmount: '0',
    startDate: '',
    deadline: '',
    status: 'In Progress' as ProjectStatus,
    priority: 'medium' as ProjectPriority,
    progress: 0,
    deliverables: '',
    notes: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmPriceChange, setConfirmPriceChange] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Populate form whenever modal opens or target project changes
  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false)
      return
    }
    if (!project) return
    setFormData({
      name: project.name || '',
      description: project.description || '',
      clientId: project.clientId || '',
      serviceId: project.serviceId || '',
      packageId: project.packageId || '',
      price: String(project.price ?? 0),
      depositAmount: String(project.depositAmount ?? 0),
      startDate: toDateInputString(project.startDate),
      deadline: toDateInputString(project.deadline),
      status: project.status || 'In Progress',
      priority: project.priority || 'medium',
      progress: Number(project.progress ?? 0),
      deliverables: project.deliverables || '',
      notes: project.notes || '',
    })
    setErrors({})
    setConfirmPriceChange(false)
  }, [project, isOpen])

  // Load reference options & payment records when modal opens
  useEffect(() => {
    if (!isOpen || !project?.id) return

    let active = true
    Promise.all([
      getDocuments<Client>(COLLECTIONS.CLIENTS),
      getDocuments<Service>(COLLECTIONS.SERVICES),
      getDocuments<Package>(COLLECTIONS.PACKAGES),
      payments
        ? Promise.resolve(payments)
        : getDocuments<Payment>(COLLECTIONS.PAYMENTS, [where('projectId', '==', project.id)]),
      links
        ? Promise.resolve(links)
        : getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [where('projectId', '==', project.id)]),
    ])
      .then(([cliList, svcList, pkgList, pmtList, lnkList]) => {
        if (!active) return
        setClients(cliList || [])
        setServices(svcList || [])
        setPackages(pkgList || [])
        setProjectPayments(pmtList || [])
        setProjectLinks(lnkList || [])
      })
      .catch((err) => {
        console.warn('Error loading project edit options:', err)
      })

    return () => {
      active = false
    }
  }, [isOpen, project?.id, payments, links])

  // Calculate verified amount paid from payment records + stored project.amountPaid
  const amountPaid = useMemo(() => {
    const storedPaid = Number(project?.amountPaid || 0)
    const matchingPayments = projectPayments.filter(
      (p) => p.projectId === project.id && (!p.status || p.status === 'success')
    )
    const sumPayments = matchingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    return Math.max(storedPaid, sumPayments)
  }, [project?.amountPaid, project?.id, projectPayments])

  const parsedPrice = Number(formData.price)
  const validNumericPrice = Number.isFinite(parsedPrice) ? parsedPrice : 0
  const parsedDeposit = Number(formData.depositAmount)
  const validNumericDeposit = Number.isFinite(parsedDeposit) ? parsedDeposit : 0

  const newBalance = Math.max(0, Number((validNumericPrice - amountPaid).toFixed(2)))
  const priceChanged = validNumericPrice !== Number(project.price || 0)
  const hasExistingPayments = amountPaid > 0 || projectPayments.some((p) => p.projectId === project.id)

  // Check if any active/pending payment links exceed the new balance
  const affectedPendingLinks = useMemo(() => {
    if (!priceChanged) return []
    return projectLinks.filter((l) => {
      if (l.projectId && l.projectId !== project.id) return false
      const isPending =
        l.status !== 'Paid' &&
        l.paymentStatus !== 'Paid' &&
        l.status !== 'Cancelled' &&
        l.status !== 'disabled' &&
        l.status !== 'Expired'
      return isPending && Number(l.amount || 0) > newBalance
    })
  }, [priceChanged, projectLinks, project.id, newBalance])

  // Filter packages matching selected service (plus current package if already assigned)
  const availablePackages = useMemo(() => {
    const selectedSvc = services.find((s) => s.id === formData.serviceId)
    return packages.filter((pkg) => {
      if (pkg.id === formData.packageId) return true
      if (pkg.status === 'inactive' || pkg.status === 'archived') return false
      if (!selectedSvc) return true
      if (pkg.serviceId === selectedSvc.id) return true
      if (pkg.serviceName && pkg.serviceName.toLowerCase() === selectedSvc.name.toLowerCase()) return true
      if (
        pkg.includedServices &&
        pkg.includedServices.some(
          (s) => s.toLowerCase() === selectedSvc.name.toLowerCase() || s === selectedSvc.id
        )
      ) {
        return true
      }
      return false
    })
  }, [packages, services, formData.serviceId, formData.packageId])

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      nextErrors.name = 'Project title is required.'
    }

    if (!formData.clientId) {
      nextErrors.clientId = 'Please select a client.'
    }

    if (formData.price.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      nextErrors.price = 'Enter a valid non-negative project total.'
    } else if (parsedPrice < amountPaid) {
      nextErrors.price = `Agreed total cannot be less than amount already paid (${formatCurrency(amountPaid, project.currency)}).`
    }

    if (formData.depositAmount.trim() !== '' && (!Number.isFinite(parsedDeposit) || parsedDeposit < 0)) {
      nextErrors.depositAmount = 'Deposit amount cannot be negative.'
    } else if (validNumericDeposit > validNumericPrice) {
      nextErrors.depositAmount = 'Deposit amount cannot exceed the agreed project total.'
    }

    if (
      formData.startDate &&
      formData.deadline &&
      new Date(formData.deadline).getTime() < new Date(formData.startDate).getTime()
    ) {
      nextErrors.deadline = 'Estimated delivery date cannot be earlier than start date.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!validateForm()) {
      toast.error('Please fix the highlighted fields before saving.')
      return
    }

    // Require explicit confirmation before changing agreed total when payments exist
    if (priceChanged && hasExistingPayments && !confirmPriceChange) {
      setConfirmPriceChange(true)
      return
    }

    setIsSubmitting(true)
    try {
      const selectedClient = clients.find((c) => c.id === formData.clientId)
      const selectedService = services.find((s) => s.id === formData.serviceId)
      const selectedPackage = packages.find((p) => p.id === formData.packageId)

      const resolvedClientName = selectedClient?.fullName || project.clientName
      const resolvedClientEmail = selectedClient?.email || project.clientEmail || ''
      const resolvedServiceName = selectedService?.name || project.serviceName || ''
      const resolvedPackageTitle = formData.packageId
        ? selectedPackage?.title || selectedPackage?.name || project.packageTitle || ''
        : ''

      const nextPaymentStatus: PaymentStatus =
        validNumericPrice > 0 && newBalance <= 0
          ? 'Paid'
          : amountPaid > 0
          ? 'Partially Paid'
          : 'Unpaid'

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        clientId: formData.clientId,
        clientName: resolvedClientName,
        clientEmail: resolvedClientEmail,
        serviceId: formData.serviceId,
        serviceName: resolvedServiceName,
        packageId: formData.packageId || '',
        packageTitle: resolvedPackageTitle,
        price: validNumericPrice,
        depositAmount: validNumericDeposit,
        startDate: formData.startDate || null,
        deadline: formData.deadline || null,
        status: formData.status,
        priority: formData.priority,
        progress: Math.min(100, Math.max(0, Number(formData.progress) || 0)),
        deliverables: formData.deliverables.trim(),
        notes: formData.notes.trim(),
      }

      // 1. Validate & authorize on server first
      const res = await fetchWithTimeout(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 15000,
      })

      const serverResult = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (serverResult.field) {
          setErrors((prev) => ({ ...prev, [serverResult.field]: serverResult.error }))
        }
        throw new Error(serverResult.error || 'Failed to update project.')
      }

      // 2. If server Admin SDK was not active in this runtime, persist via client store helper
      if (!serverResult.persistedOnServer) {
        await updateDocument(COLLECTIONS.PROJECTS, project.id, {
          ...payload,
          amountPaid,
          outstandingBalance: newBalance,
          paymentStatus: nextPaymentStatus,
          updatedBy: serverResult.updatedBy || 'admin',
        })

        // Keep linked invoice in sync without touching payment records
        if (project.invoiceId) {
          try {
            await updateDocument(COLLECTIONS.INVOICES, project.invoiceId, {
              projectName: payload.name,
              clientId: payload.clientId,
              clientName: resolvedClientName,
              clientEmail: resolvedClientEmail,
              serviceId: payload.serviceId,
              serviceName: resolvedServiceName,
              packageId: payload.packageId,
              packageTitle: resolvedPackageTitle,
              subtotal: validNumericPrice,
              total: validNumericPrice,
              depositAmount: validNumericDeposit,
              balanceDue: newBalance,
              dueDate: payload.deadline,
              status:
                validNumericPrice > 0 && newBalance <= 0
                  ? 'Paid'
                  : amountPaid > 0
                  ? 'Partially Paid'
                  : 'Pending',
            })
          } catch (invErr) {
            console.warn('Invoice sync warning:', invErr)
          }
        }

        try {
          await addDocument(COLLECTIONS.ACTIVITY_LOGS, {
            event: 'project_updated',
            description: `Updated project "${payload.name}" (${resolvedClientName})`,
            entityId: project.id,
            entityType: 'project',
            clientId: payload.clientId,
            clientName: resolvedClientName,
            performedByName: 'Admin',
          })
        } catch {}
      }

      if (affectedPendingLinks.length > 0 || serverResult.flaggedLinksCount > 0) {
        toast.success(
          'Project updated. Please review outstanding payment links that exceed the updated balance.',
          { duration: 5000 }
        )
      } else {
        toast.success('Project details saved successfully.')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Failed to update project:', err)
      toast.error(formatActionError(err, 'Failed to save project changes.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const currency = project.currency || 'GHS'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Project"
      subtitle={project.invoiceNumber ? `Ref: ${project.invoiceNumber}` : 'Update project details, schedule, and pricing'}
      size="lg"
      preventClose={isSubmitting}
    >
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Project Information */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <Briefcase size={15} className="text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Project Information
            </h3>
          </div>

          <Input
            label="Project Title"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value })
              if (errors.name) setErrors({ ...errors, name: '' })
            }}
            error={errors.name}
            placeholder="e.g. Acme Corp — Brand Identity"
            required
          />

          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Project scope, creative brief, or key objectives…"
            rows={2}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Client <span className="text-danger-500">*</span>
              </label>
              <select
                value={formData.clientId}
                onChange={(e) => {
                  setFormData({ ...formData, clientId: e.target.value })
                  if (errors.clientId) setErrors({ ...errors, clientId: '' })
                }}
                className="block w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                {project.clientId && !clients.some((c) => c.id === project.clientId) && (
                  <option value={project.clientId}>{project.clientName}</option>
                )}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
              {errors.clientId && <p className="text-xs text-danger-600">{errors.clientId}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Service / Category
              </label>
              <select
                value={formData.serviceId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    serviceId: e.target.value,
                  })
                }
                className="block w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                <option value="">Select service…</option>
                {project.serviceId && !services.some((s) => s.id === project.serviceId) && (
                  <option value={project.serviceId}>{project.serviceName}</option>
                )}
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Package
              </label>
              <select
                value={formData.packageId}
                onChange={(e) => setFormData({ ...formData, packageId: e.target.value })}
                className="block w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                <option value="">Custom / No Package</option>
                {project.packageId && !availablePackages.some((p) => p.id === project.packageId) && (
                  <option value={project.packageId}>{project.packageTitle || 'Assigned Package'}</option>
                )}
                {availablePackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.name} ({formatCurrency(p.price, p.currency || currency)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Pricing and Payment */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <DollarSign size={15} className="text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Pricing & Payment ({currency})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`Agreed Project Total (${currency})`}
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => {
                setFormData({ ...formData, price: e.target.value })
                setConfirmPriceChange(false)
                if (errors.price) setErrors({ ...errors, price: '' })
              }}
              error={errors.price}
              helperText={`Current saved total: ${formatCurrency(project.price || 0, currency)}`}
              required
            />

            <Input
              label={`Deposit Amount (${currency})`}
              type="number"
              step="0.01"
              min="0"
              value={formData.depositAmount}
              onChange={(e) => {
                setFormData({ ...formData, depositAmount: e.target.value })
                if (errors.depositAmount) setErrors({ ...errors, depositAmount: '' })
              }}
              error={errors.depositAmount}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Amount Paid to Date (Read-Only)
              </p>
              <p className="text-base font-bold text-emerald-600 mt-0.5">
                {formatCurrency(amountPaid, currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Recalculated Balance (Read-Only)
              </p>
              <p className="text-base font-bold text-rose-600 mt-0.5">
                {formatCurrency(newBalance, currency)}
              </p>
            </div>
          </div>

          {affectedPendingLinks.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Outstanding Payment Request Review Needed</p>
                <p className="mt-0.5">
                  {affectedPendingLinks.length} issued payment link
                  {affectedPendingLinks.length > 1 ? 's exceed' : ' exceeds'} the new outstanding balance of{' '}
                  <strong>{formatCurrency(newBalance, currency)}</strong>. Existing link amounts will not be silently altered—please cancel or reissue them in Payment Requests after saving.
                </p>
              </div>
            </div>
          )}

          {confirmPriceChange && priceChanged && hasExistingPayments && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-indigo-600" />
              <div className="space-y-1">
                <p className="font-semibold">Confirm Agreed Total Change</p>
                <p>
                  This project already has{' '}
                  <strong>{formatCurrency(amountPaid, currency)}</strong> in recorded payments. Changing the total from{' '}
                  <strong>{formatCurrency(project.price || 0, currency)}</strong> to{' '}
                  <strong>{formatCurrency(validNumericPrice, currency)}</strong> will set the outstanding balance to{' '}
                  <strong>{formatCurrency(newBalance, currency)}</strong> while preserving all payment history. Click{' '}
                  <strong>Confirm & Save Changes</strong> below to proceed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Schedule and Status */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <Calendar size={15} className="text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Schedule & Status
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
            <Input
              label="Estimated Delivery Date"
              type="date"
              value={formData.deadline}
              onChange={(e) => {
                setFormData({ ...formData, deadline: e.target.value })
                if (errors.deadline) setErrors({ ...errors, deadline: '' })
              }}
              error={errors.deadline}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Project Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                className="block w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as ProjectPriority })}
                className="block w-full h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Progress (%)"
              type="number"
              min="0"
              max="100"
              value={formData.progress}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                })
              }
            />
          </div>
        </div>

        {/* Section 4: Deliverables and Notes */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <FileText size={15} className="text-purple-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Deliverables & Internal Notes
            </h3>
          </div>

          <Textarea
            label="Deliverables"
            value={formData.deliverables}
            onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
            placeholder="List expected deliverables (e.g. Primary logo files, brand guidelines PDF, social media kit)…"
            rows={2}
          />

          <Textarea
            label="Internal Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Internal production notes, special client instructions, or revision details…"
            rows={3}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={onClose} type="button" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={isSubmitting} loadingText="Saving...">
            {confirmPriceChange && priceChanged && hasExistingPayments
              ? 'Confirm & Save Changes'
              : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
