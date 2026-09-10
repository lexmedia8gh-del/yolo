'use client'

import React, { useState, useEffect } from 'react'
import {
  Link as LinkIcon,
  Copy,
  CreditCard,
  ExternalLink,
  DollarSign,
  Check,
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

  // Payment Link State
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [copiedPayLink, setCopiedPayLink] = useState(false)

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
  useEffect(() => {
    let isMounted = true
    setIsLoadingDetails(true)

    const fetchAssociatedRecords = async () => {
      try {
        // Fetch Payment Link
        const links = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
          where('quickJobId', '==', initialJob.id),
        ])
        if (isMounted && links && links.length > 0) {
          setPaymentLink(getPaymentLink(links[0].token))
        }
      } catch (err) {
        console.error('Error fetching quick job payment link record:', err)
      } finally {
        if (isMounted) {
          setIsLoadingDetails(false)
        }
      }
    }

    fetchAssociatedRecords()

    return () => {
      isMounted = false
    }
  }, [initialJob.id])

  // Calculate payment state
  const isPaid =
    currentJob.paymentStatus === 'Paid' ||
    (Number(currentJob.outstandingBalance) <= 0 && Number(currentJob.amountPaid) >= Number(currentJob.originalAgreedPrice))

  // Generate Payment Link
  const handleGenerateLink = async () => {
    setIsGeneratingLink(true)
    try {
      const token = generateSecureToken('qj_')
      const newLink: Partial<ClientLink> & { token: string } = {
        token,
        clientId: currentJob.clientId,
        clientName: currentJob.clientName,
        quickJobId: currentJob.id,
        amount: currentJob.outstandingBalance || currentJob.originalAgreedPrice,
        currency: currentJob.currency || 'GHS',
        title: `Payment for Quick Job: ${currentJob.jobDescription}`,
        createdAt: new Date().toISOString() as any,
      }

      await addDocument(COLLECTIONS.CLIENT_LINKS, newLink)
      const generatedUrl = getPaymentLink(token)
      setPaymentLink(generatedUrl)
      
      const updatePayload: Partial<QuickJob> = { paymentStatus: 'Payment Link Generated' }
      await updateDocument(COLLECTIONS.QUICK_JOBS, currentJob.id, updatePayload)
      onUpdate(updatePayload)
      setCurrentJob((prev) => ({ ...prev, ...updatePayload }))

      toast.success('Payment link generated!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate payment link')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  // Copy Payment Link
  const handleCopyPaymentLink = () => {
    if (!paymentLink) return
    copyToClipboard(paymentLink)
    setCopiedPayLink(true)
    setTimeout(() => setCopiedPayLink(false), 2000)
    toast.success('Payment link copied to clipboard')
  }

  // Record Offline Payment (Admin Manual Confirmation)
  const handleRecordOfflinePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsRecordingPayment(true)

    try {
      const amountToRecord = Number(payFormData.amount) || currentJob.outstandingBalance || currentJob.originalAgreedPrice
      const prevPaid = Number(currentJob.amountPaid) || 0
      const totalPaid = prevPaid + amountToRecord
      const remainingBalance = Math.max(0, currentJob.originalAgreedPrice - totalPaid)
      const newStatus = totalPaid >= currentJob.originalAgreedPrice ? 'Paid' : 'Partially Paid'
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
      {/* ─── 1. PAYMENT STATUS & LINK SECTION ─── */}
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

        <div className="bg-gray-50 dark:bg-gray-800/60 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-gray-400 block text-[10px]">Agreed Price</span>
              <span className="font-bold text-gray-900 dark:text-gray-100 font-mono">
                {formatCurrency(currentJob.originalAgreedPrice, currentJob.currency || 'GHS')}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Amount Paid</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatCurrency(currentJob.amountPaid || 0, currentJob.currency || 'GHS')}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[10px]">Outstanding Balance</span>
              <span className={`font-bold font-mono ${isPaid ? 'text-gray-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(currentJob.outstandingBalance || 0, currentJob.currency || 'GHS')}
              </span>
            </div>
          </div>

          {/* Payment Link Controls */}
          {!isPaid && (
            <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex flex-col gap-2">
              {!paymentLink ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleGenerateLink}
                    loading={isGeneratingLink}
                    className="flex-1 text-xs"
                    icon={<LinkIcon className="w-3.5 h-3.5" />}
                  >
                    Generate Client Payment Link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="text-xs"
                    icon={<DollarSign className="w-3.5 h-3.5 text-emerald-600" />}
                  >
                    Record Payment
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={paymentLink}
                      readOnly
                      className="text-xs font-mono bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPaymentLink}
                      title="Copy Payment Link"
                      className="shrink-0 px-2.5"
                    >
                      {copiedPayLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(paymentLink, '_blank')}
                      title="Open Payment Portal"
                      className="shrink-0 px-2.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Share this secure link with the client for instant online card/MoMo payment.</span>
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium shrink-0 ml-2"
                    >
                      Record Offline Payment
                    </button>
                  </div>
                </div>
              )}
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
