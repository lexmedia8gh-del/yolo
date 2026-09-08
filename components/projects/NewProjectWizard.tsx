'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Wrench,
  Package as PackageIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  MessageSquare,
  FolderKanban,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  writeBatch,
  db,
  doc,
  collection,
  serverTimestamp,
} from '@/lib/firebase/firestore'
import type { Client, Service, Package, Invoice, ClientLink } from '@/lib/types'
import {
  formatCurrency,
  generateLxmInvoiceNumber,
  generateSecureToken,
  copyToClipboard,
} from '@/lib/utils'
import { where, orderBy } from '@/lib/firebase/firestore'
import toast from 'react-hot-toast'

// ─── Step definitions ────────────────────────────────────────
type WizardStep = 'service' | 'package' | 'confirm' | 'success'

interface WizardResult {
  projectId: string
  invoiceId: string
  invoiceNumber: string
  linkToken: string
  paymentUrl: string
  service: Service
  pkg: Package
  totalAmount: number
  depositAmount: number
  outstandingBalance: number
}

interface Props {
  client: Client
  onClose: () => void
  onSuccess?: () => void
}

// ─── Step indicator ──────────────────────────────────────────
const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'service', label: 'Select Service' },
  { id: 'package', label: 'Select Package' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'success', label: 'Done' },
]

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((step, idx) => {
        const done = idx < currentIndex
        const active = idx === currentIndex
        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done
                    ? 'bg-success-500 text-white'
                    : active
                    ? 'bg-accent-600 text-white'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : idx + 1}
              </div>
              <span
                className={`text-xs font-semibold hidden sm:block ${
                  active ? 'text-accent-700' : done ? 'text-success-600' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 ${
                  idx < currentIndex ? 'bg-success-300' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Main Wizard ─────────────────────────────────────────────
export function NewProjectWizard({ client, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<WizardStep>('service')

  // Data
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingPackages, setLoadingPackages] = useState(false)

  // Selections
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)

  // Project config (editable in confirm step)
  const [projectName, setProjectName] = useState('')
  const [projectNotes, setProjectNotes] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [result, setResult] = useState<WizardResult | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // Load services
  useEffect(() => {
    setLoadingServices(true)
    getDocuments<Service>(COLLECTIONS.SERVICES, [where('status', '==', 'active')])
      .then((data) => {
        setServices(data)
        setLoadingServices(false)
      })
      .catch(() => setLoadingServices(false))
  }, [])

  // Load packages when service selected
  useEffect(() => {
    if (!selectedService) {
      setPackages([])
      return
    }
    setLoadingPackages(true)
    getDocuments<Package>(COLLECTIONS.PACKAGES)
      .then((data) => {
        const matching = data.filter((pkg) => {
          if (pkg.status === 'inactive' || pkg.status === 'archived') return false
          if (pkg.serviceId === selectedService.id) return true
          if (pkg.serviceName && pkg.serviceName.toLowerCase() === selectedService.name.toLowerCase()) return true
          if (pkg.includedServices && pkg.includedServices.some((s) => s.toLowerCase() === selectedService.name.toLowerCase() || s === selectedService.id)) return true
          return false
        })
        setPackages(matching)
        setLoadingPackages(false)
      })
      .catch(() => setLoadingPackages(false))
  }, [selectedService])

  // Auto-fill project name when package selected
  useEffect(() => {
    if (selectedService && selectedPackage) {
      setProjectName(`${client.fullName} — ${selectedPackage.title}`)
    }
  }, [selectedService, selectedPackage, client.fullName])

  const handleSelectService = (service: Service) => {
    setSelectedService(service)
    setSelectedPackage(null)
    setStep('package')
  }

  const handleSelectPackage = (pkg: Package) => {
    setSelectedPackage(pkg)
    setStep('confirm')
  }

  // ─── Atomic Project + Invoice + ClientLink creation ──────────
  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedPackage) return
    setSubmitting(true)

    try {
      // 1. Get current invoice count for number generation
      const existingInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
      const invoiceNumber = generateLxmInvoiceNumber(existingInvoices.length)

      const totalAmount = selectedPackage.price
      const depositAmount =
        selectedPackage.discount && selectedPackage.discount > 0 && selectedPackage.discount < totalAmount
          ? selectedPackage.discount // treat discount field as deposit amount if set
          : Math.round(totalAmount * 0.4) // default 40% deposit
      const outstandingBalance = totalAmount

      // 2. Prepare refs
      const projectRef = doc(collection(db, COLLECTIONS.PROJECTS))
      const invoiceRef = doc(collection(db, COLLECTIONS.INVOICES))

      // 3. Batch write — atomic
      const batch = writeBatch(db)

      // Project doc
      batch.set(projectRef, {
        name: projectName || `${client.fullName} — ${selectedPackage.title}`,
        clientId: client.id,
        clientName: client.fullName,
        clientEmail: client.email,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        packageId: selectedPackage.id,
        packageTitle: selectedPackage.title,
        invoiceId: invoiceRef.id,
        invoiceNumber,
        price: totalAmount,
        depositAmount,
        amountPaid: 0,
        outstandingBalance,
        currency: selectedPackage.currency || 'GHS',
        status: 'Awaiting Payment',
        paymentStatus: 'Unpaid',
        progress: 0,
        startDate: startDate || null,
        deadline: dueDate || null,
        notes: projectNotes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'admin',
      })

      // Invoice doc — one line item for the package
      batch.set(invoiceRef, {
        invoiceNumber,
        clientId: client.id,
        clientName: client.fullName,
        clientEmail: client.email,
        projectId: projectRef.id,
        projectName: projectName || `${client.fullName} — ${selectedPackage.title}`,
        packageId: selectedPackage.id,
        packageTitle: selectedPackage.title,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        items: [
          {
            id: `item_${Date.now()}`,
            description: `${selectedService.name} — ${selectedPackage.title}`,
            quantity: 1,
            unitPrice: totalAmount,
            total: totalAmount,
          },
        ],
        subtotal: totalAmount,
        discountAmount: 0,
        taxAmount: 0,
        total: totalAmount,
        amountPaid: 0,
        balanceDue: totalAmount,
        depositAmount,
        currency: selectedPackage.currency || 'GHS',
        status: 'Pending',
        invoiceDate: serverTimestamp(),
        dueDate: dueDate || null,
        notes: projectNotes || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: 'admin',
      })

      // Update client counters
      const clientRef = doc(db, COLLECTIONS.CLIENTS, client.id)
      batch.update(clientRef, {
        projectCount: (client.projectCount || 0) + 1,
        totalBilled: (client.totalBilled || 0) + totalAmount,
        outstandingBalance: (client.outstandingBalance || 0) + totalAmount,
        updatedAt: serverTimestamp(),
      })

      await batch.commit()

      // 4. Generate payment link (separate — can be retried if it fails)
      let linkToken = generateSecureToken('p_')
      let paymentUrl = ''
      let clientLinkId = ''

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
        paymentUrl = `${appUrl}/pay/${linkToken}`

        clientLinkId = await addDocument(COLLECTIONS.CLIENT_LINKS, {
          token: linkToken,
          clientId: client.id,
          clientName: client.fullName,
          projectId: projectRef.id,
          projectName: projectName || `${client.fullName} — ${selectedPackage.title}`,
          packageId: selectedPackage.id,
          packageTitle: selectedPackage.title,
          invoiceId: invoiceRef.id,
          invoiceNumber,
          amount: depositAmount,
          currency: selectedPackage.currency || 'GHS',
          status: 'Pending Payment',
          paymentStatus: 'Unpaid',
          viewCount: 0,
          createdBy: 'admin',
        })
      } catch (linkErr) {
        console.warn('Payment link generation failed (project + invoice were created):', linkErr)
        toast.error('Project & invoice created, but payment link failed. You can generate it from the Links page.')
      }

      setResult({
        projectId: projectRef.id,
        invoiceId: invoiceRef.id,
        invoiceNumber,
        linkToken,
        paymentUrl,
        service: selectedService,
        pkg: selectedPackage,
        totalAmount,
        depositAmount,
        outstandingBalance,
      })

      setStep('success')
      toast.success('Project and invoice created successfully!')
      onSuccess?.()
    } catch (err: any) {
      console.error('Project creation failed:', err)
      toast.error(err?.message || 'Failed to create project. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedService,
    selectedPackage,
    client,
    projectName,
    projectNotes,
    startDate,
    dueDate,
    onSuccess,
  ])

  const handleCopyLink = async () => {
    if (!result?.paymentUrl) return
    await copyToClipboard(result.paymentUrl)
    setLinkCopied(true)
    toast.success('Payment link copied!')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleWhatsApp = async () => {
    if (!result || !client.whatsappNumber) {
      toast.error('Client does not have a WhatsApp number. Add a WhatsApp number before sending.')
      return
    }
    
    setSendingWA(true)
    try {
      const msg = `Hello ${client.fullName}! 👋\n\nYour invoice ${result.invoiceNumber} is ready.\n\n📋 Service: ${result.service.name}\n📦 Package: ${result.pkg.title}\n💰 Total: ${formatCurrency(result.totalAmount)}\n🔐 Deposit: ${formatCurrency(result.depositAmount)}\n\nClick the link below to pay securely:\n${result.paymentUrl}\n\nThank you for choosing LexMedia! 🙏`
      
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          invoiceId: result.invoiceId,
          projectId: result.projectId,
          messageBody: msg,
          toNumber: client.whatsappNumber,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp message')

      setWaSent(true)
      toast.success('WhatsApp message sent!')
    } catch (err: any) {
      console.error('WhatsApp Error:', err)
      toast.error(err.message || 'Failed to send WhatsApp message.')
    } finally {
      setSendingWA(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent-100 text-accent-700 flex items-center justify-center">
              <FolderKanban size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">New Project</h2>
              <p className="text-xs text-muted">{client.fullName}</p>
            </div>
          </div>
          {step !== 'success' && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5">
          <StepIndicator current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">

          {/* ── STEP 1: Select Service ── */}
          {step === 'service' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Select a Service</h3>
                <p className="text-sm text-muted">Choose the service for this project.</p>
              </div>

              {loadingServices ? (
                <div className="py-12 flex flex-col items-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-sm text-muted">Loading services…</p>
                </div>
              ) : services.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-gray-50 rounded-2xl border border-dashed border-border">
                  <Wrench size={32} className="mx-auto text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No active services found</p>
                  <p className="text-xs text-muted">Add services in the Services section first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map((svc) => (
                    <button
                      key={svc.id}
                      onClick={() => handleSelectService(svc)}
                      className="text-left p-4 rounded-xl border border-gray-200/80 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                          <Wrench size={15} />
                        </div>
                        <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-600 mt-1 shrink-0 transition-colors" />
                      </div>
                      <h4 className="mt-2.5 font-semibold text-gray-900 text-sm">{svc.name}</h4>
                      {svc.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{svc.description}</p>
                      )}
                      {svc.defaultPrice > 0 && (
                        <p className="text-xs font-semibold text-indigo-600 mt-2">
                          From {formatCurrency(svc.defaultPrice)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Select Package ── */}
          {step === 'package' && selectedService && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('service')}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {selectedService.name} — Packages
                  </h3>
                  <p className="text-sm text-gray-500">Select a package to continue.</p>
                </div>
              </div>

              {/* Selected service badge */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                <Wrench size={14} className="text-gray-500 shrink-0" />
                <span className="font-semibold text-gray-900">{selectedService.name}</span>
                <Badge variant="accent" size="sm" className="ml-auto">Selected</Badge>
              </div>

              {loadingPackages ? (
                <div className="py-12 flex flex-col items-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-sm text-gray-500">Loading packages…</p>
                </div>
              ) : packages.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <PackageIcon size={32} className="mx-auto text-gray-400" />
                  <p className="text-sm font-semibold text-gray-700">No packages for this service</p>
                  <p className="text-xs text-gray-500">Go to Packages and create packages linked to "{selectedService.name}".</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {packages.map((pkg) => {
                    const deposit = pkg.discount && pkg.discount > 0 && pkg.discount < pkg.price
                      ? pkg.discount
                      : Math.round(pkg.price * 0.4)
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => handleSelectPackage(pkg)}
                        className="w-full text-left p-4 rounded-xl border border-gray-200/80 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group shadow-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <PackageIcon size={15} className="text-indigo-600 shrink-0" />
                              <h4 className="font-semibold text-gray-900 text-sm">{pkg.title}</h4>
                            </div>
                            {pkg.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{pkg.description}</p>
                            )}
                            {pkg.whatsIncluded && pkg.whatsIncluded.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {pkg.whatsIncluded.slice(0, 3).map((item) => (
                                  <li key={item.id} className="text-xs text-gray-600 flex items-center gap-1.5">
                                    <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                                    {item.text}
                                  </li>
                                ))}
                                {pkg.whatsIncluded.length > 3 && (
                                  <li className="text-xs text-gray-400">+{pkg.whatsIncluded.length - 3} more included</li>
                                )}
                              </ul>
                            )}
                            {pkg.deliveryTimeline && (
                              <p className="text-xs text-gray-500 mt-1.5">⏱ {pkg.deliveryTimeline}</p>
                            )}
                          </div>
                          <div className="text-right ml-4 flex-shrink-0">
                            <p className="text-base font-bold text-gray-900">{formatCurrency(pkg.price)}</p>
                            <p className="text-xs text-gray-500">Deposit: {formatCurrency(deposit)}</p>
                            <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-600 ml-auto mt-2 transition-colors" />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Confirm ── */}
          {step === 'confirm' && selectedService && selectedPackage && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('package')}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Confirm Project</h3>
                  <p className="text-sm text-muted">Review details before creating.</p>
                </div>
              </div>

              {/* Summary box */}
              <div className="p-5 rounded-2xl bg-gray-50 border border-border space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted font-semibold uppercase tracking-wide">Client</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{client.fullName}</p>
                    {client.company && <p className="text-xs text-muted">{client.company}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted font-semibold uppercase tracking-wide">Service</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{selectedService.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted font-semibold uppercase tracking-wide">Package</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{selectedPackage.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted font-semibold uppercase tracking-wide">Duration</p>
                    <p className="font-semibold text-gray-900 mt-0.5">{selectedPackage.deliveryTimeline || 'TBD'}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-white border border-border">
                    <p className="text-xs text-muted">Total</p>
                    <p className="font-bold text-gray-900 text-lg">{formatCurrency(selectedPackage.price)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-accent-50 border border-accent-200">
                    <p className="text-xs text-accent-700">Deposit</p>
                    <p className="font-bold text-accent-800 text-lg">
                      {formatCurrency(
                        selectedPackage.discount && selectedPackage.discount > 0 && selectedPackage.discount < selectedPackage.price
                          ? selectedPackage.discount
                          : Math.round(selectedPackage.price * 0.4)
                      )}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                    <p className="text-xs text-orange-700">Balance</p>
                    <p className="font-bold text-orange-800 text-lg">
                      {formatCurrency(
                        selectedPackage.price - (
                          selectedPackage.discount && selectedPackage.discount > 0 && selectedPackage.discount < selectedPackage.price
                            ? selectedPackage.discount
                            : Math.round(selectedPackage.price * 0.4)
                        )
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Editable fields */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                    placeholder="e.g. John Mensah — Premium Wedding Package"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Project Notes</label>
                  <textarea
                    rows={2}
                    value={projectNotes}
                    onChange={(e) => setProjectNotes(e.target.value)}
                    placeholder="Any special requirements or notes…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none resize-none transition-colors"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 flex items-start gap-2 text-xs text-indigo-900">
                <FileText size={14} className="shrink-0 mt-0.5 text-indigo-600" />
                <span>Clicking <strong>Confirm & Create Project</strong> will atomically create the project and invoice in Firestore, then generate a payment link for the deposit amount.</span>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="md"
                onClick={handleConfirm}
                loading={submitting}
                disabled={submitting || !projectName.trim()}
                icon={submitting ? undefined : <Sparkles size={16} />}
              >
                {submitting ? 'Creating Project…' : 'Confirm & Create Project'}
              </Button>
            </div>
          )}

          {/* ── STEP 4: Success ── */}
          {step === 'success' && result && (
            <div className="space-y-5">
              <div className="text-center space-y-1.5 py-1">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={28} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Project Created!</h3>
                <p className="text-xs text-gray-500">Project and invoice are ready. Share the payment link with your client.</p>
              </div>

              {/* Summary table */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Summary</p>
                </div>
                <div className="divide-y divide-gray-100 text-sm">
                  {[
                    { label: 'Client', value: client.fullName },
                    { label: 'Service', value: result.service.name },
                    { label: 'Package', value: result.pkg.title },
                    { label: 'Invoice', value: result.invoiceNumber },
                    { label: 'Total', value: formatCurrency(result.totalAmount) },
                    { label: 'Deposit Due', value: formatCurrency(result.depositAmount) },
                    { label: 'Balance', value: formatCurrency(result.totalAmount - result.depositAmount) },
                    { label: 'Payment Status', value: <Badge variant="warning" size="sm">Pending</Badge> },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-gray-500 text-xs">{row.label}</span>
                      <span className="font-semibold text-gray-900 text-xs text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment link box */}
              {result.paymentUrl && (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Link (Deposit)</p>
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                    <code className="text-xs text-gray-700 flex-1 truncate">{result.paymentUrl}</code>
                    <button
                      onClick={handleCopyLink}
                      className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                      title="Copy link"
                    >
                      {linkCopied ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      icon={<Copy size={13} />}
                      onClick={handleCopyLink}
                    >
                      {linkCopied ? 'Copied!' : 'Copy Link'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      icon={<ExternalLink size={13} />}
                      onClick={() => window.open(result.paymentUrl, '_blank')}
                    >
                      Open Link
                    </Button>
                    {client.whatsappNumber && (
                      <Button
                        variant={waSent ? 'outline' : 'primary'}
                        size="sm"
                        fullWidth
                        icon={sendingWA ? <Spinner size="sm" /> : waSent ? <CheckCircle2 size={13} className="text-emerald-600" /> : <MessageSquare size={13} />}
                        onClick={handleWhatsApp}
                        disabled={sendingWA || waSent}
                        className={waSent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700'}
                      >
                        {sendingWA ? 'Sending...' : waSent ? 'Sent' : 'Send via WhatsApp'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={onClose}
                >
                  Client Profile
                </Button>
                <Button
                  variant="outline"
                  fullWidth
                  icon={<FileText size={15} />}
                  onClick={() => window.open('/invoices', '_self')}
                >
                  View Invoice
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  icon={<ExternalLink size={15} />}
                  onClick={() => window.open(`/projects/${result.projectId}`, '_self')}
                >
                  View Project
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
