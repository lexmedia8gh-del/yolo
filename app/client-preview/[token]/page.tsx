'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Eye,
  Clock,
  AlertCircle,
  Lock,
  ExternalLink,
  Sparkles,
  Layers,
  CheckCircle2,
  ThumbsUp,
  MessageSquare,
  RefreshCw,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Video,
  Music,
  Share2,
  Copy,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  X,
  Send,
} from 'lucide-react'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatFileSize, formatDate, copyToClipboard, getFileCategory } from '@/lib/utils'
import toast, { Toaster } from 'react-hot-toast'

interface PreviewAssetDTO {
  id: string
  name: string
  originalName: string
  fileType: string
  fileSize: number
  previewUrl: string
  streamUrl?: string
  width?: number | null
  height?: number | null
  duration?: number | null
  order?: number
}

function isImageAsset(asset?: PreviewAssetDTO | null): boolean {
  if (!asset) return false
  const t = (asset.fileType || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = (asset.name || asset.originalName || '').toLowerCase()
  return (
    n.endsWith('.png') ||
    n.endsWith('.jpg') ||
    n.endsWith('.jpeg') ||
    n.endsWith('.webp') ||
    n.endsWith('.gif') ||
    n.endsWith('.svg') ||
    n.endsWith('.avif') ||
    n.endsWith('.bmp') ||
    n.endsWith('.ico')
  )
}

interface PreviewDTO {
  id: string
  token: string
  title: string
  description?: string
  clientName: string
  projectName: string
  status: string
  expiresAt: string | null
  watermark: {
    enabled: boolean
    text: string
    opacity: number
    fontSize?: number
    tilePattern: boolean
    dynamicPosition: boolean
  }
  assets: PreviewAssetDTO[]
  createdAt: string | null
}

type PreviewState = 'loading' | 'valid' | 'invalid' | 'expired' | 'revoked' | 'error'

export default function ClientPreviewPortalPage() {
  return (
    <BrandingProvider>
      <ClientPreviewPortalInner />
    </BrandingProvider>
  )
}

function ClientPreviewPortalInner() {
  const params = useParams()
  const rawToken = (params?.token as string) || ''
  const token = decodeURIComponent(rawToken).trim()
  const { branding } = useBranding()

  // State management
  const [state, setState] = useState<PreviewState>('loading')
  const [preview, setPreview] = useState<PreviewDTO | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [revokedReason, setRevokedReason] = useState<string>('')
  const [expiredAt, setExpiredAt] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string>('')

  // Asset viewer state
  const [activeAssetIndex, setActiveAssetIndex] = useState<number>(0)
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [isWindowBlurred, setIsWindowBlurred] = useState<boolean>(false)
  const [showInstructions, setShowInstructions] = useState<boolean>(false)

  // Gesture Swipe State
  const [dragOffset, setDragOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const thumbnailContainerRef = useRef<HTMLDivElement>(null)

  // Image load & failover state
  const [currentImageSrc, setCurrentImageSrc] = useState<string>('')
  const [imageLoading, setImageLoading] = useState<boolean>(true)
  const [imageError, setImageError] = useState<boolean>(false)
  const [hasTriedFailover, setHasTriedFailover] = useState<boolean>(false)

  // Floating watermark dynamic shifting state
  const [watermarkOffset, setWatermarkOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Feedback & Approval Modal states
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false)
  const [approvalNote, setApprovalNote] = useState<string>('')
  const [isApproved, setIsApproved] = useState<boolean>(false)
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState<boolean>(false)
  const [revisionNotes, setRevisionNotes] = useState<string>('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false)

  const viewerContainerRef = useRef<HTMLDivElement>(null)

  // 1. Navigation Handlers
  const handlePrevAsset = useCallback(() => {
    if (!preview?.assets || preview.assets.length <= 1) return
    if (activeAssetIndex > 0) {
      setActiveAssetIndex((prev) => prev - 1)
    }
  }, [preview?.assets, activeAssetIndex])

  const handleNextAsset = useCallback(() => {
    if (!preview?.assets || preview.assets.length <= 1) return
    if (activeAssetIndex < preview.assets.length - 1) {
      setActiveAssetIndex((prev) => prev + 1)
    }
  }, [preview?.assets, activeAssetIndex])

  // 2. Gesture Pointer Events for Touch Swipe
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel > 1) return // Do not swipe when image is zoomed in
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(true)
    setDragOffset(0)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !pointerStartRef.current || zoomLevel > 1) return
    const deltaX = e.clientX - pointerStartRef.current.x
    const deltaY = e.clientY - pointerStartRef.current.y

    // If vertical movement dominates, cancel drag to let page scroll
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaX) < 15) {
      return
    }

    setDragOffset(deltaX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !pointerStartRef.current || zoomLevel > 1) {
      setIsDragging(false)
      setDragOffset(0)
      pointerStartRef.current = null
      return
    }

    const deltaX = e.clientX - pointerStartRef.current.x
    const deltaY = e.clientY - pointerStartRef.current.y
    const swipeThreshold = 55 // px

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= swipeThreshold) {
      if (deltaX < 0) {
        handleNextAsset()
      } else {
        handlePrevAsset()
      }
    }

    setIsDragging(false)
    setDragOffset(0)
    pointerStartRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const handlePointerCancel = () => {
    setIsDragging(false)
    setDragOffset(0)
    pointerStartRef.current = null
  }

  // 3. Send forensic deterrent telemetry beacon to audit log
  const logAuditActivity = useCallback(
    async (event: string, assetName?: string, assetId?: string, metadata?: any) => {
      if (!token) return
      try {
        await fetch(`/api/client-preview/${encodeURIComponent(token)}/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            assetId,
            assetName,
            sessionId,
            metadata,
          }),
        })
      } catch {
        // Non-blocking telemetry
      }
    },
    [token, sessionId]
  )

  // 4. Fetch Preview Details from API
  const loadPreview = useCallback(async () => {
    if (!token) {
      setState('invalid')
      setErrorMessage('No preview token provided in the URL.')
      return
    }

    setState('loading')
    setErrorMessage('')

    try {
      const generatedSession = `ses_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`
      setSessionId(generatedSession)

      const res = await fetch(`/api/client-preview/${encodeURIComponent(token)}`, {
        headers: {
          'x-preview-session': generatedSession,
        },
      })
      const data = await res.json()

      if (data.state === 'invalid' || res.status === 404) {
        setState('invalid')
        setErrorMessage(data.message || 'Preview link is invalid.')
        return
      }

      if (data.state === 'expired' || res.status === 410 || data.isExpired) {
        setState('expired')
        setExpiredAt(data.expiresAt || null)
        setErrorMessage(data.message || 'This preview is no longer available.')
        return
      }

      if (data.state === 'revoked' || res.status === 403 || data.isRevoked) {
        setState('revoked')
        setRevokedReason(data.revokedReason || 'Access ended by the studio administrator.')
        setErrorMessage(data.message || 'This preview is no longer available.')
        return
      }

      if (res.ok && data.success && data.preview) {
        setPreview(data.preview)
        setState('valid')
        if (data.sessionId) {
          setSessionId(data.sessionId)
        }
        return
      }

      setState('error')
      setErrorMessage(data.message || data.error || 'Unable to load preview.')
    } catch (err: any) {
      console.error('[Client Preview Load Error]:', err)
      setState('error')
      setErrorMessage('Unable to connect to the preview server. Please try again.')
    }
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  // Silent background refresh of signed asset URLs every 15 minutes for long sessions
  useEffect(() => {
    if (state !== 'valid' || !token) return
    const refreshInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/client-preview/${encodeURIComponent(token)}`)
        const data = await res.json()
        if (data.success && data.preview && data.preview.assets) {
          setPreview((prev) => (prev ? { ...prev, assets: data.preview.assets } : data.preview))
        }
      } catch {
        // Silent background refresh
      }
    }, 15 * 60 * 1000)

    return () => clearInterval(refreshInterval)
  }, [state, token])

  // Intelligent preloading of adjacent images
  useEffect(() => {
    if (!preview?.assets || preview.assets.length <= 1) return
    const nextIdx = activeAssetIndex + 1
    const prevIdx = activeAssetIndex - 1

    ;[nextIdx, prevIdx].forEach((idx) => {
      if (idx >= 0 && idx < preview.assets.length) {
        const asset = preview.assets[idx]
        if (asset && isImageAsset(asset)) {
          const url = asset.previewUrl || asset.streamUrl
          if (url) {
            const img = new window.Image()
            img.src = url
          }
        }
      }
    })
  }, [activeAssetIndex, preview?.assets])

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
    if (thumbnailContainerRef.current) {
      const activeBtn = thumbnailContainerRef.current.querySelector<HTMLButtonElement>(
        `[data-asset-index="${activeAssetIndex}"]`
      )
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [activeAssetIndex])

  // Periodic subtle shifting of watermark to prevent automated composite removal
  useEffect(() => {
    if (state !== 'valid' || !preview?.watermark?.dynamicPosition) return
    const interval = setInterval(() => {
      setWatermarkOffset({
        x: Math.floor(Math.random() * 24) - 12,
        y: Math.floor(Math.random() * 24) - 12,
      })
    }, 4500)
    return () => clearInterval(interval)
  }, [state, preview?.watermark?.dynamicPosition])

  // Active asset pointer
  const activeAsset: PreviewAssetDTO | undefined =
    preview && preview.assets && preview.assets.length > 0
      ? preview.assets[activeAssetIndex] || preview.assets[0]
      : undefined

  const activeAssetName = activeAsset?.name
  const activeAssetId = activeAsset?.id

  // Keyboard navigation & anti-theft shortcut listener
  useEffect(() => {
    if (state !== 'valid') return

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement?.tagName?.toLowerCase()
      if (activeEl === 'input' || activeEl === 'textarea') return

      // ArrowLeft -> Prev Image
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevAsset()
        return
      }

      // ArrowRight -> Next Image
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextAsset()
        return
      }

      // Deter Save Page (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        toast('Confidential preview: direct saving is restricted.', {
          icon: '🛡️',
          duration: 3500,
        })
        logAuditActivity('save_blocked', activeAssetName, activeAssetId)
      }

      // Deter Print (Ctrl+P / Cmd+P)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        toast('Confidential proof: printing is restricted.', {
          icon: '🛡️',
          duration: 3500,
        })
        logAuditActivity('print_blocked', activeAssetName, activeAssetId)
      }

      // Fullscreen shortcut
      if (e.key === 'F11') {
        e.preventDefault()
        toggleFullscreen()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      toast('Right-click is protected on view-only proofs.', {
        icon: '🛡️',
        duration: 2500,
      })
    }

    const handleBlur = () => {
      logAuditActivity('blur_lock', activeAssetName, activeAssetId)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('blur', handleBlur)
    }
  }, [state, activeAssetName, activeAssetId, handlePrevAsset, handleNextAsset, logAuditActivity])

  // Sync image state when active asset changes
  useEffect(() => {
    if (activeAsset) {
      const initialSrc = activeAsset.previewUrl || activeAsset.streamUrl || ''
      setCurrentImageSrc(initialSrc)
      setImageLoading(Boolean(initialSrc && isImageAsset(activeAsset)))
      setImageError(!initialSrc && isImageAsset(activeAsset))
      setHasTriedFailover(false)
      setZoomLevel(1)

      if (activeAssetId) {
        logAuditActivity('asset_viewed', activeAssetName, activeAssetId)
      }
    } else {
      setCurrentImageSrc('')
      setImageLoading(false)
      setImageError(false)
    }
  }, [activeAsset, activeAssetId, activeAssetName, logAuditActivity])

  const handleImageLoad = () => {
    setImageLoading(false)
    setImageError(false)
  }

  const handleImageError = () => {
    if (!hasTriedFailover && activeAsset?.streamUrl && currentImageSrc !== activeAsset.streamUrl) {
      console.warn('[Client Preview] Primary URL failed, trying streamUrl:', activeAsset.streamUrl)
      setHasTriedFailover(true)
      setCurrentImageSrc(activeAsset.streamUrl)
      setImageLoading(true)
      setImageError(false)
      return
    }

    console.error('[Client Preview] Image failed to render:', {
      assetId: activeAssetId,
      name: activeAssetName,
      src: currentImageSrc,
    })
    setImageLoading(false)
    setImageError(true)
  }

  const handleRetryImage = async () => {
    setImageLoading(true)
    setImageError(false)
    setHasTriedFailover(false)

    try {
      if (token) {
        const res = await fetch(`/api/client-preview/${encodeURIComponent(token)}`)
        const data = await res.json()
        if (data.success && data.preview) {
          setPreview(data.preview)
          const refreshedAsset = data.preview.assets?.[activeAssetIndex] || data.preview.assets?.[0]
          const newSrc = refreshedAsset?.previewUrl || refreshedAsset?.streamUrl || ''
          if (newSrc) {
            const sep = newSrc.includes('?') ? '&' : '?'
            setCurrentImageSrc(`${newSrc}${sep}_retry=${Date.now()}`)
            return
          }
        }
      }
    } catch (refreshErr) {
      console.warn('[Client Preview] In-place refresh warning:', refreshErr)
    }

    const base = activeAsset?.streamUrl || activeAsset?.previewUrl || ''
    if (base) {
      const sep = base.includes('?') ? '&' : '?'
      setCurrentImageSrc(`${base}${sep}_retry=${Date.now()}`)
    }
  }

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerContainerRef.current?.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Watermark text interpolation
  const renderWatermarkText = (rawTemplate: string) => {
    const clientName = preview?.clientName || 'Client'
    const projectName = preview?.projectName || 'Project Proof'
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    return rawTemplate
      .replace(/{{client_name}}/g, clientName)
      .replace(/{{project_name}}/g, projectName)
      .replace(/{{session_id}}/g, sessionId || 'AUTH-SESSION')
      .replace(/{{date}}/g, dateStr)
  }

  // Handle client approval
  const handleApproveProof = async () => {
    setIsSubmittingFeedback(true)
    try {
      await logAuditActivity('feedback_submitted', activeAsset?.name, activeAsset?.id, {
        type: 'approval',
        notes: approvalNote,
      })
      setIsApproved(true)
      setIsApprovalModalOpen(false)
      toast.success('Thank you! Deliverable proof approved successfully.')
    } catch {
      toast.error('Unable to send approval. Please try again.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  // Handle client revision request
  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      toast.error('Please enter your revision notes.')
      return
    }
    setIsSubmittingFeedback(true)
    try {
      await logAuditActivity('feedback_submitted', activeAsset?.name, activeAsset?.id, {
        type: 'revision_request',
        notes: revisionNotes,
      })
      setIsRevisionModalOpen(false)
      setRevisionNotes('')
      toast.success('Revision request sent to the studio!')
    } catch {
      toast.error('Unable to send revision request.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  // Format time remaining
  const getTimeRemainingBadge = (expiresAtStr: string | null) => {
    if (!expiresAtStr) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Clock size={12} /> Indefinite Access
        </span>
      )
    }
    const target = new Date(expiresAtStr).getTime()
    const diffHours = Math.round((target - Date.now()) / (1000 * 60 * 60))

    if (diffHours <= 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle size={12} /> Expired
        </span>
      )
    }
    if (diffHours < 24) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Clock size={12} /> Expires in {diffHours}h
        </span>
      )
    }
    const diffDays = Math.ceil(diffHours / 24)
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <Clock size={12} /> Expires in {diffDays} {diffDays === 1 ? 'day' : 'days'}
      </span>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 1: LOADING ("Loading secure preview...")
  // ═══════════════════════════════════════════════════════════════
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 p-0.5 shadow-xl shadow-indigo-500/20 animate-pulse">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-400" />
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Loading secure preview...
            </h2>
            <p className="text-xs text-slate-400">
              Verifying cryptographic proof session and initializing digital watermark layer
            </p>
          </div>

          <div className="pt-2">
            <Spinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 2: INVALID TOKEN ("Preview link is invalid.")
  // ═══════════════════════════════════════════════════════════════
  if (state === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Preview Link Invalid
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {errorMessage || 'This preview link is invalid or has been deactivated by the studio.'}
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => (window.location.href = '/')}
            >
              Close Portal
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 3: EXPIRED PREVIEW ("This preview is no longer available.")
  // ═══════════════════════════════════════════════════════════════
  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock size={32} />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Clock size={13} /> Link Expired
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Preview Link Expired
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Access to this proof ended on {formatDate(expiredAt || new Date())}. Please contact {branding?.businessName || 'LEXMEDIA.GH'} for an updated access link.
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => (window.location.href = '/')}
            >
              Close Portal
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 4: REVOKED PREVIEW ("Access ended by admin.")
  // ═══════════════════════════════════════════════════════════════
  if (state === 'revoked') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/90 border border-rose-500/30 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldX size={32} />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <Lock size={13} /> Access Revoked
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Preview Access Revoked
            </h1>
            <p className="text-sm text-slate-300 font-medium">
              This preview is no longer available.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {revokedReason || 'Access to this preview proof has been concluded by the studio administrator.'}
            </p>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => (window.location.href = '/')}
            >
              Close Portal
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 5: SERVER ERROR ("Unable to load preview.")
  // ═══════════════════════════════════════════════════════════════
  if (state === 'error' || !preview) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertCircle size={32} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Unable to load preview.
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Please try again later.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <Button
              variant="primary"
              size="md"
              onClick={loadPreview}
              icon={<RefreshCw size={14} />}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE 6: VALID PREVIEW — RICH CLIENT VIEW-ONLY PORTAL
  // ═══════════════════════════════════════════════════════════════
  const watermarkText = renderWatermarkText(
    preview.watermark?.text ||
      '[CTRL ROOM] CONFIDENTIAL PREVIEW\n{{client_name}} | {{project_name}}\nSession: {{session_id}}\n{{date}}'
  )
  const watermarkOpacity =
    typeof preview.watermark?.opacity === 'number' ? preview.watermark.opacity : 0.22

  const hasMultipleAssets = Boolean(preview.assets && preview.assets.length > 1)
  const isFirstAsset = activeAssetIndex === 0
  const isLastAsset = Boolean(preview.assets && activeAssetIndex === preview.assets.length - 1)

  return (
    <div
      ref={viewerContainerRef}
      className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none ${
        isFullscreen ? 'fixed inset-0 z-50 overflow-hidden' : ''
      }`}
    >
      <Toaster position="top-center" />

      {/* Print protection media query: ensures completely blank page if client attempts Ctrl+P */}
      <style>{`
        @media print {
          body, html {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Brand & Deliverable Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.businessName}
                className="w-5 h-5 object-contain"
              />
            ) : (
              <Eye className="w-5 h-5 text-white" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                {preview.title}
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                <ShieldCheck size={11} /> View-Only Proof
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {preview.projectName} • Prepared for <strong className="text-slate-200">{preview.clientName}</strong>
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {getTimeRemainingBadge(preview.expiresAt)}

          {/* Quick Approval / Revision Buttons */}
          {isApproved ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 size={13} /> Proof Approved
            </span>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<MessageSquare size={13} />}
                onClick={() => setIsRevisionModalOpen(true)}
              >
                Request Revision
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<ThumbsUp size={13} />}
                onClick={() => setIsApprovalModalOpen(true)}
              >
                Approve Proof
              </Button>
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Proofing'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Proofing'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Optional Description / Instructions Banner */}
      {preview.description && (
        <div className="bg-slate-900/40 border-b border-slate-800/60 px-4 sm:px-6 py-2.5 text-xs text-slate-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-indigo-400 uppercase tracking-wider text-[10px]">Studio Notes:</span>
            <span className="truncate">{preview.description}</span>
          </div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-[11px] text-indigo-400 hover:underline shrink-0"
          >
            {showInstructions ? 'Hide details' : 'Read notes'}
          </button>
        </div>
      )}

      {showInstructions && preview.description && (
        <div className="bg-slate-900/90 border-b border-slate-800 p-4 sm:p-6 text-xs text-slate-300 leading-relaxed">
          <div className="max-w-3xl mx-auto space-y-2">
            <h4 className="font-semibold text-white">Review Instructions:</h4>
            <p className="whitespace-pre-line text-slate-300">{preview.description}</p>
          </div>
        </div>
      )}

      {/* Main Proof Viewer Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-hidden">
        {/* Main Asset Canvas with Swipe Carousel & Watermark */}
        <div
          className="w-full max-w-5xl h-[62vh] sm:h-[72vh] rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-2xl relative overflow-hidden flex items-center justify-center backdrop-blur-sm group touch-pan-y"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Image Position Indicator Badge (Section 6) */}
          {preview.assets && preview.assets.length > 1 && (
            <div className="absolute top-4 left-4 z-30 px-3.5 py-1.5 rounded-full bg-slate-950/85 border border-slate-800 backdrop-blur-md text-xs font-mono font-bold text-slate-200 shadow-xl flex items-center gap-1.5 select-none">
              <ImageIcon size={13} className="text-indigo-400" />
              <span>
                {activeAssetIndex + 1} / {preview.assets.length}
              </span>
            </div>
          )}

          {/* Previous / Next Overlay Controls (Section 5) */}
          {hasMultipleAssets && !isFirstAsset && (
            <button
              type="button"
              onClick={handlePrevAsset}
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-950/85 hover:bg-slate-900 border border-slate-800/90 text-white shadow-2xl backdrop-blur-md flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:border-indigo-500/50"
              title="Previous image"
              aria-label="Previous image"
            >
              <ChevronLeft size={22} className="text-white" />
            </button>
          )}

          {hasMultipleAssets && !isLastAsset && (
            <button
              type="button"
              onClick={handleNextAsset}
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-950/85 hover:bg-slate-900 border border-slate-800/90 text-white shadow-2xl backdrop-blur-md flex items-center justify-center transition-all cursor-pointer active:scale-95 hover:border-indigo-500/50"
              title="Next image"
              aria-label="Next image"
            >
              <ChevronRight size={22} className="text-white" />
            </button>
          )}

          {/* Asset Renderer */}
          {activeAsset ? (
            <div
              className="w-full h-full flex items-center justify-center p-2 sm:p-6 relative transition-transform duration-200 ease-out"
              style={{
                transform: `translateX(${dragOffset}px)`,
                transition: isDragging ? 'none' : 'transform 200ms ease-out',
              }}
            >
              {isImageAsset(activeAsset) ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  {/* Subtle transparency checkered backing */}
                  <div
                    className="relative max-w-full max-h-full flex items-center justify-center rounded-2xl overflow-hidden transition-transform duration-200"
                    style={{
                      transform: `scale(${zoomLevel})`,
                      backgroundImage:
                        'linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                    }}
                  >
                    {/* Image Loading Spinner */}
                    {imageLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-[2px] z-10 rounded-xl">
                        <Spinner size="md" />
                        <span className="text-[11px] font-medium text-slate-400 mt-2">Loading proof image...</span>
                      </div>
                    )}

                    {/* Image Render */}
                    {!imageError && currentImageSrc ? (
                      <img
                        key={`${activeAsset.id}_${currentImageSrc}`}
                        src={currentImageSrc}
                        alt={activeAsset.name || activeAsset.originalName || 'Proofing deliverable'}
                        draggable={false}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`max-w-full max-h-[58vh] sm:max-h-[66vh] object-contain rounded-xl pointer-events-none select-none shadow-2xl transition-opacity duration-200 ${
                          imageLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                      />
                    ) : null}

                    {/* Failed-Image Error State */}
                    {imageError && (
                      <div className="p-6 max-w-sm rounded-2xl bg-slate-950/90 border border-slate-800 text-center space-y-3 shadow-2xl">
                        <div className="w-12 h-12 mx-auto rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <AlertCircle size={24} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">Preview Image Unavailable</h4>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {activeAsset.name}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            Preview image temporarily unavailable. Please refresh the preview.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<RefreshCw size={12} />}
                          onClick={handleRetryImage}
                          className="w-full"
                          aria-label="Refresh preview"
                        >
                          Refresh Preview
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeAsset.fileType.startsWith('video/') ? (
                <div className="w-full h-full flex items-center justify-center">
                  <video
                    src={activeAsset.previewUrl || activeAsset.streamUrl}
                    controls
                    controlsList="nodownload noplaybackrate"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                    className="max-w-full max-h-full rounded-xl bg-black shadow-2xl"
                  />
                </div>
              ) : activeAsset.fileType.includes('pdf') || activeAsset.name.toLowerCase().endsWith('.pdf') ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-800">
                  <iframe
                    src={`${activeAsset.previewUrl || activeAsset.streamUrl}#toolbar=0&navpanes=0`}
                    className="w-full h-full border-0 bg-slate-900 rounded-2xl"
                    title={activeAsset.name}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              ) : activeAsset.fileType.startsWith('audio/') ? (
                <div className="max-w-lg w-full p-8 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Music size={32} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">{activeAsset.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{formatFileSize(activeAsset.fileSize)}</p>
                  </div>
                  <audio
                    src={activeAsset.previewUrl || activeAsset.streamUrl}
                    controls
                    controlsList="nodownload"
                    className="w-full mt-4"
                  />
                </div>
              ) : (
                /* Document / PDF / Other file type */
                <div className="max-w-md w-full p-8 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <FileText size={32} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">{activeAsset.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {activeAsset.fileType} • {formatFileSize(activeAsset.fileSize)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This file is securely registered in this proof package. Direct binary download is restricted in view-only proofing mode.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500">No assets in this proof.</div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* FORENSIC DIGITAL WATERMARK LAYER                                */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {preview.watermark?.enabled !== false && (
            <div
              className="absolute inset-0 pointer-events-none select-none z-20 overflow-hidden flex flex-col justify-around"
              style={{ opacity: watermarkOpacity }}
            >
              {/* Tiled diagonal grid pattern */}
              {preview.watermark?.tilePattern !== false && (
                <div className="absolute inset-0 grid grid-cols-2 sm:grid-cols-3 gap-12 sm:gap-20 p-6 -rotate-12 scale-110 pointer-events-none">
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="font-mono text-[10px] sm:text-[12px] font-bold text-slate-100 uppercase tracking-widest text-center leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    >
                      <div className="text-indigo-300">CONFIDENTIAL PROOF</div>
                      <div>{preview.clientName} • {preview.projectName}</div>
                      <div className="text-[9px] text-slate-300">SESSION: {sessionId.slice(0, 15)}</div>
                      <div className="text-[9px] opacity-75">{new Date().toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Dynamic floating shifting watermark badge */}
              {preview.watermark?.dynamicPosition !== false && (
                <div
                  className="absolute pointer-events-none transition-all duration-1000 ease-out"
                  style={{
                    bottom: `calc(15% + ${watermarkOffset.y}px)`,
                    right: `calc(10% + ${watermarkOffset.x}px)`,
                  }}
                >
                  <div className="px-3.5 py-2 rounded-xl bg-black/60 border border-white/20 backdrop-blur-sm text-[11px] font-mono text-white text-right shadow-2xl leading-tight">
                    <div className="font-bold text-indigo-300">[CTRL ROOM] FORENSIC PROOF</div>
                    <div className="text-[10px] text-slate-300">{preview.clientName}</div>
                    <div className="text-[9px] text-slate-400">ID: {preview.id?.slice(0, 8)} • {sessionId.slice(0, 10)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Floating Zoom / Control Bar for Images */}
          {isImageAsset(activeAsset) && !imageError && (
            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-slate-800 backdrop-blur-md shadow-2xl">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Zoom Out"
                aria-label="Zoom out"
              >
                <ZoomOut size={15} />
              </button>
              <span className="text-[11px] font-mono font-medium text-slate-300 px-1">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Zoom In"
                aria-label="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Reset Fit"
                aria-label="Reset fit"
              >
                <RotateCw size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Multi-Asset Thumbnail Selector Strip (Section 15) */}
        {preview.assets && preview.assets.length > 1 && (
          <div
            ref={thumbnailContainerRef}
            className="mt-4 flex items-center gap-2.5 max-w-5xl w-full overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-800"
          >
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap pl-1 shrink-0">
              Deliverables ({preview.assets.length}):
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {preview.assets.map((asset, idx) => {
                const isSelected = idx === activeAssetIndex
                return (
                  <button
                    key={asset.id}
                    type="button"
                    data-asset-index={idx}
                    onClick={() => setActiveAssetIndex(idx)}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer shrink-0 min-h-[44px] ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-500'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850'
                    }`}
                  >
                    {isImageAsset(asset) ? (
                      <ImageIcon size={14} className={isSelected ? 'text-white' : 'text-indigo-400'} />
                    ) : asset.fileType.startsWith('video/') ? (
                      <Video size={14} className={isSelected ? 'text-white' : 'text-purple-400'} />
                    ) : asset.fileType.startsWith('audio/') ? (
                      <Music size={14} className={isSelected ? 'text-white' : 'text-pink-400'} />
                    ) : (
                      <FileIcon size={14} className={isSelected ? 'text-white' : 'text-slate-400'} />
                    )}
                    <span className="truncate max-w-[150px]">{asset.name || asset.originalName}</span>
                    <span className="text-[10px] font-mono opacity-80 bg-slate-950/40 px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Mobile / Compact Approval Bar */}
        <div className="md:hidden mt-5 w-full max-w-5xl flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="md"
            className="flex-1 h-12 text-xs font-bold"
            icon={<MessageSquare size={14} />}
            onClick={() => setIsRevisionModalOpen(true)}
          >
            Request Revision
          </Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1 h-12 text-xs font-bold"
            icon={<ThumbsUp size={14} />}
            onClick={() => setIsApprovalModalOpen(true)}
          >
            Approve Proof
          </Button>
        </div>
      </main>

      {/* Footer Info & Verification Bar */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 sm:px-6 py-3 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={12} className="text-indigo-400" />
          <span>
            Secure client session ID: <strong className="text-slate-400 font-mono">{sessionId.slice(0, 16)}</strong>
          </span>
        </div>
        <div className="text-slate-400 text-center sm:text-right">
          © {new Date().getFullYear()} {branding?.businessName || 'LEXMEDIA.GH'} • Confidential Client Review Portal
        </div>
      </footer>

      {/* Approval Confirmation Modal */}
      <Modal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        title="Approve Deliverable Proof"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            By approving this proof, you confirm that <strong className="text-gray-900 dark:text-white">{preview.title}</strong> meets your creative vision and project requirements.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Optional Signature or Approval Note
            </label>
            <textarea
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder="e.g. Looks fantastic! Ready for the finalized master files."
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none resize-none h-20"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsApprovalModalOpen(false)}
              disabled={isSubmittingFeedback}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<ThumbsUp size={13} />}
              onClick={handleApproveProof}
              disabled={isSubmittingFeedback}
            >
              {isSubmittingFeedback ? 'Sending...' : 'Confirm Approval'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revision Request Modal */}
      <Modal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        title="Request Revisions"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Let the studio know what adjustments or feedback you have for <strong className="text-gray-900 dark:text-white">{preview.title}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Revision Notes & Specific Changes
            </label>
            <textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Detail your requested revisions, timestamps, or color/copy adjustments..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none resize-none h-28"
              required
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRevisionModalOpen(false)}
              disabled={isSubmittingFeedback}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Send size={13} />}
              onClick={handleRequestRevision}
              disabled={isSubmittingFeedback}
            >
              {isSubmittingFeedback ? 'Submitting...' : 'Send Revision Request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
