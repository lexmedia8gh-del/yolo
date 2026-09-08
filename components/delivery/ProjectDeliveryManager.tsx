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
} from 'lucide-react'
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
} from '@/lib/utils'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'

interface ProjectDeliveryManagerProps {
  project: Project
  client: Client | null
  invoice: Invoice | null
}

interface StagedFile {
  id: string
  file: File
  name: string
  size: number
  type: string
}

export function ProjectDeliveryManager({
  project,
  client,
  invoice,
}: ProjectDeliveryManagerProps) {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [files, setFiles] = useState<DeliveryFile[]>([])
  const [loading, setLoading] = useState(true)
  
  // Staged files (selected before upload)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: { percent: number; status: 'uploading' | 'saving' | 'done' | 'error'; error?: string } }>({})
  
  // Modals & action states
  const [showExpireModal, setShowExpireModal] = useState(false)
  const [selectedExpOption, setSelectedExpOption] = useState<DeliveryExpirationOption>('never')
  const [customDays, setCustomDays] = useState<number>(14)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)
  const [waSent, setWaSent] = useState(false)
  const [canonicalUrl, setCanonicalUrl] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Fetch or create Delivery record for this Project
  useEffect(() => {
    if (!project?.id) return
    loadDeliveryData()
  }, [project.id])

  const loadDeliveryData = async () => {
    setLoading(true)
    try {
      // Fetch or initialize delivery via Server Admin API (guarantees server-side Firestore truth)
      const queryParams = new URLSearchParams({
        projectId: project.id,
        clientId: project.clientId || client?.id || '',
        projectName: project.name || '',
        clientName: project.clientName || client?.fullName || 'Client',
        invoiceId: project.invoiceId || invoice?.id || '',
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
      setFiles(data.files || [])
    } catch (err) {
      console.error('Error loading delivery manager:', err)
      toast.error('Delivery files could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // 2. Stage Files Selected
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedList = e.target.files
    if (!selectedList || selectedList.length === 0) return

    const newStaged: StagedFile[] = Array.from(selectedList).map((f) => ({
      id: generateSecureToken(12),
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || f.name.split('.').pop() || 'unknown',
    }))

    setStagedFiles((prev) => [...prev, ...newStaged])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveStaged = (id: string) => {
    if (isUploading) return
    setStagedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleClearStaged = () => {
    if (isUploading) return
    setStagedFiles([])
    setUploadProgress({})
  }

  // 3. Process Upload of Staged Files
  const handleStartUpload = async () => {
    if (stagedFiles.length === 0 || !delivery || isUploading) return

    setIsUploading(true)
    const initialProgress: typeof uploadProgress = {}
    stagedFiles.forEach((sf) => {
      initialProgress[sf.id] = { percent: 0, status: 'uploading' }
    })
    setUploadProgress(initialProgress)

    let successCount = 0
    let addedSize = 0
    const newlyUploaded: DeliveryFile[] = []

    try {
      for (const staged of stagedFiles) {
        try {
          const fileDocId = generateSecureToken(16)
          
          // 1. Upload to Storage: deliveries/{projectId}/{deliveryId}/{fileId}/{sanitizedFilename}
          const { downloadUrl, storagePath } = await uploadDeliveryFile(
            project.id,
            delivery.id,
            fileDocId,
            staged.file,
            (progress) => {
              setUploadProgress((prev) => ({
                ...prev,
                [staged.id]: { percent: Math.round(progress), status: progress >= 100 ? 'saving' : 'uploading' },
              }))
            },
            project.clientId
          )

          const fullFileRecord: DeliveryFile = {
            id: fileDocId,
            deliveryId: delivery.id,
            projectId: project.id,
            clientId: project.clientId,
            fileName: staged.name,
            originalName: staged.name,
            fileType: staged.type,
            fileSize: staged.size,
            storagePath,
            downloadUrl,
            downloadCount: 0,
            uploadedAt: new Date() as any,
            uploadedBy: 'admin',
          }

          newlyUploaded.push(fullFileRecord)
          successCount++
          addedSize += staged.size

          setUploadProgress((prev) => ({
            ...prev,
            [staged.id]: { percent: 100, status: 'done' },
          }))
        } catch (err: any) {
          console.error(`Failed to upload ${staged.name}:`, err)
          const errMsg = err?.message || 'Unable to upload this file. Please check your connection and try again.'
          setUploadProgress((prev) => ({
            ...prev,
            [staged.id]: {
              percent: 0,
              status: 'error',
              error: errMsg,
            },
          }))
          toast.error(`Error uploading ${staged.name}: ${errMsg}`)
        }
      }

      // Refresh list & delivery container from server truth
      if (successCount > 0 && delivery) {
        toast.success(`${successCount} file(s) uploaded successfully!`)
        await loadDeliveryData()

        // Remove successful uploads from staged list
        setTimeout(() => {
          setStagedFiles([])
          setUploadProgress({})
        }, 1000)
      }
    } finally {
      setIsUploading(false)
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

  // 6. Toggle Release Delivery (Manual Admin Override)
  const handleToggleRelease = async () => {
    if (!delivery) return
    setIsReleasing(true)
    try {
      const willRelease = !delivery.isReleased
      const res = await fetch('/api/delivery/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          release: willRelease,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update release status')
      }

      setCanonicalUrl(data.publicUrl || '')
      setDelivery((prev) =>
        prev
          ? {
              ...prev,
              isReleased: willRelease,
              accessToken: data.accessToken || prev.accessToken,
              status: data.status || prev.status,
              releasedAt: willRelease ? (Timestamp.now() as any) : null,
            }
          : null
      )
      if (willRelease) {
        if (data.emailNotification?.sent) {
          toast.success('Delivery released & Brevo transactional email sent!')
        } else if (data.emailNotification?.skipped) {
          toast.success('Delivery released to client (Email already sent previously).')
        } else if (data.emailNotification?.error) {
          toast.success(`Delivery released, but email warning: ${data.emailNotification.error}`)
        } else {
          toast.success('Delivery successfully released to client!')
        }
      } else {
        toast.success('Release revoked.')
      }
    } catch (err: any) {
      console.error('Release toggle error:', err)
      toast.error(err?.message || 'Failed to update release status.')
    } finally {
      setIsReleasing(false)
    }
  }

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
    if (!delivery || !client?.whatsappNumber) {
      toast.error('Missing WhatsApp phone number for this client.')
      return
    }

    if (files.length === 0) {
      toast.error('Please upload final files before sending delivery.')
      return
    }

    setSendingWA(true)
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const deliveryUrl = `${appUrl}/delivery/${delivery.accessToken}`

      const messageBody = `Hi ${delivery.clientName}, your LexMedia project is ready! 🎉\n\nYour final files are now available for download.\n\nProject: ${delivery.projectName}\n\n📁 Download your files:\n${deliveryUrl}\n\nThank you for choosing LexMedia.`

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: project.clientId,
          projectId: project.id,
          deliveryId: delivery.id,
          messageType: 'delivery_ready',
          toNumber: client.whatsappNumber,
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

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const deliveryUrl = delivery ? `${appUrl}/delivery/${delivery.accessToken}` : ''
  const isPaymentLocked = !delivery?.isReleased && (invoice?.status !== 'Paid' && project.paymentStatus !== 'Paid')

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
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">Client Delivery File System</h3>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                delivery?.status === 'Downloaded'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : delivery?.status === 'Delivered'
                  ? 'text-blue-700 bg-blue-50 border-blue-200'
                  : delivery?.status === 'Ready for Delivery'
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  : 'text-gray-600 bg-gray-50 border-gray-200'
              }`}
            >
              {delivery?.status || 'Not Ready'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload final assets, generate secure public links, and dispatch deliveries via WhatsApp.
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
            disabled={isUploading}
            className="sr-only"
          />
          <label
            htmlFor="delivery-file-input"
            className={`inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg gap-1.5 h-8 px-3 text-xs shadow-sm select-none cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 ${
              isUploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
            }`}
          >
            <Upload size={14} />
            <span>Upload Final Files</span>
          </label>

          <Button
            size="sm"
            variant="outline"
            icon={<Clock size={14} />}
            onClick={() => setShowExpireModal(true)}
          >
            Expiration
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-6">
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

        {/* Payment Gate Banner */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isPaymentLocked ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/70 border-emerald-200'
        }`}>
          <div className="flex items-start gap-2.5">
            {isPaymentLocked ? (
              <Lock size={18} className="text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Unlock size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-xs font-bold ${isPaymentLocked ? 'text-amber-900' : 'text-emerald-900'}`}>
                {isPaymentLocked ? 'Delivery Locked (Payment Outstanding)' : 'Delivery Unlocked for Client'}
              </p>
              <p className={`text-xs mt-0.5 ${isPaymentLocked ? 'text-amber-700' : 'text-emerald-700'}`}>
                {isPaymentLocked
                  ? 'Client will be shown a pending release screen until payment is completed or you manually release.'
                  : delivery?.isReleased
                  ? 'Manually released by admin (bypasses invoice balance requirements).'
                  : 'Invoice is fully paid. Client can download all files immediately.'}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            loading={isReleasing}
            onClick={handleToggleRelease}
            className={isPaymentLocked ? 'border-amber-300 text-amber-900 bg-white hover:bg-amber-100' : 'border-emerald-300 text-emerald-900 bg-white hover:bg-emerald-100'}
          >
            {delivery?.isReleased ? 'Revoke Manual Release' : 'Release Delivery'}
          </Button>
        </div>

        {/* STAGED FILES SECTION (Shows selected files before upload) */}
        {stagedFiles.length > 0 && (
          <div className="p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Files Selected for Upload ({stagedFiles.length})
                </h4>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Review selected files below and click &quot;Upload Now&quot; to upload to Firebase Storage.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUploading}
                  onClick={handleClearStaged}
                  className="bg-white text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={isUploading}
                  onClick={handleStartUpload}
                  icon={<Upload size={13} />}
                >
                  {isUploading ? 'Uploading...' : `Upload Now (${formatFileSize(stagedFiles.reduce((s, f) => s + f.size, 0))})`}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-indigo-100 bg-white rounded-xl border border-indigo-100 overflow-hidden">
              {stagedFiles.map((sf) => {
                const prog = uploadProgress[sf.id]
                return (
                  <div key={sf.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                        {renderFileIcon(sf.name, sf.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-900 truncate">{sf.name}</p>
                        <p className="text-[11px] text-gray-400">{formatFileSize(sf.size)}</p>

                        {/* Progress bar */}
                        {prog && (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-indigo-700">
                              <span>
                                {prog.status === 'uploading' && `Uploading... ${prog.percent}%`}
                                {prog.status === 'saving' && 'Saving metadata...'}
                                {prog.status === 'done' && 'Uploaded ✓'}
                                {prog.status === 'error' && (
                                  <span className="text-rose-600 font-medium">{prog.error || 'Upload error'}</span>
                                )}
                              </span>
                            </div>
                            <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                  prog.status === 'error' ? 'bg-rose-500' : prog.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-600'
                                }`}
                                style={{ width: `${prog.percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {!isUploading && (
                      <button
                        onClick={() => handleRemoveStaged(sf.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                        title="Remove file"
                      >
                        <X size={15} />
                      </button>
                    )}
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
            <div
              onClick={() => fileInputRef.current?.click()}
              className="py-12 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer space-y-2"
            >
              <Upload size={24} className="mx-auto text-gray-400" />
              <p className="text-xs font-semibold text-gray-700">Click to select and upload final delivery files</p>
              <p className="text-[11px] text-gray-400">Supports JPG, PNG, WEBP, PDF, MP4, MOV, ZIP and more</p>
            </div>
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
    </div>
  )
}
