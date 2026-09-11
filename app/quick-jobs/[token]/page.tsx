'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  UploadCloud,
  FileText,
  File,
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw,
  Send,
  ExternalLink,
} from 'lucide-react'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import { formatCurrency, formatFileSize, copyToClipboard } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { getSupabaseClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface QuickJobDTO {
  id: string
  clientName: string
  clientEmail?: string
  jobDescription: string
  serviceTitle?: string
  originalAgreedPrice: number
  amountPaid: number
  outstandingBalance: number
  currency: string
  paymentStatus: string
  deliveryStatus: string
  isPaid: boolean
  token: string
  deliveryAccessToken?: string
  paymentToken?: string
}

interface FileDTO {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  downloadUrl?: string
  uploadedAt?: string | null
}

function QuickJobPortalContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { branding } = useBranding()

  const token = (params?.token as string) || ''
  const refQuery = searchParams?.get('reference')

  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState<QuickJobDTO | null>(null)
  const [files, setFiles] = useState<FileDTO[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // Payment state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [finalDeliveryLink, setFinalDeliveryLink] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Verify payment from Paystack redirect
  const verifyPayment = React.useCallback(async (reference: string, payToken: string) => {
    setIsProcessingPayment(true)
    try {
      const res = await fetch(
        `/api/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(payToken)}`
      )
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        toast.success('Payment verified! Uploads are now unlocked.')
        // Reload details to update payment state
        const reloadRes = await fetch(`/api/quick-jobs/portal/${encodeURIComponent(token)}`)
        const reloadData = await reloadRes.json()
        if (reloadRes.ok && reloadData.job) {
          setJob(reloadData.job)
          setFiles(reloadData.files || [])
        }
      }
    } catch (err) {
      console.error('Payment verification error:', err)
    } finally {
      setIsProcessingPayment(false)
    }
  }, [token])

  // 2. Load Quick Job details
  const fetchJobDetails = React.useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/quick-jobs/portal/${encodeURIComponent(token)}`)
      const data = await res.json()

      if (res.ok && data.success && data.job) {
        setJob(data.job)
        setFiles(data.files || [])

        // If returned from Paystack with reference, verify it
        if (refQuery) {
          await verifyPayment(refQuery, data.job.paymentToken || token)
        }
      } else {
        setErrorMsg(data.error || 'This Quick Job link is invalid or has expired.')
      }
    } catch (err: any) {
      console.error('Error fetching quick job:', err)
      setErrorMsg('Failed to load Quick Job details. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token, refQuery, verifyPayment])

  useEffect(() => {
    fetchJobDetails()
  }, [fetchJobDetails])

  // 3. Initiate Paystack Payment
  const handlePayNow = async () => {
    if (!job) return
    setIsProcessingPayment(true)

    try {
      const payToken = job.paymentToken || job.token || token
      const amountToPay = job.outstandingBalance > 0 ? job.outstandingBalance : job.originalAgreedPrice

      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: payToken,
          email: job.clientEmail || 'client@lexmedia.com',
          amount: amountToPay,
          invoiceNumber: `QJ-${job.id.slice(0, 8).toUpperCase()}`,
          clientName: job.clientName,
          callbackPath: `/quick-jobs/`,
        }),
      })

      const data = await res.json()
      if (data.status && data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        toast.error(data.error || 'Failed to initialize payment gateway')
      }
    } catch (err) {
      console.error('Pay error:', err)
      toast.error('Payment initialization failed. Please try again.')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // 4. Handle File Upload (Unlocked only after verified payment)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!job?.isPaid) {
      toast.error('Uploads are locked until payment is verified.')
      return
    }

    const uploadedFiles = e.target.files
    if (!uploadedFiles || uploadedFiles.length === 0) return

    setIsUploading(true)
    setUploadProgress(10)

    try {
      const supabase = getSupabaseClient()
      const bucketName = 'deliveries'

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i]
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const storagePath = `quick-jobs/${job.id}/${Date.now()}_${safeName}`

        // Upload file to Supabase storage
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
          })

        if (uploadErr) {
          throw new Error(`Storage upload failed: ${uploadErr.message}`)
        }

        // Get public or signed URL
        const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath)
        const directUrl = publicUrlData?.publicUrl || ''

        // Register file with backend
        const recordRes = await fetch('/api/quick-jobs/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            clientId: job.id,
            clientName: job.clientName,
            directUrl,
            storagePath,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
          }),
        })

        if (!recordRes.ok) {
          const recordErr = await recordRes.json()
          throw new Error(recordErr.error || 'Failed to record uploaded file.')
        }

        setUploadProgress(Math.round(((i + 1) / uploadedFiles.length) * 100))
      }

      toast.success('File(s) uploaded successfully!')
      // Refresh files list
      await fetchJobDetails()
    } catch (err: any) {
      console.error('File upload error:', err)
      toast.error(err.message || 'File upload failed.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 5. Submit Deliverables & Trigger Brevo Notification
  const handleSubmitDeliverables = async () => {
    if (!job?.isPaid) {
      toast.error('Payment must be confirmed before submitting.')
      return
    }

    if (files.length === 0) {
      toast.error('Please upload at least one file before submitting.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/quick-jobs/portal/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setIsSubmitted(true)
        if (data.deliveryLink) {
          setFinalDeliveryLink(data.deliveryLink)
        }
        toast.success('Deliverables submitted successfully! Client has been notified.')
      } else {
        toast.error(data.error || 'Failed to submit deliverables.')
      }
    } catch (err: any) {
      console.error('Submission error:', err)
      toast.error(err.message || 'Submission failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <Spinner size="lg" className="text-indigo-500 mb-4" />
        <p className="text-sm text-slate-400 font-medium">Securing Quick Job portal...</p>
      </div>
    )
  }

  if (errorMsg || !job) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-bold text-white">Access Restricted</h2>
          <p className="text-sm text-slate-400">{errorMsg || 'Invalid Quick Job token.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-indigo-500 selection:text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />

      <div className="max-w-3xl mx-auto space-y-8 relative z-10">
        {/* Brand & Job Header */}
        <header className="border-b border-slate-800/80 pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400 mb-2">
              <ShieldCheck size={14} />
              <span>Secure Quick Job Portal</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {branding.businessName || 'LexMedia'} Studio
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Client: <strong className="text-slate-200">{job.clientName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                job.isPaid
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              {job.isPaid ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Payment Verified</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Payment Pending</span>
                </>
              )}
            </span>
          </div>
        </header>

        {/* ── Section 1: Job Summary & Financials ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Deliverables Description
            </span>
            <h2 className="text-lg font-bold text-white leading-relaxed">
              {job.jobDescription}
            </h2>
            {job.serviceTitle && (
              <p className="text-xs text-slate-400 font-medium">
                Service: {job.serviceTitle}
              </p>
            )}
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800/80">
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Agreed Total
              </span>
              <span className="text-base font-bold text-white font-mono">
                {formatCurrency(job.originalAgreedPrice, job.currency)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Amount Paid
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {formatCurrency(job.amountPaid, job.currency)}
              </span>
            </div>
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/60">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                Outstanding Balance
              </span>
              <span
                className={`text-base font-bold font-mono ${
                  job.isPaid ? 'text-slate-500' : 'text-rose-400'
                }`}
              >
                {formatCurrency(job.outstandingBalance, job.currency)}
              </span>
            </div>
          </div>

          {/* Payment CTA if Unpaid */}
          {!job.isPaid && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
              <div className="flex items-start gap-3">
                <Lock size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                    Payment Required to Unlock Deliverables & Uploads
                  </h4>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    Please complete the outstanding balance of{' '}
                    <strong className="font-mono font-bold text-white">
                      {formatCurrency(job.outstandingBalance, job.currency)}
                    </strong>{' '}
                    via Paystack to unlock the file upload and delivery section.
                  </p>
                </div>
              </div>

              <button
                onClick={handlePayNow}
                disabled={isProcessingPayment}
                className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Connecting to Paystack...</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    <span>Pay {formatCurrency(job.outstandingBalance, job.currency)} with Paystack</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── Section 2: Deliverables Upload Section (Locked if Unpaid) ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl space-y-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Deliverable Files
                </span>
                {job.isPaid ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    Uploads Unlocked
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                    Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {job.isPaid
                  ? 'Select or drop project deliverables to prepare them for delivery.'
                  : 'Files cannot be uploaded or submitted until payment is confirmed.'}
              </p>
            </div>
          </div>

          {/* Upload Drop Zone / Locked Overlay */}
          <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
              job.isPaid
                ? 'border-slate-700 bg-slate-950/40 hover:border-indigo-500/50 hover:bg-slate-950/60'
                : 'border-slate-800/80 bg-slate-950/20 opacity-60 cursor-not-allowed'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={!job.isPaid || isUploading}
              onChange={handleFileUpload}
              className="hidden"
              id="quick-job-file-input"
            />

            <div className="max-w-sm mx-auto space-y-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
                  job.isPaid
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    : 'bg-slate-800/50 text-slate-500 border border-slate-800'
                }`}
              >
                {job.isPaid ? <UploadCloud size={28} /> : <Lock size={28} />}
              </div>

              {job.isPaid ? (
                <div>
                  <label
                    htmlFor="quick-job-file-input"
                    className="inline-block py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer transition-all shadow-md shadow-indigo-600/20"
                  >
                    {isUploading ? `Uploading (${uploadProgress}%)...` : 'Choose Deliverable Files'}
                  </label>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Supports high-resolution images, videos, audio, ZIP archives, and documents.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-slate-300">Upload Section Locked</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Complete the payment above to activate file uploads.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Files List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Uploaded Files ({files.length})
              </h4>
              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-200 truncate">{f.fileName}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formatFileSize(f.fileSize)}
                        </span>
                      </div>
                    </div>

                    {f.downloadUrl && (
                      <a
                        href={f.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] flex items-center gap-1.5 transition-all"
                      >
                        <Download size={12} />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 3: Submit & Release Deliverables Button ── */}
          {job.isPaid && (
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              {isSubmitted ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 size={18} />
                    <span>Deliverables Successfully Released!</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    The delivery notification has been dispatched via Brevo.
                  </p>
                  {finalDeliveryLink && (
                    <div className="flex items-center gap-2 max-w-md mx-auto pt-1">
                      <input
                        type="text"
                        readOnly
                        value={finalDeliveryLink}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300"
                      />
                      <button
                        onClick={() => {
                          copyToClipboard(finalDeliveryLink)
                          toast.success('Delivery link copied!')
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleSubmitDeliverables}
                  disabled={isSubmitting || files.length === 0}
                  className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Processing Delivery & Sending Notification...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Submit Deliverables & Notify Client</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-4">
          <p>© {new Date().getFullYear()} {branding.businessName || 'LexMedia'} Studio. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}

export default function QuickJobPortalPage() {
  return (
    <BrandingProvider>
      <QuickJobPortalContent />
    </BrandingProvider>
  )
}
