import * as tus from 'tus-js-client'
import { isSupabaseConfigured } from './client'
import { STORAGE_BUCKETS, uploadDeliveryFile } from './storage'

export type UploadTaskStatus =
  | 'idle'
  | 'preparing'
  | 'optimizing'
  | 'uploading'
  | 'paused'
  | 'offline'
  | 'reconnecting'
  | 'retrying'
  | 'saving'
  | 'done'
  | 'error'

export interface UploadTaskProgress {
  fileId: string
  fileName: string
  fileSize: number
  bytesUploaded: number
  percent: number
  status: UploadTaskStatus
  statusMessage: string
  speedBytesPerSec: number
  estimatedTimeRemainingSeconds: number
  retryAttempt: number
  maxRetries: number
  error?: string
  isPermanentError?: boolean
}

export interface ResumableUploadOptions {
  projectId: string
  deliveryId: string
  fileId: string
  file: File
  clientId?: string
  maxRetries?: number
  chunkSize?: number
  onProgress?: (progress: UploadTaskProgress) => void
}

/**
 * Determines if an error is permanent (e.g. 403 RLS permission, 401 unauthorized, 400 bad request)
 * versus transient (network loss, timeout, 413 payload too large, server 5xx, socket reset).
 */
export function isPermanentUploadError(error: any): boolean {
  if (!error) return false
  const errStr = String(error.message || error || '').toLowerCase()
  
  // HTTP status code check (413 is NOT permanent — chunk size can be reduced)
  const status = error.originalResponse ? error.originalResponse.getStatus() : (error.status || 0)
  if (status >= 400 && status < 500 && status !== 408 && status !== 429 && status !== 413) {
    return true
  }

  if (
    errStr.includes('row-level security') ||
    errStr.includes('rls') ||
    errStr.includes('permission') ||
    errStr.includes('unauthorized') ||
    errStr.includes('forbidden') ||
    errStr.includes('bucket not found') ||
    errStr.includes('invalid file type')
  ) {
    return true
  }

  return false
}

/**
 * Formats a user-friendly status message for permanent errors.
 */
export function getFriendlyErrorMessage(error: any): string {
  const errStr = String(error?.message || error || '').toLowerCase()
  const status = error?.originalResponse ? error.originalResponse.getStatus() : (error?.status || 0)

  if (status === 403 || errStr.includes('permission') || errStr.includes('row-level security') || errStr.includes('rls')) {
    return 'Upload blocked by Supabase Storage RLS security policies. Check bucket permissions.'
  }
  if (status === 401 || errStr.includes('unauthorized') || errStr.includes('session')) {
    return 'Authentication expired. Please sign in again.'
  }
  if (status === 413 || errStr.includes('too large') || errStr.includes('payload')) {
    return 'Payload too large. Uploading in smaller chunks...'
  }
  if (errStr.includes('bucket not found') || errStr.includes('nosuchbucket')) {
    return `Supabase Storage bucket '${STORAGE_BUCKETS.DELIVERY_FILES}' was not found.`
  }
  if (errStr.includes('network') || errStr.includes('connection') || errStr.includes('offline') || !navigator.onLine) {
    return 'Internet connection lost. Waiting for network to return...'
  }

  return error?.message || 'Upload failed due to a network or server issue.'
}

export class ResumableUploadTask {
  public fileId: string
  public fileName: string
  public fileSize: number
  public file: File
  public projectId: string
  public deliveryId: string
  public clientId: string
  public storagePath: string

  private tusUpload: tus.Upload | null = null
  private status: UploadTaskStatus = 'idle'
  private bytesUploaded = 0
  private retryAttempt = 0
  private maxRetries = 5
  private chunkSize: number = 2 * 1024 * 1024 // 2MB default safe chunk size to prevent 413 Payload Too Large
  private onProgressCallback?: (progress: UploadTaskProgress) => void

  private startTime = 0
  private lastTime = 0
  private lastBytes = 0
  private speed = 0
  private eta = 0
  private statusMessage = 'Preparing upload...'
  private errorDetail?: string
  private isPermanentErr = false
  private retryTimer: NodeJS.Timeout | null = null
  private isCancelled = false

  // Network online/offline event listeners
  private handleOnline = () => this.onNetworkRestored()
  private handleOffline = () => this.onNetworkLost()

  constructor(options: ResumableUploadOptions) {
    this.projectId = options.projectId
    this.deliveryId = options.deliveryId
    this.fileId = options.fileId
    this.file = options.file
    this.fileName = options.file.name
    this.fileSize = options.file.size
    this.clientId = options.clientId || ''
    this.maxRetries = options.maxRetries ?? 5
    this.chunkSize = options.chunkSize ?? 2 * 1024 * 1024 // 2MB default chunks
    this.onProgressCallback = options.onProgress

    const sanitizedName = this.file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    this.storagePath = `deliveries/${this.projectId}/${this.deliveryId}/${this.fileId}/${sanitizedName}`

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  /**
   * Returns current snapshot of task progress.
   */
  public getProgress(): UploadTaskProgress {
    const percent = this.fileSize > 0 ? Math.min(100, Math.round((this.bytesUploaded / this.fileSize) * 100)) : 0
    return {
      fileId: this.fileId,
      fileName: this.fileName,
      fileSize: this.fileSize,
      bytesUploaded: this.bytesUploaded,
      percent,
      status: this.status,
      statusMessage: this.statusMessage,
      speedBytesPerSec: this.speed,
      estimatedTimeRemainingSeconds: this.eta,
      retryAttempt: this.retryAttempt,
      maxRetries: this.maxRetries,
      error: this.errorDetail,
      isPermanentError: this.isPermanentErr,
    }
  }

  private notify() {
    if (this.onProgressCallback) {
      this.onProgressCallback(this.getProgress())
    }
  }

  /**
   * Starts or resumes the file upload using standard direct upload, TUS protocol, or chunked fallback.
   */
  public async start(): Promise<{ downloadUrl: string; storagePath: string }> {
    this.isCancelled = false
    this.errorDetail = undefined
    this.isPermanentErr = false

    if (!navigator.onLine) {
      this.onNetworkLost()
      return new Promise((_, reject) => {
        const checkOnline = setInterval(() => {
          if (this.isCancelled) {
            clearInterval(checkOnline)
            reject(new Error('Upload cancelled.'))
          }
        }, 1000)
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (isSupabaseConfigured() && supabaseUrl && supabaseAnonKey) {
      // For files <= 6MB, fast direct browser upload to Supabase Storage
      if (this.fileSize <= 6 * 1024 * 1024) {
        try {
          return await this.startDirectStandardUpload()
        } catch (err: any) {
          console.warn('[Direct Upload] Standard upload failed, falling back to TUS:', err?.message)
        }
      }

      // For files > 6MB (10MB, 15MB, 25MB, 50MB+), TUS resumable upload with 2MB chunks
      try {
        return await this.startTusUpload(supabaseUrl, supabaseAnonKey)
      } catch (tusErr: any) {
        console.warn('[Resumable Upload] TUS failed, falling back to chunked server upload:', tusErr)
        return await this.startChunkedServerUpload()
      }
    } else {
      return await this.startChunkedServerUpload()
    }
  }

  /**
   * Fast direct browser upload using Supabase JS SDK for smaller files (<= 6MB).
   */
  private async startDirectStandardUpload(): Promise<{ downloadUrl: string; storagePath: string }> {
    this.status = 'uploading'
    this.statusMessage = 'Uploading directly to Supabase Storage...'
    this.notify()

    const result = await uploadDeliveryFile({
      path: this.storagePath,
      file: this.file,
      contentType: this.file.type || 'application/octet-stream',
      upsert: true,
    })

    if (result.error || !result.data?.publicUrl) {
      throw new Error(result.error?.message || 'Direct Supabase upload failed.')
    }

    this.bytesUploaded = this.fileSize
    this.status = 'saving'
    this.statusMessage = 'Saving file metadata...'
    this.notify()

    const metadataResult = await this.registerFileMetadata(result.data.publicUrl)
    this.status = 'done'
    this.statusMessage = 'Upload completed successfully'
    this.notify()

    return {
      downloadUrl: metadataResult.downloadUrl || result.data.publicUrl,
      storagePath: this.storagePath,
    }
  }

  /**
   * Executes TUS resumable upload directly to Supabase Storage with dynamic 413 chunk sizing.
   */
  private startTusUpload(supabaseUrl: string, supabaseAnonKey: string): Promise<{ downloadUrl: string; storagePath: string }> {
    return new Promise((resolve, reject) => {
      const endpoint = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`
      this.status = 'uploading'
      this.statusMessage = 'Uploading file...'
      this.startTime = Date.now()
      this.lastTime = Date.now()
      this.lastBytes = 0
      this.notify()

      this.tusUpload = new tus.Upload(this.file, {
        endpoint,
        chunkSize: this.chunkSize,
        retryDelays: [0, 1000, 2000, 4000, 8000, 16000, 30000],
        removeFingerprintOnSuccess: true,
        headers: {
          authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'x-upsert': 'true',
        },
        metadata: {
          bucketName: STORAGE_BUCKETS.DELIVERY_FILES,
          objectName: this.storagePath,
          contentType: this.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        onError: (err: any) => {
          if (this.isCancelled) return

          console.warn('[Resumable Upload] TUS onError triggered:', err)

          if (!navigator.onLine) {
            this.onNetworkLost()
            return
          }

          const status = err.originalResponse ? err.originalResponse.getStatus() : (err.status || 0)
          const errStr = String(err.message || err || '').toLowerCase()

          // Handle 413 Payload Too Large by dynamically cutting chunk size in half and retrying
          if (status === 413 || errStr.includes('413') || errStr.includes('too large') || errStr.includes('payload')) {
            console.warn('[Resumable Upload] 413 Payload Too Large received. Halving chunk size...')
            this.chunkSize = Math.max(512 * 1024, Math.floor(this.chunkSize / 2))
            this.statusMessage = `Payload too large — reducing chunk size to ${Math.round(this.chunkSize / 1024)}KB...`
            this.notify()

            if (this.chunkSize <= 512 * 1024) {
              console.warn('[Resumable Upload] Minimum chunk size reached. Switching to Chunked Server Upload...')
              this.startChunkedServerUpload().then(resolve).catch(reject)
              return
            }

            setTimeout(() => {
              if (this.isCancelled) return
              this.startTusUpload(supabaseUrl, supabaseAnonKey).then(resolve).catch(reject)
            }, 1000)
            return
          }

          if (isPermanentUploadError(err)) {
            this.isPermanentErr = true
            this.status = 'error'
            this.errorDetail = getFriendlyErrorMessage(err)
            this.statusMessage = `Failed: ${this.errorDetail}`
            this.notify()
            reject(new Error(this.errorDetail))
            return
          }

          // Handle temporary error with automatic retry & exponential backoff
          this.retryAttempt++
          if (this.retryAttempt <= this.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, this.retryAttempt - 1), 20000)
            this.status = 'retrying'
            this.statusMessage = `Retrying upload (Attempt ${this.retryAttempt} of ${this.maxRetries})...`
            this.notify()

            this.retryTimer = setTimeout(() => {
              if (this.isCancelled) return
              this.status = 'uploading'
              this.notify()
              this.tusUpload?.start()
            }, delay)
          } else {
            // If TUS fails max retries, attempt Chunked Server Upload fallback
            console.warn('[Resumable Upload] TUS failed max retries. Attempting Chunked Server Upload fallback...')
            this.startChunkedServerUpload().then(resolve).catch((fallbackErr) => {
              this.status = 'error'
              this.errorDetail = fallbackErr?.message || getFriendlyErrorMessage(err)
              this.statusMessage = `Upload failed after ${this.maxRetries} attempts.`
              this.notify()
              reject(new Error(this.errorDetail))
            })
          }
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          if (this.isCancelled) return

          this.bytesUploaded = bytesUploaded
          this.fileSize = bytesTotal
          this.status = 'uploading'
          this.retryAttempt = 0 // Reset retry counter on active progress

          const now = Date.now()
          const timeDiff = (now - this.lastTime) / 1000
          if (timeDiff >= 0.5) {
            const bytesDiff = bytesUploaded - this.lastBytes
            this.speed = Math.round(bytesDiff / timeDiff)
            this.lastTime = now
            this.lastBytes = bytesUploaded

            if (this.speed > 0) {
              this.eta = Math.round((bytesTotal - bytesUploaded) / this.speed)
            }
          }

          const percent = Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100))
          this.statusMessage = `Uploading... ${percent}%`
          this.notify()
        },
        onSuccess: async () => {
          if (this.isCancelled) return

          this.bytesUploaded = this.fileSize
          this.status = 'saving'
          this.statusMessage = 'Saving file metadata...'
          this.notify()

          try {
            // Calculate public URL
            const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${STORAGE_BUCKETS.DELIVERY_FILES}/${this.storagePath}`

            // Register file in database ONLY after successful storage upload
            const metadataResult = await this.registerFileMetadata(publicUrl)

            this.status = 'done'
            this.statusMessage = 'Upload completed successfully'
            this.notify()

            resolve({
              downloadUrl: metadataResult.downloadUrl || publicUrl,
              storagePath: this.storagePath,
            })
          } catch (regErr: any) {
            this.status = 'error'
            this.errorDetail = regErr?.message || 'Failed to save file metadata.'
            this.statusMessage = `Save failed: ${this.errorDetail}`
            this.notify()
            reject(regErr)
          }
        },
      })

      // Check if previous partial upload exists in browser local storage and resume
      this.tusUpload.findPreviousUploads().then((previousUploads) => {
        if (this.isCancelled) return
        if (previousUploads.length > 0) {
          console.log('[Resumable Upload] Resuming previous upload session for:', this.fileName)
          this.statusMessage = 'Connection restored — resuming upload...'
          this.notify()
          this.tusUpload?.resumeFromPreviousUpload(previousUploads[0])
        }
        this.tusUpload?.start()
      }).catch(() => {
        if (!this.isCancelled) {
          this.tusUpload?.start()
        }
      })
    })
  }

  /**
   * Resumable chunked uploader using 2MB slices to /api/delivery/upload-chunk.
   * Prevents 413 Payload Too Large on any file size.
   */
  private async startChunkedServerUpload(): Promise<{ downloadUrl: string; storagePath: string }> {
    this.status = 'uploading'
    this.statusMessage = 'Uploading file in safe chunks...'
    this.startTime = Date.now()
    this.lastTime = Date.now()
    this.lastBytes = 0
    this.notify()

    const currentChunkSize = this.chunkSize || 2 * 1024 * 1024
    const totalChunks = Math.max(1, Math.ceil(this.fileSize / currentChunkSize))

    for (let i = 0; i < totalChunks; i++) {
      if (this.isCancelled) throw new Error('Upload cancelled.')

      const start = i * currentChunkSize
      const end = Math.min(this.fileSize, start + currentChunkSize)
      const chunkBlob = this.file.slice(start, end)
      const chunkFile = new File([chunkBlob], this.fileName, { type: this.file.type })

      let chunkSuccess = false
      let attempt = 0

      while (!chunkSuccess && attempt < this.maxRetries) {
        if (this.isCancelled) throw new Error('Upload cancelled.')
        attempt++

        try {
          const formData = new FormData()
          formData.append('chunk', chunkFile)
          formData.append('fileId', this.fileId)
          formData.append('chunkIndex', String(i))
          formData.append('totalChunks', String(totalChunks))
          formData.append('fileName', this.fileName)
          formData.append('fileSize', String(this.fileSize))
          formData.append('fileType', this.file.type || 'application/octet-stream')
          formData.append('projectId', this.projectId)
          formData.append('deliveryId', this.deliveryId)
          formData.append('clientId', this.clientId)

          const res = await fetch('/api/delivery/upload-chunk', {
            method: 'POST',
            body: formData,
          })

          if (res.status === 413) {
            console.warn('[Chunk Upload] HTTP 413 received. Reducing chunk size and restarting...')
            this.chunkSize = Math.max(512 * 1024, Math.floor(this.chunkSize / 2))
            return await this.startChunkedServerUpload()
          }

          const data = await res.json()
          if (!res.ok || !data.success) {
            throw new Error(data.error || `Chunk ${i + 1}/${totalChunks} failed`)
          }

          chunkSuccess = true
          this.bytesUploaded = end
          const percent = Math.min(100, Math.round((end / this.fileSize) * 100))
          this.statusMessage = percent >= 100 ? 'Saving metadata...' : `Uploading... ${percent}%`

          const now = Date.now()
          const timeDiff = (now - this.lastTime) / 1000
          if (timeDiff >= 0.5) {
            const bytesDiff = this.bytesUploaded - this.lastBytes
            this.speed = Math.round(bytesDiff / timeDiff)
            this.lastTime = now
            this.lastBytes = this.bytesUploaded
            if (this.speed > 0) {
              this.eta = Math.round((this.fileSize - this.bytesUploaded) / this.speed)
            }
          }
          this.notify()

          if (data.done) {
            this.status = 'done'
            this.statusMessage = 'Upload completed successfully'
            this.notify()
            return { downloadUrl: data.downloadUrl, storagePath: data.storagePath }
          }
        } catch (err: any) {
          if (attempt >= this.maxRetries) {
            throw new Error(`Upload failed on chunk ${i + 1}/${totalChunks}: ${err?.message || 'Chunk error'}`)
          }
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 10000)))
        }
      }
    }

    throw new Error('Upload assembly failed.')
  }

  /**
   * Registers metadata record in database after storage upload succeeds.
   */
  private async registerFileMetadata(publicUrl: string): Promise<{ downloadUrl: string; storagePath: string }> {
    const formData = new FormData()
    formData.append('projectId', this.projectId)
    formData.append('deliveryId', this.deliveryId)
    formData.append('clientId', this.clientId)
    formData.append('fileDocId', this.fileId)
    formData.append('directUrl', publicUrl)
    formData.append('storagePath', this.storagePath)
    formData.append('fileName', this.file.name)
    formData.append('fileSize', String(this.file.size))
    formData.append('fileType', this.file.type || this.file.name.split('.').pop() || 'application/octet-stream')

    const res = await fetch('/api/delivery/upload', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Server registration failed.')
    }

    return {
      downloadUrl: data.downloadUrl || publicUrl,
      storagePath: data.storagePath || this.storagePath,
    }
  }

  /**
   * Called when browser detects offline state.
   */
  private onNetworkLost() {
    if (this.status === 'done' || this.isCancelled) return
    console.warn('[Resumable Upload] Network connection lost for:', this.fileName)

    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    try {
      this.tusUpload?.abort(true)
    } catch {}

    this.status = 'offline'
    this.statusMessage = 'Internet connection lost. Upload will resume when your connection returns.'
    this.notify()
  }

  /**
   * Called when browser detects internet restored.
   */
  private onNetworkRestored() {
    if (this.status !== 'offline' && this.status !== 'retrying' && this.status !== 'error') return
    if (this.isCancelled || this.isPermanentErr) return

    console.log('[Resumable Upload] Network restored! Resuming upload for:', this.fileName)
    this.status = 'reconnecting'
    this.statusMessage = 'Connection restored. Resuming upload...'
    this.notify()

    setTimeout(() => {
      if (this.isCancelled) return
      this.status = 'uploading'
      this.notify()
      if (this.tusUpload) {
        this.tusUpload.start()
      } else {
        this.start()
      }
    }, 1500)
  }

  /**
   * Pauses the upload manually.
   */
  public pause() {
    if (this.status === 'done' || this.status === 'paused') return
    if (this.retryTimer) clearTimeout(this.retryTimer)

    try {
      this.tusUpload?.abort(true)
    } catch {}

    this.status = 'paused'
    this.statusMessage = 'Upload paused'
    this.notify()
  }

  /**
   * Resumes a paused upload manually.
   */
  public resume() {
    if (this.status !== 'paused' && this.status !== 'offline') return
    this.status = 'reconnecting'
    this.statusMessage = 'Resuming upload...'
    this.notify()

    setTimeout(() => {
      if (this.tusUpload) {
        this.tusUpload.start()
      } else {
        this.start()
      }
    }, 500)
  }

  /**
   * Retries a failed upload manually.
   */
  public retry(): Promise<{ downloadUrl: string; storagePath: string }> {
    this.retryAttempt = 0
    this.isPermanentErr = false
    this.errorDetail = undefined
    return this.start()
  }

  /**
   * Cancels and cleans up the upload task.
   */
  public cancel() {
    this.isCancelled = true
    if (this.retryTimer) clearTimeout(this.retryTimer)

    try {
      this.tusUpload?.abort(true)
    } catch {}

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }

    this.status = 'error'
    this.statusMessage = 'Upload cancelled'
    this.notify()
  }

  public destroy() {
    this.cancel()
  }
}
