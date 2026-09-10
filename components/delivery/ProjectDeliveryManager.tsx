'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Upload,
  File,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Trash2,
  ExternalLink,
  Copy,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Lock,
  Unlock,
  RefreshCw,
  Share2,
  Sparkles,
  Layers,
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Pause,
  Play,
  RotateCcw,
  Wifi,
  WifiOff,
  Send,
  Mail,
} from 'lucide-react'
import { ResumableUploadTask, UploadTaskProgress } from '@/lib/supabase/resumable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import {
  COLLECTIONS,
  getDocument,
  getDocuments,
  addDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  serverTimestamp,
  where,
  orderBy,
} from '@/lib/firebase/firestore'
import { uploadDeliveryFile, deleteDeliveryFile } from '@/lib/firebase/storage'
import type {
  Project,
  QuickJob,
  Client,
  Invoice,
  Delivery,
  DeliveryFile,
  DeliveryStatus,
  DeliveryExpirationOption,
} from '@/lib/types'
import {
  formatCurrency,
  formatFileSize,
  formatDate,
  getFileCategory,
  generateSecureToken,
  copyToClipboard,
  getDeliveryLink,
} from '@/lib/utils'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { optimizeImageFile } from '@/lib/utils/image-optimizer'

export interface ProjectDeliveryManagerProps {
  project?: Project
  quickJob?: QuickJob
  client?: Client | null
  invoice?: Invoice | null
  onUpdate?: (updatedData: Partial<any>) => void
}

interface StagedFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  originalSize?: number
  isOptimized?: boolean
  previewUrl?: string
}

export function ProjectDeliveryManager({
  project,
  quickJob,
  client,
  invoice,
  onUpdate,
}: ProjectDeliveryManagerProps) {
  const resolvedProjectId = project?.id || ''
  const resolvedQuickJobId = quickJob?.id || ''
  const resolvedTargetId = resolvedProjectId || resolvedQuickJobId
  const resolvedClientId = project?.clientId || quickJob?.clientId || client?.id || ''
  const resolvedClientName = project?.clientName || quickJob?.clientName || client?.fullName || 'Client'
  const resolvedProjectName = project?.name || quickJob?.jobDescription || 'Deliverable'
  const resolvedInvoiceId = project?.invoiceId || invoice?.id || ''
  const resolvedClientPhone = client?.whatsappNumber || client?.phone || quickJob?.clientPhone || ''
  const resolvedCurrency = project?.currency || quickJob?.currency || invoice?.currency || 'GHS'

  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [files, setFiles] = useState<DeliveryFile[]>([])
  const [loading, setLoading] = useState(true)
  
  // Staged files (selected before upload)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: UploadTaskProgress }>({})
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const activeTasksRef = useRef<{ [key: string]: ResumableUploadTask }>({})

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  
  // Modals & action states
  const [showExpireModal, setShowExpireModal] = useState(false)
  const [selectedExpOption, setSelectedExpOption] = useState<DeliveryExpirationOption>('never')
  const [customDays, setCustomDays] = useState<number>(14)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [canonicalUrl, setCanonicalUrl] = useState('')

  // Delivery Release Confirmation & Resend States
  const [showReleaseConfirmModal, setShowReleaseConfirmModal] = useState(false)
  const [pendingIsResend, setPendingIsResend] = useState(false)

  // Admin Release & Confirmation Modal States
  const [showAdminReleaseModal, setShowAdminReleaseModal] = useState(false)
  const [showRevokeReleaseModal, setShowRevokeReleaseModal] = useState(false)
  const [adminReleaseReason, setAdminReleaseReason] = useState('')
  const [adminReleaseConfirmed, setAdminReleaseConfirmed] = useState(false)
  const [revokeConfirmed, setRevokeConfirmed] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)
  const [fileToReplace, setFileToReplace] = useState<DeliveryFile | null>(null)
  const [isReplacingFile, setIsReplacingFile] = useState(false)

  // Optional Image Optimization (OFF by default)
  const [imageOptimizationEnabled, setImageOptimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lexmedia_image_optimization')
      if (saved !== null) {
        return saved === 'true'
      }
    }
    return false
  })

  const handleToggleOptimization = (enabled: boolean) => {
    setImageOptimizationEnabled(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem('lexmedia_image_optimization', String(enabled))
    }
    toast.success(
      enabled
        ? 'Image optimization is now ON (compressed for delivery)'
        : 'Image optimization is now OFF (retaining original quality & resolution)'
    )
  }

  // 1. Fetch or create Delivery record for this Project or Quick Job
  useEffect(() => {
    if (!resolvedTargetId) return
    loadDeliveryData()
  }, [resolvedTargetId])

  const loadDeliveryData = async () => {
    setLoading(true)
    try {
      // Fetch or initialize delivery via Server Admin API (guarantees server-side Firestore truth)
      const queryParams = new URLSearchParams({
        projectId: resolvedProjectId,
        quickJobId: resolvedQuickJobId,
        clientId: resolvedClientId,
        projectName: resolvedProjectName,
        clientName: resolvedClientName,
        invoiceId: resolvedInvoiceId,
      })

      const res = await fetch(`/api/delivery/admin?${queryParams.toString()}`)
      const data = await res.json()

      if (!res.ok || !data.delivery) {
        throw new Error(data.error || 'Failed to fetch delivery record')
      }

      const currentDelivery: Delivery = data.delivery
      setDelivery(currentDelivery)
      setCanonicalUrl(data.publicUrl || '')
      setSelectedExpOption(currentDelivery.expirationOption || 'never')
      const loadedFiles = data.files || []
      setFiles(loadedFiles)

      onUpdate?.({
        deliveryAccessToken: currentDelivery.accessToken,
        fileCount: loadedFiles.length,
        deliveryStatus: currentDelivery.isReleased ? 'Released' : loadedFiles.length > 0 ? 'Ready' : 'Not Ready',
      })
    } catch (err: any) {
      console.error('Error loading delivery manager:', err)
      const detail = err?.message || 'Please check your connection and try again.'
      toast.error(`Delivery files could not be loaded: ${detail}`)
    } finally {
      setLoading(false)
    }
  }

  // 2. Stage Files Selected with Pre-Upload Size Validation
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedList = e.target.files
    if (!selectedList || selectedList.length === 0 || !delivery) return

    const MAX_FILE_SIZE_MB = 500
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

    const validFiles: File[] = []
    for (const f of Array.from(selectedList)) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`"${f.name}" is too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`)
      } else {
        validFiles.push(f)
      }
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const newStaged: StagedFile[] = validFiles.map((f) => {
      const isImage = f.type.startsWith('image/')
      return {
        id: generateSecureToken(12),
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || f.name.split('.').pop() || 'unknown',
        previewUrl: isImage ? URL.createObjectURL(f) : undefined,
      }
    })

    setStagedFiles((prev) => [...prev, ...newStaged])
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Trigger immediate upload of these files for smooth UX
    await startUploadForFiles(newStaged)
  }

  const handleRemoveStaged = (id: string) => {
    if (activeTasksRef.current[id]) {
      activeTasksRef.current[id].cancel()
      delete activeTasksRef.current[id]
    }
    const fileToRemove = stagedFiles.find((f) => f.id === id)
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl)
    }
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
    setUploadProgress((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const handleClearStaged = () => {
    Object.values(activeTasksRef.current).forEach((task) => task.cancel())
    activeTasksRef.current = {}
    stagedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
    })
    setStagedFiles([])
    setUploadProgress({})
  }

  // 3. Process Resumable Upload of Staged Files
  const handleStartUpload = async () => {
    await startUploadForFiles(stagedFiles)
  }

  const startUploadForFiles = async (filesToUpload: StagedFile[]) => {
    if (filesToUpload.length === 0 || !delivery) return

    setIsUploading(true)

    for (const staged of filesToUpload) {
      const currentProgress = uploadProgress[staged.id]
      if (currentProgress?.status === 'done') continue

      try {
        let uploadFile = staged.file
        let originalSize = staged.size
        let isOptimized = false
        let finalSize = staged.size

        // Initial progress state
        setUploadProgress((prev) => ({
          ...prev,
          [staged.id]: {
            fileId: staged.id,
            fileName: staged.name,
            fileSize: staged.size,
            bytesUploaded: 0,
            percent: 0,
            status: 'preparing',
            statusMessage: 'Preparing upload...',
            speedBytesPerSec: 0,
            estimatedTimeRemainingSeconds: 0,
            retryAttempt: 0,
            maxRetries: 5,
          },
        }))

        if (imageOptimizationEnabled && staged.file.type.startsWith('image/')) {
          setUploadProgress((prev) => ({
            ...prev,
            [staged.id]: {
              ...prev[staged.id],
              status: 'optimizing',
              statusMessage: 'Optimizing image for fast delivery...',
            },
          }))

          const optResult = await optimizeImageFile(staged.file)
          if (optResult.optimized) {
            uploadFile = optResult.file
            isOptimized = true
            finalSize = optResult.optimizedSize
            originalSize = optResult.originalSize

            setStagedFiles((prev) =>
              prev.map((f) =>
                f.id === staged.id
                  ? {
                      ...f,
                      file: optResult.file,
                      size: optResult.optimizedSize,
                      originalSize: optResult.originalSize,
                      isOptimized: true,
                    }
                  : f
              )
            )
          }
        }

        const fileDocId = generateSecureToken(16)
        
        // Instantiate Resumable Upload Task
        const task = new ResumableUploadTask({
          projectId: resolvedProjectId || undefined,
          quickJobId: resolvedQuickJobId || undefined,
          deliveryId: delivery.id,
          fileId: fileDocId,
          file: uploadFile,
          clientId: resolvedClientId,
          onProgress: (progress: UploadTaskProgress) => {
            setUploadProgress((prev) => ({
              ...prev,
              [staged.id]: progress,
            }))
          },
        })

        activeTasksRef.current[staged.id] = task

        // Execute task (handles chunking, retries, network drops, and database registration on success)
        await task.start()

        toast.success(`"${staged.name}" uploaded successfully!`)
        await loadDeliveryData()

        setTimeout(() => {
          if (staged.previewUrl) URL.revokeObjectURL(staged.previewUrl)
          setStagedFiles((prev) => prev.filter((f) => f.id !== staged.id))
          setUploadProgress((prev) => {
            const copy = { ...prev }
            delete copy[staged.id]
            return copy
          })
          delete activeTasksRef.current[staged.id]
        }, 1200)

      } catch (err: any) {
        console.error(`Failed to upload ${staged.name}:`, err)
        toast.error(`Upload error on "${staged.name}": ${err?.message || 'Upload failed.'}`)
      }
    }

    setIsUploading(false)
  }

  const handlePauseUpload = (stagedId: string) => {
    activeTasksRef.current[stagedId]?.pause()
  }

  const handleResumeUpload = (stagedId: string) => {
    activeTasksRef.current[stagedId]?.resume()
  }

  const handleRetryUpload = async (stagedId: string) => {
    const task = activeTasksRef.current[stagedId]
    if (task) {
      try {
        await task.retry()
        toast.success('Upload complete!')
        await loadDeliveryData()
      } catch (err: any) {
        toast.error(err?.message || 'Retry failed.')
      }
    } else {
      const fileToRetry = stagedFiles.find((f) => f.id === stagedId)
      if (fileToRetry) {
        await startUploadForFiles([fileToRetry])
      }
    }
  }

  const handleCancelUpload = (stagedId: string) => {
    if (activeTasksRef.current[stagedId]) {
      activeTasksRef.current[stagedId].cancel()
      delete activeTasksRef.current[stagedId]
    }
    handleRemoveStaged(stagedId)
  }

  // File replacement actions for step 14
  const handleReplaceClick = (file: DeliveryFile) => {
    if (isUploading || isReplacingFile) return
    setFileToReplace(file)
    setTimeout(() => {
      replaceFileInputRef.current?.click()
    }, 50)
  }

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedList = e.target.files
    if (!selectedList || selectedList.length === 0 || !delivery || !fileToReplace) return

    const rawFile = selectedList[0]
    setIsReplacingFile(true)
    const toastId = toast.loading(`Replacing "${fileToReplace.fileName}"...`)

    try {
      let uploadFile = rawFile
      let finalSize = rawFile.size

      // 1. Image Optimization if enabled
      if (imageOptimizationEnabled && rawFile.type.startsWith('image/')) {
        toast.loading(`Optimizing image...`, { id: toastId })
        const optResult = await optimizeImageFile(rawFile)
        if (optResult.optimized) {
          uploadFile = optResult.file
          finalSize = optResult.optimizedSize
        }
      }

      toast.loading(`Uploading to storage...`, { id: toastId })
      const newFileId = generateSecureToken(16)

      // 2. Upload the new file to Supabase Storage
      const { downloadUrl, storagePath: newStoragePath } = await uploadDeliveryFile(
        resolvedProjectId || undefined,
        delivery.id,
        newFileId,
        uploadFile,
        undefined,
        resolvedClientId,
        resolvedQuickJobId || undefined
      )

      toast.loading(`Updating database...`, { id: toastId })

      // Keep track of the old storage path to delete later
      const oldStoragePath = fileToReplace.storagePath

      // 3. Update Firebase/Firestore with the new file reference
      await updateDocument(COLLECTIONS.DELIVERY_FILES, fileToReplace.id, {
        fileName: rawFile.name,
        originalName: rawFile.name,
        fileType: uploadFile.type,
        fileSize: finalSize,
        storagePath: newStoragePath,
        downloadUrl,
        uploadedAt: new Date() as any, // fallback
      })

      // Refresh list from database truth
      await loadDeliveryData()
      toast.success('File replaced successfully!', { id: toastId })

      // 4. Safely delete the old file from Supabase Storage only after new database record is verified
      if (oldStoragePath) {
        try {
          await deleteDeliveryFile(oldStoragePath)
        } catch (delErr) {
          console.warn('Failed to delete old file after replacement:', delErr)
        }
      }

    } catch (err: any) {
      console.error('File replacement failed:', err)
      toast.error(`Replacement failed: ${err?.message || 'Unable to replace file.'}`, { id: toastId })
    } finally {
      setIsReplacingFile(false)
      setFileToReplace(null)
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = ''
    }
  }

  // 4. Handle File Delete
  const handleDeleteFile = async (file: DeliveryFile) => {
    if (!confirm(`Delete "${file.fileName}" from this delivery?`)) return

    try {
      if (file.storagePath) {
        await deleteDeliveryFile(file.storagePath)
      }
      await deleteDocument(COLLECTIONS.DELIVERY_FILES, file.id)

      const remainingFiles = files.filter((f) => f.id !== file.id)
      setFiles(remainingFiles)
      onUpdate?.({ fileCount: remainingFiles.length })

      if (delivery) {
        const nextSize = Math.max(0, (delivery.totalSize || 0) - (file.fileSize || 0))
        const nextStatus: DeliveryStatus = remainingFiles.length === 0 ? 'Not Ready' : delivery.status
        await updateDocument(COLLECTIONS.DELIVERIES, delivery.id, {
          fileCount: remainingFiles.length,
          totalSize: nextSize,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        })
        setDelivery((prev) => (prev ? { ...prev, fileCount: remainingFiles.length, totalSize: nextSize, status: nextStatus } : null))
      }

      toast.success('File removed.')
    } catch (err) {
      console.error('Delete error:', err)
      toast.error('Unable to remove file. Please try again.')
    }
  }

  // 5. Regenerate Access Link
  const handleRegenerateLink = async () => {
    if (!delivery) return
    setIsRegenerating(true)
    try {
      const newToken = generateSecureToken(24)
      const res = await fetch('/api/delivery/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          updates: { accessToken: newToken },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')

      setCanonicalUrl(data.publicUrl || '')
      setDelivery((prev) => (prev ? { ...prev, accessToken: data.accessToken || newToken } : null))
      toast.success('Secure delivery link regenerated!')
    } catch {
      toast.error('Failed to regenerate link.')
    } finally {
      setIsRegenerating(false)
    }
  }

  // 6. Release Delivery Operations
  const executeAdminRelease = async () => {
    if (!delivery) return
    setIsReleasing(true)
    try {
      const res = await fetch('/api/delivery/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          release: true,
          adminOverride: true,
          reason: adminReleaseReason.trim() || 'Manual administrator override',
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to release delivery')
      }

      setCanonicalUrl(data.publicUrl || '')
      setDelivery((prev) =>
        prev
          ? {
              ...prev,
              isReleased: true,
              adminOverride: true,
              adminOverrideReason: adminReleaseReason.trim() || 'Manual administrator override',
              adminOverrideAt: Timestamp.now() as any,
              accessToken: data.accessToken || prev.accessToken,
              status: data.status || 'Ready for Delivery',
              releasedAt: Timestamp.now() as any,
            }
          : null
      )

      toast.success('Admin Release Override Activated! Delivery unlocked for client.')
      setShowAdminReleaseModal(false)
      setAdminReleaseReason('')
      setAdminReleaseConfirmed(false)
    } catch (err: any) {
      console.error('Admin release error:', err)
      toast.error(err?.message || 'Failed to execute admin release.')
    } finally {
      setIsReleasing(false)
    }
  }

  const executeRevokeRelease = async () => {
    if (!delivery) return
    setIsReleasing(true)
    try {
      const res = await fetch('/api/delivery/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          release: false,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke release')
      }

      setDelivery((prev) =>
        prev
          ? {
              ...prev,
              isReleased: false,
              adminOverride: false,
              adminOverrideReason: undefined,
              adminOverrideAt: undefined,
              status: 'Ready for Delivery',
            }
          : null
      )

      toast.success('Delivery release revoked. Files are now locked.')
      setShowRevokeReleaseModal(false)
      setRevokeConfirmed(false)
    } catch (err: any) {
      console.error('Revoke release error:', err)
      toast.error(err?.message || 'Failed to revoke release.')
    } finally {
      setIsReleasing(false)
    }
  }

  const promptReleaseConfirmation = (isResend: boolean) => {
    setPendingIsResend(isResend)
    setShowReleaseConfirmModal(true)
  }

  const handleSubmitDelivery = async (isResend = false) => {
    if (!delivery) {
      toast.error('Delivery record is still initializing.')
      return
    }

    if (files.length === 0) {
      toast.error(quickJob ? 'Please upload delivery files before releasing this job.' : 'Please upload at least one file before releasing delivery.')
      return
    }

    if (isResend) {
      setResendingEmail(true)
    } else {
      setIsSubmitting(true)
      setIsReleasing(true)
    }

    try {
      if (resolvedQuickJobId) {
        const res = await fetch('/api/quick-jobs/release-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: resolvedQuickJobId,
            resend: isResend,
          }),
        })

        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to release quick job delivery')
        }

        setCanonicalUrl(data.deliveryLink || '')
        setDelivery((prev) =>
          prev
            ? {
                ...prev,
                isReleased: true,
                accessToken: data.accessToken || prev.accessToken,
                status: 'Delivered',
                releasedAt: Timestamp.now() as any,
                notifyEmailSent: true,
                notifyEmailError: null,
              }
            : null
        )

        toast.success(
          isResend
            ? 'Delivery notification email resent via Brevo!'
            : 'Delivery released! Client notification email sent via Brevo.'
        )

        onUpdate?.({
          deliveryStatus: 'Released',
          status: 'Completed',
          deliveryReleasedAt: data.releasedAt,
          deliveryEmailSent: true,
          deliveryLink: data.deliveryLink,
          fileCount: files.length,
        })
      } else {
        const res = await fetch('/api/delivery/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryId: delivery.id,
            release: true,
            resendEmail: isResend,
            projectId: resolvedProjectId || undefined,
          }),
        })

        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to submit delivery')
        }

        setCanonicalUrl(data.publicUrl || '')
        setDelivery((prev) =>
          prev
            ? {
                ...prev,
                isReleased: true,
                accessToken: data.accessToken || prev.accessToken,
                status: data.status || 'Delivered',
                releasedAt: Timestamp.now() as any,
                notifyEmailSent: data.emailNotification?.sent ?? prev.notifyEmailSent,
                notifyEmailError: data.emailNotification?.error ?? null,
                notifyEmailMessageId: data.emailNotification?.messageId ?? prev.notifyEmailMessageId,
              }
            : null
        )

        if (data.emailNotification?.sent) {
          toast.success(
            isResend
              ? 'Delivery notification email resent via Brevo!'
              : 'Delivery submitted! Client notification email sent via Brevo.'
          )
        } else if (data.emailNotification?.skipped) {
          toast.success('Delivery finalized! (Notification was previously sent)')
        } else if (data.emailNotification?.error) {
          toast.error(`Delivery created, but email could not be sent: ${data.emailNotification.error}`)
        } else {
          toast.success('Delivery submitted and finalized!')
        }

        onUpdate?.({
          deliveryStatus: 'Sent',
          status: 'Completed',
          fileCount: files.length,
        })
      }
    } catch (err: any) {
      console.error('Submit delivery error:', err)
      toast.error(err?.message || 'Failed to release delivery.')
    } finally {
      setIsSubmitting(false)
      setIsReleasing(false)
      setResendingEmail(false)
    }
  }

  const handleDirectRelease = () => handleSubmitDelivery(false)

  // 7. Update Expiration Settings
  const handleSaveExpiration = async () => {
    if (!delivery) return
    try {
      let expiresAtTimestamp: Timestamp | null = null

      if (selectedExpOption === '1_day') {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        expiresAtTimestamp = Timestamp.fromDate(d)
      } else if (selectedExpOption === '3_days') {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        expiresAtTimestamp = Timestamp.fromDate(d)
      } else if (selectedExpOption === '7_days') {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        expiresAtTimestamp = Timestamp.fromDate(d)
      } else if (selectedExpOption === '14_days') {
        const d = new Date()
        d.setDate(d.getDate() + 14)
        expiresAtTimestamp = Timestamp.fromDate(d)
      } else if (selectedExpOption === '30_days') {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        expiresAtTimestamp = Timestamp.fromDate(d)
      } else if (selectedExpOption === 'custom') {
        const d = new Date()
        d.setDate(d.getDate() + (customDays || 7))
        expiresAtTimestamp = Timestamp.fromDate(d)
      }

      const res = await fetch('/api/delivery/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          updates: {
            expirationOption: selectedExpOption,
            expiresAt: expiresAtTimestamp,
          },
        }),
      })

      if (!res.ok) throw new Error('Failed to update')

      setDelivery((prev) =>
        prev
          ? {
              ...prev,
              expirationOption: selectedExpOption,
              expiresAt: expiresAtTimestamp,
            }
          : null
      )

      toast.success('Expiration settings saved.')
      setShowExpireModal(false)
    } catch {
      toast.error('Failed to update expiration settings.')
    }
  }

  // 8. Send Delivery via WhatsApp (Secure Link ONLY)
  const handleSendWhatsAppDelivery = async () => {
    if (!delivery || !resolvedClientPhone) {
      toast.error('Missing WhatsApp phone number for this client.')
      return
    }

    if (files.length === 0) {
      toast.error('Please upload final files before sending delivery.')
      return
    }

    setSendingWA(true)
    try {
      const deliveryUrl = getDeliveryLink(delivery.accessToken)

      const messageBody = `Hi ${delivery.clientName}, your LexMedia project is ready! 🎉\n\nYour final files are now available for download.\n\nProject: ${delivery.projectName}\n\n📁 Download your files:\n${deliveryUrl}\n\nThank you for choosing LexMedia.`

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: resolvedClientId,
          projectId: resolvedProjectId || null,
          quickJobId: resolvedQuickJobId || null,
          deliveryId: delivery.id,
          messageType: 'delivery_ready',
          toNumber: resolvedClientPhone,
          messageBody,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'WhatsApp message could not be sent.')
        return
      }

      setWaSent(true)
      toast.success('Delivery link sent via WhatsApp!')
    } catch (err) {
      console.error('WhatsApp dispatch error:', err)
      toast.error('WhatsApp message could not be sent. Please check your connection.')
    } finally {
      setSendingWA(false)
    }
  }

  const deliveryUrl = delivery ? getDeliveryLink(delivery.accessToken) : ''

  // Delivery Locking & Financial Status Calculation
  const isFullyPaid =
    invoice?.status === 'Paid' ||
    (invoice?.balanceDue !== undefined && invoice.balanceDue <= 0) ||
    (project && (project.paymentStatus === 'Paid' || (project.outstandingBalance !== undefined && project.outstandingBalance <= 0))) ||
    (quickJob && (quickJob.paymentStatus === 'Paid' || (quickJob.outstandingBalance !== undefined && quickJob.outstandingBalance <= 0)))

  const isReleased = Boolean(delivery?.isReleased || delivery?.status === 'Delivered' || delivery?.status === 'Downloaded')
  const hasFiles = files.length > 0

  const isUploadLockedForQuickJob = Boolean(quickJob && !isFullyPaid)
  const isQuickJobFullyPaidNoFiles = Boolean(quickJob && isFullyPaid && !hasFiles)

  // The 3-state delivery status system: Locked | Ready | Released
  let deliveryStatus: 'Locked' | 'Ready' | 'Released' = 'Locked'
  if (isReleased) {
    deliveryStatus = 'Released'
  } else if (hasFiles && (isFullyPaid || delivery?.requiresFullPayment === false)) {
    deliveryStatus = 'Ready'
  } else {
    deliveryStatus = 'Locked'
  }

  const isPaymentLocked = deliveryStatus === 'Locked'
  const isAdminOverride = Boolean(delivery?.isReleased && (delivery?.adminOverride || !isFullyPaid))
  const outstandingAmount =
    invoice?.balanceDue ??
    project?.outstandingBalance ??
    quickJob?.outstandingBalance ??
    0

  const renderFileIcon = (fileName: string, mimeType?: string) => {
    const cat = getFileCategory(fileName, mimeType)
    switch (cat) {
      case 'image':
        return <ImageIcon size={18} className="text-indigo-600" />
      case 'video':
        return <Video size={18} className="text-purple-600" />
      case 'audio':
        return <Music size={18} className="text-pink-600" />
      case 'pdf':
        return <FileText size={18} className="text-rose-600" />
      case 'archive':
        return <Archive size={18} className="text-amber-600" />
      default:
        return <File size={18} className="text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-xl border border-gray-200/80 shadow-xs flex flex-col items-center justify-center py-12 gap-2">
        <Spinner size="md" />
        <p className="text-xs text-gray-400">Loading delivery details...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden space-y-6">
      {/* Header Banner */}
      <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-gray-50/80 to-white">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm">Client Delivery File System</h3>
            {/* Delivery System Status: Locked | Ready | Released */}
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                deliveryStatus === 'Released'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
                  : deliveryStatus === 'Ready'
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-300'
                  : 'text-amber-800 bg-amber-50 border-amber-300'
              }`}
            >
              {deliveryStatus === 'Released' && <Unlock size={11} />}
              {deliveryStatus === 'Ready' && <Sparkles size={11} />}
              {deliveryStatus === 'Locked' && <Lock size={11} />}
              Delivery: {deliveryStatus}
            </span>

            {/* Admin Override Badge */}
            {isAdminOverride && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-300 flex items-center gap-1">
                <ShieldAlert size={11} />
                Admin Override
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage client download access, payment gate locks, and manual administrative releases.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            id="delivery-file-input"
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFilesSelected}
            disabled={isUploading || !delivery}
            className="sr-only"
          />
          <input
            id="replace-delivery-file-input"
            type="file"
            ref={replaceFileInputRef}
            onChange={handleReplaceFileSelected}
            disabled={isReplacingFile || isUploading || !delivery}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => {
              if (isUploadLockedForQuickJob) {
                toast.error('Upload is locked until client payment is confirmed.')
                return
              }
              if (!delivery) {
                toast.error('Delivery record is still loading or failed to initialize.')
                return
              }
              fileInputRef.current?.click()
            }}
            disabled={isUploading || !delivery || isUploadLockedForQuickJob}
            className={`inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg gap-1.5 h-8 px-3 text-xs shadow-sm select-none cursor-pointer ${
              isUploadLockedForQuickJob
                ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed pointer-events-none'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
            } ${isUploading || !delivery ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            {isUploadLockedForQuickJob ? <Lock size={14} /> : <Upload size={14} />}
            <span>{isUploadLockedForQuickJob ? 'Upload Locked' : 'Upload Final Files'}</span>
          </button>

          <Button
            size="sm"
            variant="outline"
            icon={<Clock size={14} />}
            disabled={!delivery}
            onClick={() => setShowExpireModal(true)}
          >
            Expiration
          </Button>

          <button
            type="button"
            onClick={() => handleToggleOptimization(!imageOptimizationEnabled)}
            className={`inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg gap-1.5 h-8 px-3 text-xs shadow-sm select-none cursor-pointer border ${
              imageOptimizationEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title="Toggle automatic image optimization during upload"
          >
            <Sparkles size={13} className={imageOptimizationEnabled ? 'text-emerald-600' : 'text-gray-400'} />
            <span>Image Optimization: {imageOptimizationEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {quickJob && (
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/10 space-y-3">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quick Job Delivery Flow</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Step 1: Payment */}
              <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                isFullyPaid 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isFullyPaid ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {isFullyPaid ? '✓' : '1'}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider">Payment Status</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {isFullyPaid ? 'Payment Confirmed' : 'Awaiting Payment'}
                  </p>
                </div>
              </div>

              {/* Step 2: Upload */}
              <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                isReleased 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : hasFiles 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900' 
                  : !isFullyPaid 
                  ? 'bg-gray-50 border-gray-200 text-gray-400' 
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isReleased 
                    ? 'bg-emerald-600 text-white'
                    : hasFiles 
                    ? 'bg-indigo-600 text-white' 
                    : !isFullyPaid 
                    ? 'bg-gray-200 text-gray-400' 
                    : 'bg-blue-500 text-white'
                }`}>
                  {isReleased || hasFiles ? '✓' : '2'}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider">Deliverables Upload</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {!isFullyPaid 
                      ? '🔒 Upload Locked' 
                      : hasFiles 
                      ? '✓ Upload Unlocked' 
                      : '✓ Ready to Upload'}
                  </p>
                </div>
              </div>

              {/* Step 3: Ready to Submit */}
              <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                isReleased
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : (isSubmitting || isReleasing)
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : hasFiles 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900 animate-pulse'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isReleased 
                    ? 'bg-emerald-600 text-white'
                    : (isSubmitting || isReleasing)
                    ? 'bg-amber-500 text-white'
                    : hasFiles 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-200 text-gray-400'
                }`}>
                  {isReleased ? '✓' : '3'}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider">Submission State</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {isReleased 
                      ? 'Files Submitted' 
                      : (isSubmitting || isReleasing)
                      ? 'Processing Delivery'
                      : hasFiles 
                      ? 'Files ready for submission' 
                      : 'Pending Upload'}
                  </p>
                </div>
              </div>

              {/* Step 4: Notification Status */}
              <div className={`p-3 rounded-lg border flex items-center gap-3 ${
                isReleased
                  ? delivery?.notifyEmailSent
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : delivery?.notifyEmailError
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isReleased
                    ? delivery?.notifyEmailSent
                      ? 'bg-emerald-600 text-white'
                      : delivery?.notifyEmailError
                      ? 'bg-rose-600 text-white'
                      : 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}>
                  {isReleased && delivery?.notifyEmailSent ? '✓' : '4'}
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider">Brevo Notification</p>
                  <p className="text-xs font-semibold mt-0.5">
                    {isReleased
                      ? delivery?.notifyEmailSent
                        ? '✓ Delivered'
                        : delivery?.notifyEmailError
                        ? 'Email Error ⚠'
                        : 'Sending...'
                      : 'Awaiting Submission'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/80">
            <p className="text-xs text-gray-500">Files Uploaded</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">
              {files.length} <span className="text-xs font-normal text-gray-500">({formatFileSize(delivery?.totalSize || 0)})</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/80">
            <p className="text-xs text-gray-500">Client Access Count</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">
              {delivery?.accessCount || 0} <span className="text-xs font-normal text-gray-500">views</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/80">
            <p className="text-xs text-gray-500">First Opened</p>
            <p className="text-xs font-bold text-gray-900 mt-1">
              {delivery?.firstAccessedAt ? formatDate(delivery.firstAccessedAt) : 'Not opened yet'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/80">
            <p className="text-xs text-gray-500">Link Expiration</p>
            <p className="text-xs font-bold text-gray-900 mt-1">
              {delivery?.expiresAt ? formatDate(delivery.expiresAt) : 'No expiration'}
            </p>
          </div>
        </div>

        {/* Delivery Locking & Admin Release Status System */}
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
            deliveryStatus === 'Released'
              ? isAdminOverride
                ? 'bg-purple-50/70 border-purple-200'
                : 'bg-emerald-50/70 border-emerald-200'
              : deliveryStatus === 'Ready'
              ? 'bg-indigo-50/70 border-indigo-200'
              : 'bg-amber-50/70 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {deliveryStatus === 'Released' ? (
                isAdminOverride ? (
                  <ShieldAlert size={20} className="text-purple-600" />
                ) : (
                  <Unlock size={20} className="text-emerald-600" />
                )
              ) : deliveryStatus === 'Ready' ? (
                <Sparkles size={20} className="text-indigo-600" />
              ) : (
                <Lock size={20} className="text-amber-600" />
              )}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p
                  className={`text-xs font-bold uppercase tracking-wider ${
                    deliveryStatus === 'Released'
                      ? isAdminOverride
                        ? 'text-purple-900'
                        : 'text-emerald-900'
                      : deliveryStatus === 'Ready'
                      ? 'text-indigo-900'
                      : 'text-amber-900'
                  }`}
                >
                  Delivery Status: {deliveryStatus.toUpperCase()}
                </p>
                {isAdminOverride && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                    Admin Override Active
                  </span>
                )}
                {deliveryStatus === 'Locked' && outstandingAmount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    Bal Due: {formatCurrency(outstandingAmount)}
                  </span>
                )}
              </div>

              <p
                className={`text-xs ${
                  deliveryStatus === 'Released'
                    ? isAdminOverride
                      ? 'text-purple-700'
                      : 'text-emerald-700'
                    : deliveryStatus === 'Ready'
                    ? 'text-indigo-700'
                    : 'text-amber-800'
                }`}
              >
                {deliveryStatus === 'Released'
                  ? isAdminOverride
                    ? `Manually released by ${delivery?.adminOverrideBy || 'Administrator'} ${
                        delivery?.adminOverrideAt ? `on ${formatDate(delivery.adminOverrideAt)}` : ''
                      } overriding invoice balance.${
                        delivery?.adminOverrideReason ? ` Reason: "${delivery.adminOverrideReason}"` : ''
                      }`
                    : 'Delivery is unlocked and accessible to the client for immediate download.'
                  : deliveryStatus === 'Ready'
                  ? 'All deliverables uploaded and payment cleared. Click Release Delivery to unlock client downloads.'
                  : 'Delivery is locked because payment requirements have not been met. Client sees a payment gate upon viewing the delivery link.'}
              </p>
            </div>
          </div>

          {/* Action Control: Admin Release, Submit Delivery, or Revoke Release */}
          <div className="flex items-center gap-2 shrink-0">
            {deliveryStatus === 'Locked' && !isQuickJobFullyPaidNoFiles && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setAdminReleaseReason('')
                  setAdminReleaseConfirmed(false)
                  setShowAdminReleaseModal(true)
                }}
                icon={<Unlock size={14} />}
                className="bg-amber-600 hover:bg-amber-700 border-amber-600 text-white font-medium"
              >
                Admin Release
              </Button>
            )}

            {(deliveryStatus !== 'Locked' || isQuickJobFullyPaidNoFiles) && deliveryStatus !== 'Released' && (
              files.length === 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => toast.error(quickJob ? 'Please upload delivery files before releasing this job.' : 'Please upload at least one file before submitting delivery.')}
                  className="text-xs bg-indigo-600/80 hover:bg-indigo-600 text-white font-semibold shadow-xs"
                  icon={<Send size={14} />}
                >
                  {quickJob ? 'Release Delivery' : 'Submit Delivery'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  loading={isSubmitting || isReleasing}
                  disabled={isSubmitting || isReleasing}
                  onClick={() => promptReleaseConfirmation(false)}
                  icon={<Send size={14} />}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs"
                >
                  {isSubmitting
                    ? quickJob
                      ? '⟳ Releasing Delivery...'
                      : '⟳ Sending Delivery...'
                    : quickJob
                    ? 'Release Delivery'
                    : 'Submit Delivery'}
                </Button>
              )
            )}

            {deliveryStatus === 'Released' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Delivery Released
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={resendingEmail}
                  disabled={resendingEmail}
                  onClick={() => promptReleaseConfirmation(true)}
                  icon={<Mail size={12} />}
                  className="text-xs text-gray-700 bg-white hover:bg-gray-50 border-gray-300"
                  title="Resend delivery email notification to client"
                >
                  {resendingEmail ? 'Sending...' : 'Resend Email'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={isReleasing}
                  onClick={() => {
                    setRevokeConfirmed(false)
                    setShowRevokeReleaseModal(true)
                  }}
                  icon={<Lock size={12} />}
                  className="border-gray-200 text-gray-600 bg-white hover:bg-gray-50 text-xs"
                >
                  Revoke
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* STAGED FILES SECTION (Shows selected files before upload) */}
        {stagedFiles.length > 0 && (
          <div className="p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 space-y-4 animate-fade-in">
            {/* Network Offline Alert Banner */}
            {isOffline && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <WifiOff size={16} className="text-amber-600 shrink-0" />
                  <span>Internet connection lost. Upload will resume when your connection returns.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold uppercase">Offline</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Files Selected for Upload ({stagedFiles.length})
                </h4>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Resumable & fault-tolerant upload system. Auto-resumes on network reconnection.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearStaged}
                  className="bg-white text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={isUploading}
                  onClick={handleStartUpload}
                  icon={<Upload size={13} />}
                >
                  {isUploading ? 'Uploading...' : `Upload All (${formatFileSize(stagedFiles.reduce((s, f) => s + f.size, 0))})`}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-indigo-100 bg-white rounded-xl border border-indigo-100 overflow-hidden">
              {stagedFiles.map((sf) => {
                const prog = uploadProgress[sf.id]
                const status = prog?.status || 'idle'

                const isError = status === 'error'
                const isDone = status === 'done'
                const isOfflineStatus = status === 'offline' || isOffline
                const isPaused = status === 'paused'
                const isUploadingStatus = status === 'uploading'
                const isRetrying = status === 'retrying'

                return (
                  <div key={sf.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Image Preview or File Icon */}
                      {sf.previewUrl ? (
                        <div className="w-12 h-12 rounded-lg border border-indigo-100 overflow-hidden shrink-0 relative bg-gray-50 flex items-center justify-center">
                          <img
                            src={sf.previewUrl}
                            alt={sf.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                          {renderFileIcon(sf.name, sf.type)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-gray-900 truncate">{sf.name}</p>
                          {/* Status Badge */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isDone
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isError
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isOfflineStatus
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : isPaused
                                ? 'bg-gray-100 text-gray-700 border-gray-300'
                                : isRetrying
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {isDone && 'Completed ✓'}
                            {isError && 'Failed'}
                            {isOfflineStatus && 'Offline — Waiting to resume'}
                            {isPaused && 'Paused'}
                            {isRetrying && `Retrying (${prog?.retryAttempt || 1}/5)`}
                            {isUploadingStatus && `Uploading... ${prog?.percent || 0}%`}
                            {status === 'preparing' && 'Preparing...'}
                            {status === 'optimizing' && 'Optimizing Image...'}
                            {status === 'saving' && 'Saving metadata...'}
                            {status === 'reconnecting' && 'Connection restored — resuming...'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                          {sf.isOptimized && sf.originalSize ? (
                            <span>
                              <span className="line-through">{formatFileSize(sf.originalSize)}</span>
                              <span className="text-emerald-600 font-semibold ml-1">→ {formatFileSize(sf.size)}</span>
                            </span>
                          ) : (
                            <span>{formatFileSize(sf.size)}</span>
                          )}

                          {/* Upload speed & ETA info */}
                          {isUploadingStatus && prog && prog.speedBytesPerSec > 0 && (
                            <span className="text-indigo-600 font-medium">
                              · {formatFileSize(prog.speedBytesPerSec)}/s
                              {prog.estimatedTimeRemainingSeconds > 0 && (
                                <span className="ml-1">· {prog.estimatedTimeRemainingSeconds < 60 ? `${prog.estimatedTimeRemainingSeconds}s left` : `${Math.floor(prog.estimatedTimeRemainingSeconds / 60)}m left`}</span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Status Message & Progress bar */}
                        {prog && (
                          <div className="mt-2 space-y-1">
                            <div className="text-[10px] font-medium text-gray-600">
                              {isError ? (
                                <span className="text-rose-600 font-medium">{prog.error || prog.statusMessage || 'Upload error'}</span>
                              ) : (
                                <span>{prog.statusMessage}</span>
                              )}
                            </div>

                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  isError
                                    ? 'bg-rose-500'
                                    : isDone
                                    ? 'bg-emerald-500'
                                    : isOfflineStatus || isPaused || isRetrying
                                    ? 'bg-amber-500'
                                    : 'bg-indigo-600'
                                }`}
                                style={{ width: `${isDone ? 100 : isError ? 100 : prog.percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Manual Controls per file */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                      {isUploadingStatus && (
                        <button
                          type="button"
                          onClick={() => handlePauseUpload(sf.id)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-amber-700 hover:bg-amber-50 transition-colors text-xs font-medium flex items-center gap-1"
                          title="Pause upload"
                        >
                          <Pause size={14} />
                          <span className="hidden sm:inline text-[11px]">Pause</span>
                        </button>
                      )}

                      {isPaused && (
                        <button
                          type="button"
                          onClick={() => handleResumeUpload(sf.id)}
                          className="p-1.5 rounded-md text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors text-xs font-medium flex items-center gap-1"
                          title="Resume upload"
                        >
                          <Play size={14} />
                          <span className="text-[11px]">Resume</span>
                        </button>
                      )}

                      {isError && (
                        <button
                          type="button"
                          onClick={() => handleRetryUpload(sf.id)}
                          className="px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-xs font-semibold flex items-center gap-1"
                          title="Retry upload"
                        >
                          <RotateCcw size={13} />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCancelUpload(sf.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                        title="Cancel & Remove"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Secure Delivery Link & WhatsApp Dispatches */}
        {delivery && (
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Secure Client Delivery Link
              </span>
              <button
                onClick={handleRegenerateLink}
                disabled={isRegenerating}
                className="text-[11px] font-medium text-gray-500 hover:text-indigo-600 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={11} className={isRegenerating ? 'animate-spin' : ''} />
                Regenerate Link
              </button>
            </div>

            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
              <code className="text-xs text-gray-700 flex-1 truncate font-mono">{deliveryUrl}</code>
              <button
                onClick={async () => {
                  await copyToClipboard(deliveryUrl)
                  setCopiedLink(true)
                  toast.success('Delivery link copied!')
                  setTimeout(() => setCopiedLink(false), 2000)
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
              >
                {copiedLink ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                icon={<ExternalLink size={13} />}
                onClick={() => window.open(deliveryUrl, '_blank')}
              >
                Preview Client Portal
              </Button>

              {client?.whatsappNumber && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={sendingWA ? <Spinner size="sm" /> : waSent ? <CheckCircle2 size={13} className="text-emerald-600" /> : <MessageSquare size={13} />}
                  className={waSent ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}
                  onClick={handleSendWhatsAppDelivery}
                  disabled={sendingWA || files.length === 0}
                >
                  {sendingWA ? 'Sending via WhatsApp...' : waSent ? 'Delivery Sent ✓' : 'Send Delivery via WhatsApp'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Uploaded Files Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Layers size={16} className="text-indigo-600" />
              Delivery Files ({files.length})
            </h4>
          </div>

          {files.length === 0 ? (
            isUploadLockedForQuickJob ? (
              <div
                className="py-12 text-center bg-amber-50/40 rounded-xl border border-dashed border-amber-200/80 space-y-2 select-none"
              >
                <Lock size={24} className="mx-auto text-amber-500 animate-pulse" />
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">🔒 Upload Locked</p>
                <p className="text-[11px] text-amber-700">Awaiting payment verification before unlocking deliverables upload.</p>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="py-12 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer space-y-2"
              >
                <Upload size={24} className="mx-auto text-gray-400" />
                <p className="text-xs font-semibold text-gray-700">Click to select and upload final delivery files</p>
                <p className="text-[11px] text-gray-400">Supports JPG, PNG, WEBP, PDF, MP4, MOV, ZIP and more</p>
              </div>
            )
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200/80 rounded-xl overflow-hidden bg-white">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-3.5 hover:bg-gray-50/80 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                      {renderFileIcon(file.fileName, file.fileType)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {file.fileName || file.originalName}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {formatFileSize(file.fileSize)} · Uploaded {formatDate(file.uploadedAt)}
                        {file.downloadCount > 0 && ` · ${file.downloadCount} download(s)`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleReplaceClick(file)}
                      disabled={isReplacingFile || isUploading}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                      title="Replace file (safety first)"
                    >
                      <RefreshCw size={13} className={isReplacingFile && fileToReplace?.id === file.id ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={() => window.open(file.downloadUrl, '_blank')}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 transition-colors text-xs font-medium flex items-center gap-1"
                      title="Download file"
                    >
                      <ExternalLink size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteFile(file)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SUBMIT / RELEASE DELIVERY ACTION / STATUS PANEL */}
        {!isReleased && (deliveryStatus !== 'Locked' || isQuickJobFullyPaidNoFiles) && (
          <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg ${files.length > 0 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'} flex items-center justify-center shrink-0`}>
                  <Send size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    {files.length > 0
                      ? quickJob
                        ? `Ready to Release Delivery (${files.length} ${files.length === 1 ? 'file' : 'files'} ready)`
                        : `Ready to Submit Delivery (${files.length} ${files.length === 1 ? 'file' : 'files'} ready)`
                      : 'Awaiting Delivery Files'}
                  </h4>
                  <p className="text-xs text-indigo-800">
                    {files.length > 0
                      ? quickJob
                        ? `Releasing will activate secure client portal access and dispatch the Brevo delivery notification email to ${resolvedClientName}.`
                        : `Submitting will lock in deliverables, activate client portal access, and dispatch the Brevo delivery notification email to ${resolvedClientName}.`
                      : 'Please upload or select required delivery files to continue.'}
                  </p>
                </div>
              </div>
            </div>
            <Button
              size="md"
              variant="primary"
              loading={isSubmitting || isReleasing}
              disabled={isSubmitting || isReleasing}
              onClick={() => {
                if (files.length === 0) {
                  toast.error(quickJob ? 'Please upload delivery files before releasing this job.' : 'Please upload at least one file before submitting delivery.')
                  return
                }
                promptReleaseConfirmation(false)
              }}
              icon={<Send size={15} />}
              className={`font-semibold text-xs shadow-xs shrink-0 w-full sm:w-auto ${
                files.length > 0
                  ? 'bg-indigo-650 hover:bg-indigo-700 text-white'
                  : 'bg-indigo-600/80 hover:bg-indigo-600 text-white'
              }`}
            >
              {isSubmitting || isReleasing
                ? quickJob
                  ? '⟳ Releasing Delivery...'
                  : '⟳ Sending Delivery...'
                : quickJob
                ? 'Release Delivery'
                : 'Submit Delivery'}
            </Button>
          </div>
        )}

        {/* DELIVERY SUBMITTED & NOTIFICATION STATUS BANNER */}
        {isReleased && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    ✓ Delivery Released
                  </h4>
                  <p className="text-xs text-emerald-800">
                    The deliverables are active and available for client download.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <Check size={12} />
                ✓ Delivery Released
              </span>
            </div>

            {/* Brevo Email Status Banner */}
            {delivery?.notifyEmailSent ? (
              <div className="p-3 bg-white/90 rounded-lg border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-emerald-600 shrink-0" />
                  <span>
                    Brevo delivery notification email sent successfully to <strong>{client?.email || quickJob?.clientEmail || resolvedClientName}</strong>.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={resendingEmail}
                  disabled={resendingEmail}
                  onClick={() => promptReleaseConfirmation(true)}
                  icon={<RotateCcw size={12} />}
                  className="text-xs text-emerald-800 border-emerald-300 hover:bg-emerald-50 bg-white"
                >
                  {resendingEmail ? 'Resending...' : 'Resend Email'}
                </Button>
              </div>
            ) : delivery?.notifyEmailError ? (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 text-xs text-amber-900 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  <span>
                    ⚠ Delivery created, but email could not be sent: <em>{delivery.notifyEmailError}</em>
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={resendingEmail}
                  disabled={resendingEmail}
                  onClick={() => handleSubmitDelivery(true)}
                  icon={<RotateCcw size={12} />}
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  {resendingEmail ? 'Retrying...' : 'Retry Brevo Email'}
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-white/90 rounded-lg border border-gray-200 text-xs text-gray-700 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-500 shrink-0" />
                  <span>Ready to notify client via Brevo email.</span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={resendingEmail}
                  disabled={resendingEmail}
                  onClick={() => handleSubmitDelivery(true)}
                  icon={<Send size={12} />}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {resendingEmail ? 'Sending...' : 'Send Delivery Email'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expiration Settings Modal */}
      <Modal
        isOpen={showExpireModal}
        onClose={() => setShowExpireModal(false)}
        title="Delivery Link Expiration"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Set when the client access link expires. Clients accessing after expiration will be requested to contact LexMedia for a refreshed link.
          </p>

          <div className="space-y-2">
            {[
              { id: 'never', label: 'No expiration (Permanent)' },
              { id: '1_day', label: '1 day from now' },
              { id: '3_days', label: '3 days from now' },
              { id: '7_days', label: '7 days from now' },
              { id: '14_days', label: '14 days from now' },
              { id: '30_days', label: '30 days from now' },
              { id: 'custom', label: 'Custom number of days' },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                  selectedExpOption === opt.id
                    ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 font-semibold'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{opt.label}</span>
                <input
                  type="radio"
                  name="expirationOption"
                  value={opt.id}
                  checked={selectedExpOption === opt.id}
                  onChange={() => setSelectedExpOption(opt.id as DeliveryExpirationOption)}
                  className="accent-indigo-600"
                />
              </label>
            ))}
          </div>

          {selectedExpOption === 'custom' && (
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-700">Days until expiration</label>
              <input
                type="number"
                min="1"
                max="365"
                value={customDays}
                onChange={(e) => setCustomDays(parseInt(e.target.value) || 7)}
                className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={() => setShowExpireModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveExpiration}>
              Save Settings
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADMIN RELEASE CONFIRMATION MODAL */}
      <Modal
        isOpen={showAdminReleaseModal}
        onClose={() => setShowAdminReleaseModal(false)}
        title="Confirm Admin Release (Payment Override)"
        subtitle="Manually release delivery files to the client bypassing normal payment requirements."
        size="md"
      >
        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
            <div className="flex items-start gap-2 text-amber-900 font-bold">
              <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
              <span>Payment Requirements Not Satisfied</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              This project currently has an unpaid balance of{' '}
              <strong className="text-amber-950 font-bold">{formatCurrency(outstandingAmount)}</strong>.
              Releasing this delivery will allow the client (
              <strong>{resolvedClientName}</strong>) to immediately view and
              download all final deliverables before full payment is recorded.
            </p>
          </div>

          {/* Project & Client Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs divide-y divide-gray-200/80">
            <div className="pb-2 flex justify-between">
              <span className="text-gray-500">Project / Deliverable:</span>
              <span className="font-semibold text-gray-900">{resolvedProjectName}</span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-gray-500">Client:</span>
              <span className="font-semibold text-gray-900">{resolvedClientName}</span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-gray-500">Current Payment Status:</span>
              <span className="font-semibold text-rose-600">{invoice?.status || project?.paymentStatus || quickJob?.paymentStatus || 'Unpaid'}</span>
            </div>
            <div className="pt-2 flex justify-between">
              <span className="text-gray-500">Outstanding Balance:</span>
              <span className="font-bold text-rose-600">{formatCurrency(outstandingAmount, resolvedCurrency)}</span>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">
              Reason for Admin Release (Audit Trail) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={adminReleaseReason}
              onChange={(e) => setAdminReleaseReason(e.target.value)}
              placeholder="e.g. Offline cash payment received, VIP client exception, partial milestone agreement"
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 outline-none"
            />
          </div>

          {/* Anti-Accidental Release Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-300 bg-amber-50/50 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={adminReleaseConfirmed}
              onChange={(e) => setAdminReleaseConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-amber-950 font-medium leading-tight">
              I understand payment requirements have not been met and explicitly authorize this manual delivery release.
            </span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdminReleaseModal(false)}
              disabled={isReleasing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isReleasing}
              disabled={!adminReleaseConfirmed || !adminReleaseReason.trim()}
              onClick={executeAdminRelease}
              icon={<Unlock size={14} />}
              className="bg-amber-600 hover:bg-amber-700 border-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Confirm Admin Release
            </Button>
          </div>
        </div>
      </Modal>

      {/* REVOKE RELEASE CONFIRMATION MODAL */}
      <Modal
        isOpen={showRevokeReleaseModal}
        onClose={() => setShowRevokeReleaseModal(false)}
        title="Revoke Delivery Release"
        subtitle="Lock delivery files and restore payment gate for the client."
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-1.5">
            <p className="font-semibold text-gray-900">Are you sure you want to revoke release?</p>
            <p className="text-gray-600 leading-relaxed">
              The client will no longer be able to download deliverables from the public delivery link. They will be presented with the payment gate until released again.
            </p>
          </div>

          <label className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={revokeConfirmed}
              onChange={(e) => setRevokeConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-gray-700 font-medium">
              Confirm re-locking delivery downloads for this client.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevokeReleaseModal(false)}
              disabled={isReleasing}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isReleasing}
              disabled={!revokeConfirmed}
              onClick={executeRevokeRelease}
              icon={<Lock size={14} />}
            >
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Modal>

      {/* RELEASE DELIVERY / RESEND EMAIL CONFIRMATION MODAL */}
      <Modal
        isOpen={showReleaseConfirmModal}
        onClose={() => !isSubmitting && !resendingEmail && setShowReleaseConfirmModal(false)}
        title={pendingIsResend ? 'Resend Delivery Email' : 'Release Delivery'}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 space-y-2">
            <p className="font-semibold text-gray-900 text-sm">
              {pendingIsResend
                ? `Resend delivery link to ${resolvedClientName}?`
                : `Release delivery to ${resolvedClientName} and send the secure delivery link to their email?`}
            </p>
            <p className="text-gray-600 leading-relaxed text-xs">
              Recipient Email: <strong>{client?.email || quickJob?.clientEmail || 'Client email'}</strong>
            </p>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              This will generate or retrieve the client&apos;s secure delivery portal link and send a branded delivery notification email via Brevo.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReleaseConfirmModal(false)}
              disabled={isSubmitting || resendingEmail}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting || resendingEmail}
              disabled={isSubmitting || resendingEmail}
              onClick={() => {
                setShowReleaseConfirmModal(false)
                handleSubmitDelivery(pendingIsResend)
              }}
              icon={<Send size={13} />}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {pendingIsResend ? 'Resend & Send Email' : 'Release & Send Email'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
