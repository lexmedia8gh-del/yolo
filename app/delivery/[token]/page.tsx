'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import {
  Download,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  File,
  CheckCircle2,
  CheckCircle,
  Clock,
  AlertCircle,
  Lock,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Calendar,
  Layers,
  ArrowDownToLine,
  RefreshCw,
} from 'lucide-react'
import { formatCurrency, formatFileSize, formatDate, getFileCategory } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import toast from 'react-hot-toast'
import {
  PageEnter,
  FadeIn,
  SlideUp,
  CardReveal,
  StaggerContainer,
  StaggerItem,
  ErrorReveal,
  AnimatedItem,
  PulseIcon,
  AnimatePresence,
} from '@/lib/motion'

interface DeliveryFileDTO {
  id: string
  fileName: string
  originalName: string
  fileType: string
  fileSize: number
  downloadUrl: string
  downloadCount: number
  uploadedAt: string | null
}

interface DeliveryDTO {
  id: string
  title: string
  projectName: string
  clientName: string
  status: string
  expiresAt: string | null
  releasedAt: string | null
  notes: string
  fileCount: number
  totalSize: number
}

export default function ClientDeliveryPage() {
  return (
    <BrandingProvider>
      <ClientDeliveryPageInner />
    </BrandingProvider>
  )
}

function ClientDeliveryPageInner() {
  const params = useParams()
  const token = (params?.token as string) || ''
  const { branding } = useBranding()

  const [loading, setLoading] = useState(true)
  const [delivery, setDelivery] = useState<DeliveryDTO | null>(null)
  const [files, setFiles] = useState<DeliveryFileDTO[]>([])

  // Status states
  const [isExpired, setIsExpired] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [lockReason, setLockReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Download progress states
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [downloadingConfirmFileId, setDownloadingConfirmFileId] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  useEffect(() => {
    if (!token) return
    loadDelivery()
  }, [token])

  const loadDelivery = async () => {
    setLoading(true)
    setErrorMsg('')
    setIsExpired(false)
    setIsLocked(false)

    try {
      const res = await fetch(`/api/delivery/${encodeURIComponent(token)}`)
      const data = await res.json()

      if (res.status === 410 || data.isExpired) {
        setIsExpired(true)
        return
      }

      if (res.status === 403 || data.isLocked) {
        setIsLocked(true)
        setLockReason(data.lockReason || 'Delivery files are currently locked.')
        if (data.delivery) {
          setDelivery(data.delivery)
        }
        return
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to load project delivery details.')
        return
      }

      setDelivery(data.delivery)
      setFiles(data.files || [])
    } catch (err) {
      console.error('Error loading delivery:', err)
      setErrorMsg('A network error occurred while connecting to the server.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadSingle = async (file: DeliveryFileDTO) => {
    setDownloadingFileId(file.id)
    try {
      // Call server to track download & obtain signed URL
      const res = await fetch('/api/delivery/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fileId: file.id }),
      })
      const data = await res.json()

      if (!res.ok || !data.downloadUrl) {
        toast.error(data.error || 'Failed to download file.')
        return
      }

      // Update local download count
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, downloadCount: (f.downloadCount || 0) + 1 } : f))
      )

      // Trigger browser download
      const link = document.createElement('a')
      link.href = data.downloadUrl
      link.download = data.fileName || file.fileName
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success(`Downloading ${file.fileName}...`)
      setDownloadingConfirmFileId(file.id)
    } catch (err) {
      console.error('Download error:', err)
      toast.error('Download failed. Please try again.')
    } finally {
      setDownloadingFileId(null)
    }
  }

  const handleConfirmDownload = async (fileId: string) => {
    try {
      setDownloadingFileId(fileId) // Reuse loading state for the button
      const res = await fetch('/api/delivery/confirm-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fileId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to confirm download.')
        return
      }

      toast.success('Download confirmed and file securely removed.')
      // AnimatePresence will handle the exit animation before removing from DOM
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
      setDownloadingConfirmFileId(null)
    } catch (err) {
      console.error('Confirm error:', err)
      toast.error('Failed to confirm download.')
    } finally {
      setDownloadingFileId(null)
    }
  }

  const handleDownloadAll = async () => {
    if (files.length === 0) return
    setDownloadingAll(true)

    toast.success(`Starting download for ${files.length} files...`)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      await handleDownloadSingle(file)
      // Slight delay between files to avoid browser popup blocks
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }

    setDownloadingAll(false)
  }

  const renderFileIcon = (fileName: string, mimeType?: string) => {
    const cat = getFileCategory(fileName, mimeType)
    switch (cat) {
      case 'image':
        return <ImageIcon size={20} className="text-indigo-500" />
      case 'video':
        return <Video size={20} className="text-purple-500" />
      case 'audio':
        return <Music size={20} className="text-pink-500" />
      case 'pdf':
        return <FileText size={20} className="text-rose-500" />
      case 'archive':
        return <Archive size={20} className="text-amber-500" />
      default:
        return <File size={20} className="text-gray-500" />
    }
  }

  // ── Loading State ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
          <FadeIn className="text-center space-y-4">
            <PulseIcon className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto">
              <Sparkles size={24} className="text-indigo-400" />
            </PulseIcon>
            <p className="text-sm font-medium text-slate-400">Loading your project files...</p>
          </FadeIn>
        </div>
      </PageEnter>
    )
  }

  // ── Expired Link State ────────────────────────────────────────────────────
  if (isExpired) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
          <CardReveal className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
              <Clock size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white">Delivery Link Expired</h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Please contact {branding.businessName || 'LexMedia'} to request a refreshed access link.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 font-mono">LexMedia Studio Delivery System</p>
            </div>
          </CardReveal>
        </div>
      </PageEnter>
    )
  }

  // ── Payment Locked State ──────────────────────────────────────────────────
  if (isLocked) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
          <CardReveal className="max-w-md w-full bg-slate-900 border border-amber-500/20 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <Lock size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white">Delivery Pending Release</h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                {lockReason}
              </p>
            </div>
            {delivery?.projectName && (
              <div className="bg-slate-800/60 rounded-xl p-3.5 border border-slate-700/60 text-left">
                <p className="text-xs text-slate-400">Project</p>
                <p className="text-sm font-semibold text-white">{delivery.projectName}</p>
              </div>
            )}
            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 font-mono">LexMedia Studio Delivery System</p>
            </div>
          </CardReveal>
        </div>
      </PageEnter>
    )
  }

  // ── Invalid Token / Not Found ─────────────────────────────────────────────
  if (errorMsg || !delivery) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
          <ErrorReveal className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
              <AlertCircle size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-white">Delivery Not Found</h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                {errorMsg || 'The delivery link you entered is invalid or has been deactivated.'}
              </p>
            </div>
          </ErrorReveal>
        </div>
      </PageEnter>
    )
  }

  // ── Active Delivery Portal View ───────────────────────────────────────────
  return (
    <PageEnter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">

        {/* Top Navigation / Brand */}
        <FadeIn>
          <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {branding.logoLightUrl ? (
                  <img src={branding.logoLightUrl} alt={branding.businessName} className="h-8 object-contain" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md"
                    style={{ backgroundColor: branding.buttonColor || '#4F46E5' }}
                  >
                    {(branding.shortName || 'LX').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="font-bold tracking-tight text-white text-base">
                    {branding.businessName || 'LexMedia'}
                  </span>
                  <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono ml-2 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                    Delivery Portal
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck size={13} />
                  Secure Transfer
                </span>
              </div>
            </div>
          </header>
        </FadeIn>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full flex-1 space-y-8">

          {/* Welcome / Project Header Card */}
          <CardReveal delay={0.05}>
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
                <SlideUp delay={0.1} className="space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                    <Sparkles size={12} />
                    Project Complete
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {delivery.title || 'Your Project Is Ready'}
                  </h1>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
                    Hello <strong className="text-white font-semibold">{delivery.clientName}</strong>, your final files for{' '}
                    <strong className="text-white font-semibold">{delivery.projectName}</strong> have been finalized and are ready for download below.
                  </p>
                </SlideUp>

                {/* Download All CTA */}
                {files.length > 1 && (
                  <SlideUp delay={0.15} className="shrink-0">
                    <button
                      onClick={handleDownloadAll}
                      disabled={downloadingAll}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                    >
                      {downloadingAll ? (
                        <>
                          <Spinner size="sm" />
                          Downloading All...
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine size={18} />
                          Download All ({files.length} files · {formatFileSize(delivery.totalSize)})
                        </>
                      )}
                    </button>
                  </SlideUp>
                )}
              </div>

              {/* Delivery Meta Row */}
              <SlideUp delay={0.2} className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-slate-400">Total Files</p>
                  <p className="font-semibold text-white mt-0.5">{files.length} assets</p>
                </div>
                <div>
                  <p className="text-slate-400">Total Size</p>
                  <p className="font-semibold text-white mt-0.5">{formatFileSize(delivery.totalSize)}</p>
                </div>
                {delivery.expiresAt && (
                  <div>
                    <p className="text-slate-400">Link Expiry</p>
                    <p className="font-semibold text-amber-400 mt-0.5">{formatDate(delivery.expiresAt)}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-400">Status</p>
                  <p className="font-semibold text-emerald-400 mt-0.5">Ready for Download</p>
                </div>
              </SlideUp>
            </div>
          </CardReveal>

          {/* Note from Studio (if provided) */}
          {delivery.notes && (
            <SlideUp delay={0.15}>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 text-sm text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Studio Note</p>
                <p className="whitespace-pre-wrap">{delivery.notes}</p>
              </div>
            </SlideUp>
          )}

          {/* File List Section */}
          <div className="space-y-4">
            <FadeIn delay={0.2}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers size={18} className="text-indigo-400" />
                  Delivery Files ({files.length})
                </h2>
              </div>
            </FadeIn>

            {files.length === 0 ? (
              <FadeIn delay={0.25}>
                <div className="py-12 text-center bg-slate-900/40 border border-slate-800 border-dashed rounded-2xl">
                  <File size={32} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">No files in this delivery yet.</p>
                </div>
              </FadeIn>
            ) : (
              <AnimatePresence>
                <StaggerContainer delayStart={0.22} className="grid grid-cols-1 gap-3">
                  {files.map((file) => {
                    const isDownloadingThis = downloadingFileId === file.id
                    return (
                      <AnimatedItem
                        key={file.id}
                        itemKey={file.id}
                        className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group"
                      >
                        {/* File info */}
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            {renderFileIcon(file.fileName, file.fileType)}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                              {file.fileName || file.originalName}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                                {formatFileSize(file.fileSize)}
                              </span>
                              {file.uploadedAt && <span>Uploaded {formatDate(file.uploadedAt)}</span>}
                              {file.downloadCount > 0 && (
                                <span className="text-slate-500 font-mono">
                                  ({file.downloadCount} download{file.downloadCount > 1 ? 's' : ''})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Download Button */}
                        <div className="flex items-center gap-2 shrink-0 sm:self-center">
                          {downloadingConfirmFileId === file.id ? (
                            <div className="flex flex-col items-end gap-1.5 sm:mt-0 mt-3 w-full sm:w-auto">
                              <p className="text-[11px] text-amber-400 font-medium">Download started. Click to confirm:</p>
                              <button
                                onClick={() => handleConfirmDownload(file.id)}
                                disabled={downloadingFileId === file.id}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white border border-amber-500 hover:border-amber-400 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                              >
                                {downloadingFileId === file.id ? (
                                  <>
                                    <Spinner size="sm" />
                                    <span>Confirming...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle size={14} />
                                    <span>Confirm Download Complete</span>
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDownloadSingle(file)}
                              disabled={isDownloadingThis || downloadingAll}
                              className="w-full sm:mt-0 mt-3 sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700 hover:border-indigo-500 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                            >
                              {isDownloadingThis ? (
                                <>
                                  <Spinner size="sm" />
                                  <span>Downloading...</span>
                                </>
                              ) : (
                                <>
                                  <Download size={14} />
                                  <span>Download</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </AnimatedItem>
                    )
                  })}
                </StaggerContainer>
              </AnimatePresence>
            )}
          </div>
        </main>

        {/* Footer */}
        <FadeIn delay={0.3}>
          <footer className="border-t border-slate-800/80 bg-slate-900/40 py-8 px-4 sm:px-6 text-center text-xs text-slate-400 space-y-2">
            <p className="font-semibold text-slate-300">Thank you for choosing {branding.businessName || 'LexMedia'} Studio.</p>
            <p>© {new Date().getFullYear()} {branding.businessName || 'LexMedia'}. All rights reserved.</p>
          </footer>
        </FadeIn>

      </div>
    </PageEnter>
  )
}
