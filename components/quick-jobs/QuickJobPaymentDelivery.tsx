'use client'

import React, { useState, useEffect } from 'react'
import {
  Link as LinkIcon,
  Copy,
  CreditCard,
  ExternalLink,
  DollarSign,
  Check,
  Share2,
  AlertCircle,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { where } from 'firebase/firestore'
import {
  COLLECTIONS,
  addDocument,
  updateDocument,
  getDocuments,
  subscribeToDocument,
} from '@/lib/firebase/firestore'
import {
  generateSecureToken,
  getPaymentLink,
  formatCurrency,
  copyToClipboard,
  openExternalUrl,
} from '@/lib/utils'
import type { QuickJob, ClientLink } from '@/lib/types'
import toast from 'react-hot-toast'
import { ProjectDeliveryManager } from '@/components/delivery/ProjectDeliveryManager'

interface QuickJobPaymentDeliveryProps {
  job: QuickJob
  onUpdate: (updatedData: Partial<QuickJob>) => void
}

export function QuickJobPaymentDelivery({ job: initialJob, onUpdate }: QuickJobPaymentDeliveryProps) {
  // Live reactive Quick Job state
  const [currentJob, setCurrentJob] = useState<QuickJob>(initialJob)
  const [isLoadingDetails, setIsLoadingDetails] = useState(true)

  // Payment Links State
  const [paymentLinks, setPaymentLinks] = useState<ClientLink[]>([])
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // Editable Amount to Collect State
  const [presetOption, setPresetOption] = useState<'full' | 'half' | 'custom'>('full')
  const [amountToCollect, setAmountToCollect] = useState<string>('')
  const [showNewLinkForm, setShowNewLinkForm] = useState(false)

  // Manual Offline Payment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isRecordingPayment, setIsRecordingPayment] = useState(false)
  const [payFormData, setPayFormData] = useState({
    amount: initialJob.outstandingBalance || initialJob.originalAgreedPrice || 0,
    paymentMethod: 'MTN Mobile Money',
    reference: '',
    notes: 'Direct client payment confirmation',
  })

  // 1. Subscribe in real time to the Quick Job in Firestore
  useEffect(() => {
    let isMounted = true

    const unsub = subscribeToDocument<QuickJob>(
      COLLECTIONS.QUICK_JOBS,
      initialJob.id,
      (liveJob) => {
        if (!isMounted) return
        if (liveJob) {
          setCurrentJob(liveJob)
        }
      }
    )

    return () => {
      isMounted = false
      unsub()
    }
  }, [initialJob.id])

  // 2. Fetch linked ClientLink records
  const fetchAssociatedRecords = async () => {
    try {
      const links = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
        where('quickJobId', '==', initialJob.id),
      ])
      if (links) {
        const sorted = (links || []).sort((a: any, b: any) => {
          const tA = new Date(a.createdAt || 0).getTime()
          const tB = new Date(b.createdAt || 0).getTime()
          return tB - tA
        })
        setPaymentLinks(sorted)
      }
    } catch (err) {
      console.error('Error fetching quick job payment link record:', err)
    } finally {
      setIsLoadingDetails(false)
    }
  }

  useEffect(() => {
    fetchAssociatedRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob.id])

  // Outstanding Balance and Payment State
  const originalTotal = Number(currentJob.originalAgreedPrice || 0)
  const amountAlreadyPaid = Number(currentJob.amountPaid || 0)
  const outstandingBalance = currentJob.outstandingBalance !== undefined
    ? Number(currentJob.outstandingBalance)
    : Math.max(0, originalTotal - amountAlreadyPaid)

  const isPaid =
    currentJob.paymentStatus === 'Paid' ||
    (outstandingBalance <= 0 && amountAlreadyPaid >= originalTotal)

  // Live amount calculations
  const parsedAmount = parseFloat(amountToCollect) || 0
  const remainingBalanceAfterThisPayment = Math.max(0, outstandingBalance - parsedAmount)
  const isAmountOverBalance = parsedAmount > outstandingBalance
  const isAmountZeroOrNegative = parsedAmount <= 0
  const isAmountValid = !isAmountOverBalance && !isAmountZeroOrNegative && !isNaN(parsedAmount)

  // Sync initial and updated amounts with presets
  useEffect(() => {
    if (presetOption === 'full') {
      setAmountToCollect(outstandingBalance > 0 ? outstandingBalance.toString() : '0')
    } else if (presetOption === 'half') {
      const half = Math.round((outstandingBalance * 0.5) * 100) / 100
      setAmountToCollect(half > 0 ? half.toString() : '0')
    }
  }, [outstandingBalance, presetOption])

  // Preset button selection
  const handleSelectPreset = (option: 'full' | 'half' | 'custom') => {
    setPresetOption(option)
    if (option === 'full') {
      setAmountToCollect(outstandingBalance > 0 ? outstandingBalance.toString() : '0')
    } else if (option === 'half') {
      const half = Math.round((outstandingBalance * 0.5) * 100) / 100
      setAmountToCollect(half > 0 ? half.toString() : '0')
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPresetOption('custom')
    setAmountToCollect(e.target.value)
  }

  // Generate Payment Link with editable amount
  const handleGenerateLink = async () => {
    if (!isAmountValid) {
      if (parsedAmount <= 0) {
        toast.error('Amount to collect must be greater than GH₵0.00')
      } else if (parsedAmount > outstandingBalance) {
        toast.error(`Amount cannot exceed the outstanding balance of ${formatCurrency(outstandingBalance, currentJob.currency || 'GHS')}`)
      }
      return
    }

    setIsGeneratingLink(true)
    try {
      const token = generateSecureToken('qj_')
      const newLink: Partial<ClientLink> & { token: string } = {
        token,
        clientId: currentJob.clientId,
        clientName: currentJob.clientName,
        quickJobId: currentJob.id,
        amount: parsedAmount,
        currency: currentJob.currency || 'GHS',
        title: `Payment for Quick Job: ${currentJob.jobDescription}`,
        status: 'Pending Payment',
        createdAt: new Date().toISOString() as any,
      }

      const docId = await addDocument(COLLECTIONS.CLIENT_LINKS, newLink)
      const fullLink = { id: docId, ...newLink } as ClientLink
      setPaymentLinks((prev) => [fullLink, ...prev])

      const updatePayload: Partial<QuickJob> = { paymentStatus: 'Payment Link Generated' }
      await updateDocument(COLLECTIONS.QUICK_JOBS, currentJob.id, updatePayload)
      onUpdate(updatePayload)
      setCurrentJob((prev) => ({ ...prev, ...updatePayload }))

      setShowNewLinkForm(false)
      toast.success(`Payment link generated for ${formatCurrency(parsedAmount, currentJob.currency || 'GHS')}!`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate payment link')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  // Copy Payment Link
  const handleCopyPaymentLink = (token: string) => {
    const linkUrl = getPaymentLink(token)
    copyToClipboard(linkUrl)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
    toast.success('Payment link copied to clipboard')
  }

  // Share via WhatsApp
  const handleShareWhatsApp = (link: ClientLink) => {
    const linkUrl = getPaymentLink(link.token)
    const clientName = link.clientName || currentJob.clientName || 'Valued Client'
    const message = `Hello ${clientName}, please find the secure payment link for ${currentJob.jobDescription} (${formatCurrency(Number(link.amount) || 0, link.currency || 'GHS')}): ${linkUrl}`
    openExternalUrl(`https://wa.me/?text=${encodeURIComponent(message)}`)
  }

  // Record Offline Payment (Admin Manual Confirmation)
  const handleRecordOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsRecordingPayment(true)

    try {
      const amountToRecord = Number(payFormData.amount) || outstandingBalance || originalTotal
      const prevPaid = Number(currentJob.amountPaid) || 0
      const totalPaid = prevPaid + amountToRecord
      const remainingBalance = Math.max(0, originalTotal - totalPaid)
      const newStatus = totalPaid >= originalTotal ? 'Paid' : 'Partially Paid'
      const now = new Date().toISOString()

      // 1. Create Payment record in Firestore
      await addDocument(COLLECTIONS.PAYMENTS, {
        quickJobId: currentJob.id,
        clientId: currentJob.clientId,
        clientName: currentJob.clientName,
        amount: amountToRecord,
        currency: currentJob.currency || 'GHS',
        channel: payFormData.paymentMethod,
        paymentMethod: payFormData.paymentMethod,
        paidAt: now,
        status: 'success',
        verificationStatus: 'verified',
        source: 'admin_manual',
        reference: payFormData.reference || `MAN-${Date.now().toString(36).toUpperCase()}`,
        notes: payFormData.notes,
      })

      // 2. Update Client stats
      if (currentJob.clientId) {
        try {
          const clientDocs = await getDocuments<any>(COLLECTIONS.CLIENTS, [
            where('__name__', '==', currentJob.clientId),
          ])
          if (clientDocs && clientDocs.length > 0) {
            const cl = clientDocs[0]
            await updateDocument(COLLECTIONS.CLIENTS, currentJob.clientId, {
              totalPaid: (cl.totalPaid || 0) + amountToRecord,
              outstandingBalance: Math.max(0, (cl.outstandingBalance || 0) - amountToRecord),
              lastPaymentDate: now,
            })
          }
        } catch (cErr) {
          console.warn('Client stats update warning:', cErr)
        }
      }

      // 3. Update Quick Job in Firestore
      const updateData: Partial<QuickJob> = {
        amountPaid: totalPaid,
        outstandingBalance: remainingBalance,
        paymentStatus: newStatus as any,
        depositPaid: (currentJob.depositPaid || 0) + amountToRecord,
        updatedAt: now,
      }

      await updateDocument(COLLECTIONS.QUICK_JOBS, currentJob.id, updateData)
      onUpdate(updateData)
      setCurrentJob((prev) => ({ ...prev, ...updateData }))

      // 4. Log Activity
      await addDocument(COLLECTIONS.ACTIVITY_LOGS, {
        event: 'payment_completed',
        description: `Payment of ${currentJob.currency || 'GHS'} ${amountToRecord.toLocaleString()} recorded for Quick Job: ${currentJob.jobDescription}`,
        entityId: currentJob.id,
        entityType: 'quickJob',
        clientId: currentJob.clientId,
        clientName: currentJob.clientName,
        performedBy: 'admin',
        metadata: { channel: payFormData.paymentMethod, amount: amountToRecord },
      })

      setIsPaymentModalOpen(false)
      toast.success(newStatus === 'Paid' ? 'Payment confirmed! Delivery upload is now unlocked.' : 'Partial payment recorded.')
    } catch (err: any) {
      console.error('Error recording payment:', err)
      toast.error('Failed to record payment.')
    } finally {
      setIsRecordingPayment(false)
    }
  }

  if (isLoadingDetails) {
    return (
      <div className="p-6 text-center border-t border-gray-100 dark:border-gray-800">
        <Spinner size="md" className="mx-auto text-indigo-600 mb-2" />
        <p className="text-xs text-gray-500">Loading payment status & deliverable manager...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
      {/* ─── 1. PAYMENT STATUS & FINANCIAL OVERVIEW SECTION ─── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
            1. Payment & Invoice Status
          </h4>
          <Badge variant={isPaid ? 'success' : currentJob.amountPaid > 0 ? 'warning' : 'danger'}>
            {isPaid ? 'Paid' : currentJob.paymentStatus || 'Unpaid'}
          </Badge>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200/70 dark:border-gray-700/60 space-y-4">
          {/* Financial Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-800">
              <span className="text-gray-400 block text-[10px] uppercase font-semibold">Original Job Total</span>
              <span className="font-bold text-gray-900 dark:text-gray-100 font-mono text-sm">
                {formatCurrency(originalTotal, currentJob.currency || 'GHS')}
              </span>
            </div>
            <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-800">
              <span className="text-gray-400 block text-[10px] uppercase font-semibold">Amount Already Paid</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                {formatCurrency(amountAlreadyPaid, currentJob.currency || 'GHS')}
              </span>
            </div>
            <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-800">
              <span className="text-gray-400 block text-[10px] uppercase font-semibold">Outstanding Balance</span>
              <span className={`font-bold font-mono text-sm ${isPaid ? 'text-gray-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(outstandingBalance, currentJob.currency || 'GHS')}
              </span>
            </div>
            <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-800">
              <span className="text-gray-400 block text-[10px] uppercase font-semibold">Payment Status</span>
              <div className="pt-0.5">
                <Badge variant={isPaid ? 'success' : currentJob.amountPaid > 0 ? 'warning' : 'danger'}>
                  {isPaid ? 'Paid' : currentJob.paymentStatus || 'Unpaid'}
                </Badge>
              </div>
            </div>
          </div>

          {/* ─── Link Generator Form (Specification Section 2) ─── */}
          {!isPaid && (
            <div className="pt-3 border-t border-gray-200/70 dark:border-gray-700/60 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                  Generate Payment Link
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="text-xs h-7 px-2.5"
                  icon={<DollarSign className="w-3 h-3 text-emerald-600" />}
                >
                  Record Offline Payment
                </Button>
              </div>

              {/* Presets and Editable Amount to Collect */}
              <div className="bg-white dark:bg-gray-900 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
                {/* Convenient Preset Options */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Quick Preset Amounts
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('full')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                        presetOption === 'full'
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      Full Balance ({formatCurrency(outstandingBalance, currentJob.currency || 'GHS')})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('half')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                        presetOption === 'half'
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      50% Balance ({formatCurrency(Math.round(outstandingBalance * 0.5 * 100) / 100, currentJob.currency || 'GHS')})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('custom')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                        presetOption === 'custom'
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      Custom Amount
                    </button>
                  </div>
                </div>

                {/* Editable Field: Amount to Collect (GH₵) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                      Amount to Collect ({currentJob.currency || 'GH₵'})
                    </label>
                    <span className="text-[11px] text-gray-400 font-medium">
                      Max: {formatCurrency(outstandingBalance, currentJob.currency || 'GHS')}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={outstandingBalance}
                      value={amountToCollect}
                      onChange={handleAmountChange}
                      placeholder="Enter amount to collect..."
                      className={`text-sm font-mono font-bold pr-16 ${
                        isAmountOverBalance ? 'border-rose-500 text-rose-600 focus:border-rose-500' : ''
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none">
                      {currentJob.currency || 'GHS'}
                    </div>
                  </div>

                  {/* Validation Alerts */}
                  {isAmountOverBalance && (
                    <p className="text-[11px] text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Amount cannot exceed outstanding balance of {formatCurrency(outstandingBalance, currentJob.currency || 'GHS')}
                    </p>
                  )}
                  {isAmountZeroOrNegative && amountToCollect !== '' && (
                    <p className="text-[11px] text-rose-500 font-medium mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Amount to collect must be greater than zero
                    </p>
                  )}
                </div>

                {/* Remaining Balance After Payment Live Calculation */}
                <div className="p-3 bg-gray-50 dark:bg-gray-800/70 rounded-lg border border-gray-200/70 dark:border-gray-700 flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">
                    Remaining balance after this payment:
                  </span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                    {formatCurrency(remainingBalanceAfterThisPayment, currentJob.currency || 'GHS')}
                  </span>
                </div>

                {/* Generate Link Button */}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleGenerateLink}
                  loading={isGeneratingLink}
                  disabled={!isAmountValid}
                  className="w-full text-xs py-2.5 font-bold"
                  icon={<LinkIcon className="w-3.5 h-3.5" />}
                >
                  Generate Client Payment Link ({formatCurrency(parsedAmount, currentJob.currency || 'GHS')})
                </Button>
              </div>
            </div>
          )}

          {/* ─── Multiple Generated Payment Links Display (Section 5) ─── */}
          {paymentLinks.length > 0 && (
            <div className="pt-3 border-t border-gray-200/70 dark:border-gray-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Active Payment Links ({paymentLinks.length})
                </span>
                {!isPaid && !showNewLinkForm && (
                  <span className="text-[11px] text-gray-400">
                    Multiple payment links supported
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {paymentLinks.map((link) => {
                  const linkUrl = getPaymentLink(link.token)
                  const isLinkPaid = link.status === 'Paid'
                  const isCopied = copiedToken === link.token

                  return (
                    <div
                      key={link.id || link.token}
                      className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                            {formatCurrency(Number(link.amount) || 0, link.currency || 'GHS')}
                          </span>
                          <Badge variant={isLinkPaid ? 'success' : 'warning'}>
                            {isLinkPaid ? 'Paid' : 'Pending Payment'}
                          </Badge>
                        </div>
                        {link.createdAt && (
                          <span className="text-[10px] text-gray-400">
                            {(() => {
                              try {
                                const d = (link.createdAt as any)?.toDate ? (link.createdAt as any).toDate() : new Date(link.createdAt as any)
                                return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              } catch {
                                return ''
                              }
                            })()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Input
                          value={linkUrl}
                          readOnly
                          className="text-xs font-mono bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 h-8"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyPaymentLink(link.token)}
                          title="Copy Payment Link"
                          className="shrink-0 h-8 px-2.5"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openExternalUrl(linkUrl)}
                          title="Open Payment Portal"
                          className="shrink-0 h-8 px-2.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShareWhatsApp(link)}
                          title="Share to WhatsApp"
                          className="shrink-0 h-8 px-2.5 text-emerald-600 hover:text-emerald-700"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. REUSABLE FILE DELIVERY MANAGER (EXACT SOURCE OF TRUTH) ─── */}
      <div className="pt-2">
        <ProjectDeliveryManager
          quickJob={currentJob}
          onUpdate={(updatedData) => {
            onUpdate(updatedData)
            setCurrentJob((prev) => ({ ...prev, ...updatedData }))
          }}
        />
      </div>

      {/* ─── RECORD OFFLINE PAYMENT MODAL ─── */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title="Record Client Payment"
          size="sm"
        >
          <form onSubmit={handleRecordOfflinePayment} className="space-y-3.5 text-xs">
            <p className="text-gray-600 dark:text-gray-300">
              Record a payment received via cash, direct bank transfer, or offline MoMo. This will immediately update the job balance and unlock file uploads in real-time.
            </p>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Payment Amount ({currentJob.currency || 'GHS'})
              </label>
              <Input
                type="number"
                step="0.01"
                required
                value={payFormData.amount}
                onChange={(e) => setPayFormData({ ...payFormData, amount: Number(e.target.value) })}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Payment Method
              </label>
              <Select
                value={payFormData.paymentMethod}
                onChange={(e) => setPayFormData({ ...payFormData, paymentMethod: e.target.value })}
                options={[
                  { value: 'MTN Mobile Money', label: 'MTN Mobile Money' },
                  { value: 'Telecel Cash', label: 'Telecel Cash' },
                  { value: 'AT Money', label: 'AT Money' },
                  { value: 'Bank Transfer / Deposit', label: 'Bank Transfer / Deposit' },
                  { value: 'Cash', label: 'Cash (In-person / Walk-in)' },
                  { value: 'POS Card Terminal', label: 'POS Card Terminal' },
                ]}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Transaction Reference / Receipt #
              </label>
              <Input
                placeholder="e.g. MoMo Transaction ID or Receipt #"
                value={payFormData.reference}
                onChange={(e) => setPayFormData({ ...payFormData, reference: e.target.value })}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <Input
                value={payFormData.notes}
                onChange={(e) => setPayFormData({ ...payFormData, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsPaymentModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isRecordingPayment}
                icon={<Check className="w-3.5 h-3.5" />}
              >
                Confirm Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
