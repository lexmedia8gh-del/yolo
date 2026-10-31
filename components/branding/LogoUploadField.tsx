'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Upload, X, Image as ImageIcon, CheckCircle2, AlertCircle, Ban, Loader2 } from 'lucide-react'
import {
  startBrandingLogoUpload,
  removeBrandingLogo,
  validateBrandingImageFile,
  type BrandingFieldKey,
} from '@/lib/firebase/storage'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import { formatActionError } from '@/lib/utils'
import toast from 'react-hot-toast'

interface LogoUploadFieldProps {
  label: string
  helperText?: string
  currentUrl?: string
  currentStoragePath?: string
  fieldKey?: BrandingFieldKey
  maxMB?: number
  persistSettings?: boolean
  adminId?: string
  compact?: boolean
  onUploaded: (result: { downloadUrl: string; storagePath: string }) => void
  onRemoved: () => void
}

export function LogoUploadField({
  label,
  helperText,
  currentUrl = '',
  currentStoragePath = '',
  fieldKey = 'logo',
  maxMB = fieldKey === 'favicon' ? 2 : 5,
  persistSettings = true,
  adminId,
  compact = false,
  onUploaded,
  onRemoved,
}: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [isRemoving, setIsRemoving] = useState(false)
  const [imageBroken, setImageBroken] = useState(false)

  const cleanUrl = sanitizeBrandingLogoUrl(currentUrl, currentStoragePath)

  useEffect(() => {
    setImageBroken(false)
  }, [cleanUrl])

  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current()
      }
    }
  }, [])

  const acceptAttr =
    fieldKey === 'favicon'
      ? 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'
      : 'image/png,image/jpeg,image/webp,image/svg+xml'

  const formatHint =
    fieldKey === 'favicon'
      ? `PNG, JPEG, WebP, SVG, or ICO · Max ${maxMB}MB`
      : `PNG, JPEG, WebP, or SVG · Max ${maxMB}MB`

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file || status === 'uploading' || isRemoving) return

    const validationError = validateBrandingImageFile(file, fieldKey, maxMB)
    if (validationError) {
      setStatus('error')
      setErrorMsg(validationError)
      toast.error(validationError)
      return
    }

    setStatus('uploading')
    setProgress(5)
    setErrorMsg('')

    const { promise, cancel } = startBrandingLogoUpload({
      file,
      fieldKey,
      maxMB,
      persistSettings,
      previousStoragePath: currentStoragePath,
      adminId,
      onProgress: (pct) => setProgress(pct),
    })
    cancelRef.current = cancel

    try {
      const result = await promise
      setImageBroken(false)
      setStatus('done')
      setProgress(100)
      onUploaded({ downloadUrl: result.downloadUrl, storagePath: result.storagePath })
      toast.success(`${label} uploaded and saved!`)
    } catch (err: any) {
      if (err?.cancelled) {
        setStatus('idle')
        setProgress(0)
        setErrorMsg('')
        toast('Logo upload cancelled.')
      } else {
        const message = formatActionError(err, 'Logo upload failed. Please try again.')
        setStatus('error')
        setProgress(0)
        setErrorMsg(message)
        toast.error(message)
      }
    } finally {
      cancelRef.current = null
    }
  }

  const handleCancelUpload = () => {
    if (cancelRef.current) {
      cancelRef.current()
    }
  }

  const handleRemove = async () => {
    if (isRemoving) return
    setIsRemoving(true)
    setErrorMsg('')
    try {
      await removeBrandingLogo({
        fieldKey,
        storagePath: currentStoragePath,
        persistSettings,
      })
      setStatus('idle')
      setProgress(0)
      onRemoved()
      toast.success(`${label} removed.`)
    } catch (err: unknown) {
      toast.error(formatActionError(err, 'Failed to remove logo.'))
    } finally {
      setIsRemoving(false)
    }
  }

  const inputId = `logo-upload-${fieldKey}-${compact ? 'compact' : 'std'}`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="block text-xs font-semibold text-gray-700">
          {label}
        </label>
        {helperText && <span className="text-[11px] text-gray-400">{helperText}</span>}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3.5 rounded-xl border border-gray-200 bg-gray-50/60">
        {/* Preview Frame */}
        <div
          className={`${
            compact ? 'w-24 h-16' : 'w-28 h-20'
          } rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0 p-2`}
        >
          {cleanUrl && !imageBroken ? (
            <img
              src={cleanUrl}
              alt={label}
              referrerPolicy="no-referrer"
              onError={() => setImageBroken(true)}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-300">
              <ImageIcon size={22} />
              <span className="text-[10px] text-gray-400 mt-1">No logo</span>
            </div>
          )}
        </div>

        {/* Controls & Status */}
        <div className="flex-1 min-w-0 space-y-2 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept={acceptAttr}
              onChange={handleFileChange}
              disabled={status === 'uploading' || isRemoving}
              className="sr-only"
            />

            <label
              htmlFor={inputId}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 ${
                status === 'uploading' || isRemoving ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Upload size={13} />
              {cleanUrl && !imageBroken ? 'Replace Logo' : 'Upload Logo'}
            </label>

            {status === 'uploading' && (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Ban size={13} />
                Cancel
              </button>
            )}

            {cleanUrl && status !== 'uploading' && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isRemoving}
                aria-busy={isRemoving || undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-wait"
              >
                {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                {isRemoving ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>

          {status === 'uploading' && (
            <div className="space-y-1 max-w-xs">
              <progress
                value={progress}
                max={100}
                className="w-full h-1.5 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-indigo-600 [&::-moz-progress-bar]:bg-indigo-600"
              />
              <p className="text-[11px] text-gray-600 tabular-nums">
                Uploading logo ({progress}%)…
              </p>
            </div>
          )}

          {status === 'done' && (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={13} className="shrink-0" />
              <span>Saved to cloud storage</span>
            </p>
          )}

          {status === 'error' && errorMsg && (
            <p className="text-xs text-rose-600 flex items-start gap-1.5">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </p>
          )}

          {imageBroken && cleanUrl && status !== 'uploading' && (
            <p className="text-xs text-amber-700 flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0" />
              <span>Previous logo file could not be loaded. Upload a replacement PNG, JPEG, or WebP.</span>
            </p>
          )}

          <p className="text-[11px] text-gray-400">{formatHint}</p>
        </div>
      </div>
    </div>
  )
}
