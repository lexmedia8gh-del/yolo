'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Link as LinkIcon,
  Copy,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  CreditCard,
  ExternalLink,
  Lock,
  Unlock,
  Sparkles,
  RefreshCw,
  Share2,
  DollarSign,
  Check,
  ShieldCheck,
  Eye,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
  getDeliveryLink,
  formatCurrency,
  formatFileSize,
  copyToClipboard,
  formatDate,
} from '@/lib/utils'
import type { QuickJob, ClientLink, Delivery, DeliveryFile } from '@/lib/types'
import toast from 'react-hot-toast'
import { uploadDeliveryFile, deleteDeliveryFile } from '@/lib/firebase/storage'

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

  // Delivery & Files State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<{ id?: string; name: string; url: string; path: string; size: number }[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isSendingDelivery, setIsSendingDelivery] = useState(false)
  const [deliveryAccessToken, setDeliveryAccessToken] = useState<string | null>(null)
  const [copiedDeliveryLink, setCopiedDeliveryLink] = useState(false)

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
          if (liveJob.deliveryAccessToken) {
            setDeliveryAccessToken(liveJob.deliveryAccessToken)
          }
        }
      }
    )

    return () => {
      isMounted = false
      unsub()
    }
  }, [initialJob.id])

  // 2. Fetch linked ClientLink and Delivery records
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

        // Fetch Existing Delivery if present
        const deliveries = await getDocuments<Delivery>(COLLECTIONS.DELIVERIES, [
          where('quickJobId', '==', initialJob.id),
        ])
        if (isMounted && deliveries && deliveries.length > 0) {
          const deliv = deliveries[0]
          if (deliv.accessToken) {
            setDeliveryAccessToken(deliv.accessToken)
          }
          if (deliv.files && Array.isArray(deliv.files) && deliv.files.length > 0) {
            setUploadedFiles(
              deliv.files.map((f: any) => ({
                id: f.id,
                name: f.name || f.fileName || 'Deliverable File',
                url: f.url || f.downloadUrl || '',
                path: f.path || f.storagePath || '',
                size: f.size || f.fileSize || 0,
              }))
            )
          }
        }
      } catch (err) {
        console.error('Error fetching quick job linked records:', err)
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

  const isDelivered = currentJob.deliveryStatus === 'Sent' || !!deliveryAccessToken

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
      toast.success(newStatus === 'Paid' ? 'Payment confirmed! Upload is now UNLOCKED.' : 'Partial payment recorded.')
    } catch (err: any) {
      console.error('Error recording payment:', err)
      toast.error('Failed to record payment.')
    } finally {
      setIsRecordingPayment(false)
    }
  }

  // Handle File Selection and Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Backend verification check before uploading
    try {
      const verifyRes = await fetch('/api/quick-jobs/verify-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJob.id }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.canUpload) {
        toast.error(verifyData.error || 'Upload locked: Payment has not been confirmed.')
        return
      }
    } catch (verErr) {
      console.warn('Backend verification pre-check warning:', verErr)
    }

    setIsUploading(true)
    setUploadProgress(10)

    try {
      const newUploads: { id: string; name: string; url: string; path: string; size: number }[] = []
      let progressStep = 10
      const stepInc = Math.floor(80 / files.length)

      for (const file of files) {
        const fileId = generateSecureToken('qjf_')
        const { downloadUrl, storagePath } = await uploadDeliveryFile(
          'quickJobs',
          currentJob.id,
          `${Date.now()}_${file.name}`,
          file
        )
        newUploads.push({
          id: fileId,
          name: file.name,
          url: downloadUrl,
          path: storagePath,
          size: file.size,
        })
        progressStep += stepInc
        setUploadProgress(Math.min(95, progressStep))
      }

      setUploadedFiles((prev) => [...prev, ...newUploads])
      setUploadProgress(100)
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded successfully!`)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload some files. Please check storage connection.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Remove Uploaded File
  const handleRemoveFile = async (index: number) => {
    const file = uploadedFiles[index]
    try {
      if (file.path) {
        await deleteDeliveryFile(file.path)
      }
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
      toast.success('File removed')
    } catch (err) {
      console.error('Error removing file:', err)
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
    }
  }

  // Submit & Send Delivery to Client
  const handleSendDelivery = async (isResend = false) => {
    if (!isPaid) {
      toast.error('Payment must be confirmed as Paid before delivery.')
      return
    }
    if (uploadedFiles.length === 0) {
      toast.error('Please upload at least one delivery file before sending.')
      return
    }

    setIsSendingDelivery(true)
    try {
      const response = await fetch('/api/quick-jobs/send-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: currentJob.id,
          clientName: currentJob.clientName,
          clientEmail: currentJob.clientEmail,
          files: uploadedFiles,
          resend: isResend,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send delivery')
      }

      if (data.accessToken) {
        setDeliveryAccessToken(data.accessToken)
      }

      const updatePayload: Partial<QuickJob> = {
        deliveryStatus: 'Sent',
        deliveryEmailSentAt: new Date().toISOString(),
        status: 'Completed',
        deliveryAccessToken: data.accessToken || deliveryAccessToken || '',
      }

      onUpdate(updatePayload)
      setCurrentJob((prev) => ({ ...prev, ...updatePayload }))

      toast.success(isResend ? 'Delivery email resent successfully!' : 'Deliverables sent to client!')
    } catch (err: any) {
      console.error('Delivery send error:', err)
      toast.error(err.message || 'Failed to send delivery email.')
    } finally {
      setIsSendingDelivery(false)
    }
  }

  const handleCopyDeliveryLink = () => {
    if (!deliveryAccessToken) return
    const link = getDeliveryLink(deliveryAccessToken)
    copyToClipboard(link)
    setCopiedDeliveryLink(true)
    setTimeout(() => setCopiedDeliveryLink(false), 2000)
    toast.success('Client delivery link copied!')
  }

  const handleOpenDeliveryPortal = () => {
    if (!deliveryAccessToken) return
    window.open(getDeliveryLink(deliveryAccessToken), '_blank')
  }

  if (isLoadingDetails) {
    return (
      <div className="p-6 text-center border-t border-gray-100 dark:border-gray-800">
        <Spinner size="md" className="mx-auto text-indigo-600 mb-2" />
        <p className="text-xs text-gray-500">Checking payment and delivery state...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
      {/* ─── PAYMENT STATUS & LINK SECTION ─── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
            1. Payment Status (Source of Truth)
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
                    <span>Send this link to the client for instant online card/MoMo payment.</span>
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium shrink-0 ml-2"
                    >
                      Record Cash/MoMo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── PAYMENT-GATED UPLOAD & DELIVERY SECTION ─── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            {isPaid ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-rose-500" />
            )}
            2. Deliverable Files & Client Delivery
          </h4>
          <span className="text-[11px] font-medium text-gray-500">
            {isPaid ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Upload Unlocked
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </span>
        </div>

        {/* LOCKED STATE BANNER */}
        {!isPaid ? (
          <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                🔒 Upload Locked
              </h5>
              <p className="text-xs text-gray-600 dark:text-gray-400 max-w-md mx-auto mt-1">
                File upload will become available once payment has been confirmed.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 rounded-lg border border-rose-200/80 dark:border-rose-800/80 text-[11px] text-gray-700 dark:text-gray-300 shadow-xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>
                Awaiting payment of{' '}
                <strong className="text-rose-600 dark:text-rose-400 font-mono">
                  {formatCurrency(currentJob.outstandingBalance || currentJob.originalAgreedPrice, currentJob.currency || 'GHS')}
                </strong>
              </span>
            </div>

            <div className="pt-1 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsPaymentModalOpen(true)}
                icon={<DollarSign className="w-3.5 h-3.5 text-emerald-600" />}
                className="text-xs"
              >
                Mark Payment as Received
              </Button>
            </div>
          </div>
        ) : (
          /* UNLOCKED STATE */
          <div className="space-y-4 animate-fade-in">
            {/* Unlocked Confirmation Badge */}
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong className="font-semibold">Payment Confirmed:</strong> File upload is active. You can now upload and dispatch final deliverables.
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-all bg-white dark:bg-gray-900 ${
                isUploading
                  ? 'border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500'
              }`}
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />

              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-2">
                <Upload className="w-5 h-5" />
              </div>

              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Choose deliverable files or drag & drop here
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-3">
                High-resolution images, videos, audio, ZIP archives, or documents
              </p>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                loading={isUploading}
                className="text-xs"
              >
                {isUploading ? 'Uploading Files...' : 'Select Files'}
              </Button>

              {/* Upload Progress */}
              {isUploading && (
                <div className="mt-4 max-w-xs mx-auto">
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-1.5 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">Uploading {uploadProgress}%</span>
                </div>
              )}
            </div>

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <span>Attached Deliverables ({uploadedFiles.length})</span>
                  <span className="text-[11px] text-gray-400">
                    Total: {formatFileSize(uploadedFiles.reduce((acc, f) => acc + (f.size || 0), 0))}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={file.id || idx}
                      className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/70 rounded-lg border border-gray-200/60 dark:border-gray-700/60 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                          {file.name}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                          ({formatFileSize(file.size)})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {file.url && (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Preview File"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          disabled={isSendingDelivery}
                          className="p-1 text-gray-400 hover:text-rose-600 transition-colors"
                          title="Remove File"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Action & Status */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
              {isDelivered && deliveryAccessToken ? (
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Delivery Sent to Client
                    </span>
                    {currentJob.deliveryEmailSentAt && (
                      <span className="text-[10px] text-gray-500">
                        Sent on {formatDate(currentJob.deliveryEmailSentAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Input
                      value={getDeliveryLink(deliveryAccessToken)}
                      readOnly
                      className="text-xs font-mono bg-white dark:bg-gray-900"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyDeliveryLink}
                      title="Copy Delivery Link"
                      className="shrink-0 px-2.5"
                    >
                      {copiedDeliveryLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleOpenDeliveryPortal}
                      title="Open Delivery Portal"
                      className="shrink-0 px-2.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSendDelivery(true)}
                      loading={isSendingDelivery}
                      className="text-xs text-indigo-600 dark:text-indigo-400 h-7 px-2"
                      icon={<RefreshCw className="w-3 h-3" />}
                    >
                      Resend Delivery Email
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full text-xs font-semibold"
                  variant="primary"
                  onClick={() => handleSendDelivery(false)}
                  loading={isSendingDelivery}
                  disabled={uploadedFiles.length === 0}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Submit & Send Delivery to {currentJob.clientEmail || currentJob.clientName}
                </Button>
              )}
            </div>
          </div>
        )}
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
              Record a payment received via cash, direct bank transfer, or offline MoMo. This will immediately confirm payment and unlock file uploads in real-time.
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
                Confirm & Unlock Upload
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
