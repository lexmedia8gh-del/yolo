'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  Upload,
  File,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Trash2,
  Sparkles,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Eye,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Calendar,
  User,
  FolderKanban,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  getDocument,
} from '@/lib/firebase/firestore'
import type {
  Client,
  Project,
  QuickJob,
  ClientPreview,
  PreviewAsset,
  PreviewExpirationOption,
  PreviewStatus,
} from '@/lib/types'
import {
  formatCurrency,
  formatFileSize,
  generateSecureToken,
  copyToClipboard,
  buildClientPreviewUrl,
  getFileCategory,
} from '@/lib/utils'
import { uploadDeliveryFile } from '@/lib/supabase/storage'
import toast from 'react-hot-toast'

interface CreatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newPreview: any) => void
  preselectedClientId?: string
  preselectedProjectId?: string
}

export function CreatePreviewModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedClientId,
  preselectedProjectId,
}: CreatePreviewModalProps) {
  // Database selections
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [quickJobs, setQuickJobs] = useState<QuickJob[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Form selections
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '')
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || '')
  const [selectedQuickJobId, setSelectedQuickJobId] = useState('')

  // Preview Info
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<PreviewStatus>('Active')
  const [expirationOption, setExpirationOption] = useState<PreviewExpirationOption>('7_days')
  const [customExpirationDate, setCustomExpirationDate] = useState('')

  // Watermark Settings
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState(
    '[CTRL ROOM] CONFIDENTIAL PREVIEW\n{{client_name}} | {{project_name}}\nSession: {{session_id}}\n{{date}}'
  )
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22)
  const [watermarkTile, setWatermarkTile] = useState(true)
  const [watermarkDynamic, setWatermarkDynamic] = useState(true)

  // Assets
  const [stagedAssets, setStagedAssets] = useState<
    Array<{
      id: string
      name: string
      fileType: string
      fileSize: number
      storagePath: string
      sourceStorage: 'supabase' | 'firebase' | 'local' | 'external'
      fileObj?: File
      isUploading?: boolean
    }>
  >([])

  const [existingProjectFiles, setExistingProjectFiles] = useState<any[]>([])
  const [loadingExistingFiles, setLoadingExistingFiles] = useState(false)

  // Submitting & Created State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdPreview, setCreatedPreview] = useState<{ id: string; token: string; url: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load clients & projects
  useEffect(() => {
    if (!isOpen) return
    setLoadingData(true)
    Promise.all([
      getDocuments<Client>(COLLECTIONS.CLIENTS),
      getDocuments<Project>(COLLECTIONS.PROJECTS),
      getDocuments<QuickJob>(COLLECTIONS.QUICK_JOBS),
    ])
      .then(([cList, pList, qList]) => {
        setClients(cList || [])
        setProjects(pList || [])
        setQuickJobs(qList || [])
      })
      .catch((err) => console.warn('Error loading clients/projects for preview:', err))
      .finally(() => setLoadingData(false))
  }, [isOpen])

  // Sync preselected options
  useEffect(() => {
    if (preselectedClientId) setSelectedClientId(preselectedClientId)
    if (preselectedProjectId) setSelectedProjectId(preselectedProjectId)
  }, [preselectedClientId, preselectedProjectId])

  // Auto-generate title when client & project are selected
  useEffect(() => {
    if (!title) {
      const selectedProj = projects.find((p) => p.id === selectedProjectId)
      const selectedCli = clients.find((c) => c.id === selectedClientId)
      if (selectedProj) {
        setTitle(`${selectedProj.name} — Review Proof`)
      } else if (selectedCli) {
        setTitle(`${selectedCli.fullName} — Work-In-Progress Preview`)
      }
    }
  }, [selectedProjectId, selectedClientId, projects, clients, title])

  // Load existing files from the selected project's delivery or deliveryFiles
  useEffect(() => {
    if (!selectedProjectId) {
      setExistingProjectFiles([])
      return
    }
    setLoadingExistingFiles(true)
    getDocuments<any>(COLLECTIONS.DELIVERY_FILES)
      .then((dFiles) => {
        const matching = (dFiles || []).filter(
          (f) => f.projectId === selectedProjectId || f.clientId === selectedClientId
        )
        setExistingProjectFiles(matching)
      })
      .catch(() => {})
      .finally(() => setLoadingExistingFiles(false))
  }, [selectedProjectId, selectedClientId])

  // Reset modal state
  const handleReset = () => {
    setTitle('')
    setDescription('')
    setStatus('Active')
    setExpirationOption('7_days')
    setCustomExpirationDate('')
    setStagedAssets([])
    setCreatedPreview(null)
    setIsSubmitting(false)
  }

  // Handle local file selection
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const inferMime = (name: string, raw?: string) => {
      if (raw && raw !== 'application/octet-stream' && raw.trim() !== '') return raw.toLowerCase()
      const ext = name.split('.').pop()?.toLowerCase() || ''
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico'].includes(ext)) {
        return ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
      }
      if (['mp4', 'mov', 'webm'].includes(ext)) return ext === 'mov' ? 'video/quicktime' : `video/${ext}`
      if (['mp3', 'wav'].includes(ext)) return ext === 'mp3' ? 'audio/mpeg' : 'audio/wav'
      if (ext === 'pdf') return 'application/pdf'
      return raw || 'application/octet-stream'
    }

    const newStaged: any[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      newStaged.push({
        id: `proof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: f.name,
        fileType: inferMime(f.name, f.type),
        fileSize: f.size,
        storagePath: '',
        sourceStorage: 'supabase',
        fileObj: f,
      })
    }

    setStagedAssets((prev) => [...prev, ...newStaged])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Add existing project deliverable to preview
  const handleAddExistingFile = (fileItem: any) => {
    const alreadyAdded = stagedAssets.some((s) => s.id === fileItem.id || s.storagePath === fileItem.storagePath)
    if (alreadyAdded) {
      toast('This asset is already attached.', { icon: 'ℹ️' })
      return
    }

    setStagedAssets((prev) => [
      ...prev,
      {
        id: fileItem.id || `file_${Date.now()}`,
        name: fileItem.fileName || fileItem.originalName || 'Asset',
        fileType: fileItem.fileType || 'application/octet-stream',
        fileSize: fileItem.fileSize || 0,
        storagePath: fileItem.storagePath || '',
        sourceStorage: 'supabase',
      },
    ])
    toast.success(`Attached "${fileItem.fileName || 'file'}" to preview proof`)
  }

  const handleRemoveStagedAsset = (idx: number) => {
    setStagedAssets((prev) => prev.filter((_, i) => i !== idx))
  }

  // Submit & Create Preview
  const handleCreatePreview = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Please enter a preview title')
      return
    }

    if (!selectedClientId) {
      toast.error('Please select a client for this preview')
      return
    }

    if (stagedAssets.length === 0) {
      toast.error('Please attach at least one asset or file for the preview')
      return
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Securing assets and generating proof session...')

    try {
      // 1. Upload any newly staged file objects to Supabase Storage in private path
      const finalizedAssets: PreviewAsset[] = []
      const selectedProj = projects.find((p) => p.id === selectedProjectId)
      const selectedCli = clients.find((c) => c.id === selectedClientId)
      const safeProjId = selectedProjectId || 'general'

      for (let i = 0; i < stagedAssets.length; i++) {
        const item = stagedAssets[i]
        let storagePath = item.storagePath

        if (item.fileObj) {
          const safeName = item.fileObj.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
          const destinationPath = `previews/${safeProjId}/${Date.now()}_${safeName}`

          try {
            // Prefer server-side proxy upload (bypasses browser client RLS issues)
            const formData = new FormData()
            formData.append('file', item.fileObj)
            formData.append('projectId', safeProjId)
            formData.append('path', destinationPath)

            const uploadApiRes = await fetch('/api/preview/upload', {
              method: 'POST',
              body: formData,
            })
            const uploadApiData = await uploadApiRes.json()

            if (uploadApiRes.ok && uploadApiData.success && uploadApiData.storagePath) {
              storagePath = uploadApiData.storagePath
            } else {
              throw new Error(uploadApiData.error || 'Server upload failed')
            }
          } catch (serverErr) {
            console.warn('[Create Preview Server Upload Fallback]:', serverErr)
            // Fallback to client-side direct upload
            const uploadRes = await uploadDeliveryFile({
              path: destinationPath,
              file: item.fileObj,
              contentType: item.fileType,
            })
            storagePath = uploadRes.data?.path || destinationPath
          }
        }

        finalizedAssets.push({
          id: item.id,
          name: item.name,
          originalName: item.name,
          fileType: item.fileType,
          fileSize: item.fileSize,
          storagePath: storagePath,
          sourceStorage: item.sourceStorage || 'supabase',
          order: i,
        })
      }

      // 2. Call backend API to create preview
      const res = await fetch('/api/preview/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          clientName: selectedCli?.fullName || 'Client',
          clientEmail: selectedCli?.email || '',
          projectId: selectedProjectId || '',
          projectName: selectedProj?.name || 'Creative Deliverable',
          quickJobId: selectedQuickJobId || '',
          title: title.trim(),
          description: description.trim(),
          status,
          expirationOption,
          customExpirationDate: expirationOption === 'custom' ? customExpirationDate : undefined,
          watermark: {
            enabled: watermarkEnabled,
            text: watermarkText,
            opacity: watermarkOpacity,
            tilePattern: watermarkTile,
            dynamicPosition: watermarkDynamic,
          },
          assets: finalizedAssets,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create preview')
      }

      const previewUrl = buildClientPreviewUrl(data.token)

      setCreatedPreview({
        id: data.previewId,
        token: data.token,
        url: previewUrl,
      })

      toast.success('Client Preview created successfully!', { id: toastId })
      onSuccess?.(data.preview)
    } catch (err: any) {
      console.error('Create preview error:', err)
      toast.error(err?.message || 'Error generating client preview', { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter projects by selected client
  const clientProjects = selectedClientId
    ? projects.filter((p) => p.clientId === selectedClientId)
    : projects

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset()
        onClose()
      }}
      title="Create View-Only Client Preview"
      size="xl"
    >
      {createdPreview ? (
        <div className="py-4 space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <Check size={32} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Preview Ready for Client Review
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              A view-only session token has been generated. The client will be able to review the work with forensic watermarks and protection against direct file downloading.
            </p>
          </div>

          {/* Secure Link Box */}
          <div className="bg-gray-50 dark:bg-gray-800/80 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 max-w-lg mx-auto text-left">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Client View-Only Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdPreview.url}
                className="flex-1 bg-white dark:bg-gray-900 px-3 py-2 rounded-xl text-xs font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 outline-none"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Copy size={14} />}
                onClick={() => {
                  copyToClipboard(createdPreview.url)
                  toast.success('Preview link copied to clipboard!')
                }}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                handleReset()
                onClose()
              }}
            >
              Done
            </Button>
            <Button
              variant="primary"
              icon={<ExternalLink size={14} />}
              onClick={() => window.open(createdPreview.url, '_blank')}
            >
              Open Client Preview
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreatePreview} className="space-y-5">
          {/* Client & Project Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Client <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value)
                  setSelectedProjectId('')
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Select Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.company ? `(${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Project / Job (Optional)
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Select Project (or General Proof) --</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.invoiceNumber ? `[${p.invoiceNumber}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-3">
            <Input
              label="Preview Title *"
              placeholder="e.g. Brand Identity Concepts — Proof v1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <Textarea
              label="Description / Review Instructions for Client (Optional)"
              placeholder="e.g. Please review the 3 logo variations and let us know your preferred direction by Friday."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Expiration & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700/60">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Access Expiration
              </label>
              <select
                value={expirationOption}
                onChange={(e: any) => setExpirationOption(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none"
              >
                <option value="1_hour">1 Hour</option>
                <option value="24_hours">24 Hours (1 Day)</option>
                <option value="3_days">3 Days</option>
                <option value="7_days">7 Days (Default)</option>
                <option value="never">No Expiration</option>
                <option value="custom">Custom Date & Time</option>
              </select>

              {expirationOption === 'custom' && (
                <div className="mt-2">
                  <input
                    type="datetime-local"
                    value={customExpirationDate}
                    onChange={(e) => setCustomExpirationDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                    required
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none"
              >
                <option value="Active">Active (Immediately viewable by client)</option>
                <option value="Draft">Draft (Hidden from client until ready)</option>
              </select>
            </div>
          </div>

          {/* Watermark Configuration Accordion */}
          <div className="p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-gray-900 dark:text-white">
                  Forensic Watermark Protection
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Enable Watermark</span>
              </label>
            </div>

            {watermarkEnabled && (
              <div className="space-y-3 pt-2 text-xs border-t border-indigo-100 dark:border-indigo-900/40">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700 dark:text-gray-300">
                      Watermark Pattern Text
                    </label>
                    <span className="text-[11px] text-gray-400">Tokens: {'{{client_name}}'}, {'{{project_name}}'}, {'{{session_id}}'}, {'{{date}}'}</span>
                  </div>
                  <textarea
                    rows={2}
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Opacity: {Math.round(watermarkOpacity * 100)}%
                    </label>
                    <input
                      type="range"
                      min={0.08}
                      max={0.5}
                      step={0.02}
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-3">
                    <input
                      type="checkbox"
                      id="tilePattern"
                      checked={watermarkTile}
                      onChange={(e) => setWatermarkTile(e.target.checked)}
                      className="rounded text-indigo-600 w-4 h-4"
                    />
                    <label htmlFor="tilePattern" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                      Repeated Diagonal Grid
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-3">
                    <input
                      type="checkbox"
                      id="dynamicPosition"
                      checked={watermarkDynamic}
                      onChange={(e) => setWatermarkDynamic(e.target.checked)}
                      className="rounded text-indigo-600 w-4 h-4"
                    />
                    <label htmlFor="dynamicPosition" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                      Dynamic Periodic Shifting
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Staged & Upload Assets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-900 dark:text-white">
                Preview Proof Assets ({stagedAssets.length})
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={<Upload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Files
                </Button>
              </div>
            </div>

            {/* Existing Project Deliverables Quick-Add */}
            {existingProjectFiles.length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Attach from existing project files:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {existingProjectFiles.map((ef) => (
                    <button
                      key={ef.id}
                      type="button"
                      onClick={() => handleAddExistingFile(ef)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-indigo-500 text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>+ {ef.fileName || ef.originalName}</span>
                      <span className="text-[10px] text-gray-400">({formatFileSize(ef.fileSize)})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* List of staged assets */}
            {stagedAssets.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl text-center cursor-pointer hover:border-indigo-500 transition-colors"
              >
                <Upload size={24} className="mx-auto text-gray-400 mb-1.5" />
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Click or drag files here to attach preview proofs
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Images, PDFs, documents, videos, and artwork
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {stagedAssets.map((asset, idx) => {
                  const cat = getFileCategory(asset.name, asset.fileType)
                  return (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          {cat === 'image' && <ImageIcon size={14} />}
                          {cat === 'video' && <Video size={14} />}
                          {cat === 'pdf' && <FileText size={14} />}
                          {cat === 'audio' && <Music size={14} />}
                          {cat !== 'image' && cat !== 'video' && cat !== 'pdf' && cat !== 'audio' && (
                            <File size={14} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {asset.name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {formatFileSize(asset.fileSize)} • {asset.fileType}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveStagedAsset(idx)}
                        className="p-1 text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              icon={isSubmitting ? <Spinner size="sm" /> : <Eye size={16} />}
            >
              {isSubmitting ? 'Securing Preview...' : 'Generate Client Preview'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
