import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isValid } from 'date-fns'
import { Timestamp } from 'firebase/firestore'

// ─── Class Merge Utility ─────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency Formatting ─────────────────────────────────────
export function formatCurrency(
  amount: number,
  currency = 'GHS',
  symbol = 'GH₵'
): string {
  const formatted = new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${symbol}${formatted}`
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Date Formatting ─────────────────────────────────────────
export function formatDate(
  date: Timestamp | Date | string | null | undefined,
  fmt = 'dd MMM yyyy'
): string {
  if (!date) return '—'
  try {
    let d: Date
    if (date instanceof Timestamp) {
      d = date.toDate()
    } else if (date instanceof Date) {
      d = date
    } else {
      d = new Date(date)
    }
    if (!isValid(d)) return '—'
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatRelativeTime(
  date: Timestamp | Date | null | undefined
): string {
  if (!date) return '—'
  try {
    const d = date instanceof Timestamp ? date.toDate() : date
    if (!isValid(d)) return '—'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatDateTime(date: Timestamp | Date | null | undefined): string {
  return formatDate(date, 'dd MMM yyyy, h:mm a')
}

// ─── Invoice Number Generation ────────────────────────────────
export function generateInvoiceNumber(
  prefix = 'LXM-INV',
  sequenceNumber: number
): string {
  return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`
}

export function generateLxmInvoiceNumber(count: number): string {
  return `LXM-INV-${String(count + 1).padStart(4, '0')}`
}

export function generateSecureToken(prefixOrLength: string | number = 'd_'): string {
  if (typeof prefixOrLength === 'number') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let res = ''
    for (let i = 0; i < prefixOrLength; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return res
  }
  const timestamp = Date.now().toString(36)
  const randomStr = Math.random().toString(36).substring(2, 10)
  return `${prefixOrLength}${timestamp}_${randomStr}`
}

// ─── String Utilities ─────────────────────────────────────────
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.slice(0, maxLength)}...`
}

export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'LM'
  const trimmed = name.trim()
  if (!trimmed) return 'LM'
  const parts = trimmed.split(' ').filter(Boolean)
  if (parts.length === 0) return 'LM'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Status Color Mapping ─────────────────────────────────────
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    // Invoice / Payment statuses
    Draft: 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
    Pending: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    'Partially Paid': 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60',
    Paid: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    Overdue: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
    Cancelled: 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
    // Project statuses
    Inquiry: 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
    'Awaiting Payment': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    'In Progress': 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
    Review: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
    Revision: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60',
    Completed: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    // Generic
    active: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    inactive: 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
    archived: 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
    disabled: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
    expired: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60',
    // Payment
    Unpaid: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    success: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    failed: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
    abandoned: 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
  }
  return map[status] ?? 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
}

// ─── Number Utilities ────────────────────────────────────────
export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountType?: 'percentage' | 'fixed',
  discountValue?: number,
  taxRate?: number
): { subtotal: number; discountAmount: number; taxAmount: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  )

  let discountAmount = 0
  if (discountValue && discountValue > 0) {
    if (discountType === 'percentage') {
      discountAmount = (subtotal * discountValue) / 100
    } else {
      discountAmount = discountValue
    }
  }

  const taxableAmount = subtotal - discountAmount
  const taxAmount = taxRate ? (taxableAmount * taxRate) / 100 : 0
  const total = taxableAmount + taxAmount

  return { subtotal, discountAmount, taxAmount, total }
}

// ─── Error Handling ──────────────────────────────────────────
export function getFirebaseErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests':
      'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
    'permission-denied': 'You do not have permission to perform this action.',
  }
  return messages[code] ?? 'An unexpected error occurred. Please try again.'
}

// ─── WhatsApp Link Generation & Phone Formatting ──────────────
export interface WhatsAppPhoneResult {
  formatted: string
  isValid: boolean
  displayFormatted: string
  error?: string
}

export function formatWhatsAppPhone(phone?: string | null): WhatsAppPhoneResult {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return {
      formatted: '',
      isValid: false,
      displayFormatted: '',
      error: 'No phone number provided',
    }
  }

  const trimmed = phone.trim()
  let clean = trimmed.replace(/[^\d+]/g, '')

  if (clean.startsWith('+')) {
    clean = clean.slice(1)
  }

  if (clean.startsWith('00')) {
    clean = clean.slice(2)
  }

  // Convert Ghana local 10-digit format (024XXXXXXX -> 23324XXXXXXX)
  if (clean.startsWith('0') && clean.length === 10) {
    clean = '233' + clean.slice(1)
  }

  clean = clean.replace(/\D/g, '')

  if (clean.length < 7) {
    return {
      formatted: clean,
      isValid: false,
      displayFormatted: trimmed,
      error: 'Phone number is too short (min 7 digits required).',
    }
  }

  if (clean.length > 15) {
    return {
      formatted: clean,
      isValid: false,
      displayFormatted: trimmed,
      error: 'Phone number exceeds maximum length (max 15 digits).',
    }
  }

  return {
    formatted: clean,
    isValid: true,
    displayFormatted: `+${clean}`,
  }
}

export function generateWhatsAppLink(phone?: string | null, message = ''): string {
  const encodedMessage = encodeURIComponent(message)
  const phoneRes = formatWhatsAppPhone(phone)
  if (phoneRes.isValid && phoneRes.formatted) {
    return `https://wa.me/${phoneRes.formatted}?text=${encodedMessage}`
  }
  return `https://wa.me/?text=${encodedMessage}`
}

// ─── File Formatting & Helpers ───────────────────────────────
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function getFileCategory(fileName: string, mimeType?: string): 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'document' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'tiff'].includes(ext) || mimeType?.startsWith('image/')) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext) || mimeType?.startsWith('video/')) return 'video'
  if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'].includes(ext) || mimeType?.startsWith('audio/')) return 'audio'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType?.includes('zip') || mimeType?.includes('compressed')) return 'archive'
  if (['doc', 'docx', 'txt', 'rtf', 'csv', 'xlsx', 'pptx'].includes(ext)) return 'document'
  return 'other'
}

// ─── Clipboard ───────────────────────────────────────────────
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    return true
  }
}

// ─── Centralized App URL & Payment Link Utilities ───────────
/**
 * Returns the application base URL without trailing slash.
 * 
 * 1. Browser-side: Always prefers window.location.origin.
 *    This ensures that when an admin or user is using the deployed Ctrl Room app,
 *    links dynamically match the current deployed domain (or localhost during local dev).
 * 
 * 2. Server-side: Uses configured APP_URL, NEXT_PUBLIC_APP_URL, or VERCEL_URL.
 *    Prefers non-localhost URLs and forbids falling back to localhost in production.
 */
export function getAppUrl(): string {
  // Browser context: authoritative for client-side interactions
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }

  // Server context: evaluate environment variables
  const candidateUrls = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean) as string[]

  // In production or when candidate URLs exist, prefer non-localhost entries
  const nonLocalhost = candidateUrls.find(
    (u) => !u.includes('localhost') && !u.includes('127.0.0.1')
  )

  const selectedUrl = nonLocalhost || candidateUrls[0]

  if (selectedUrl) {
    const normalized = selectedUrl.startsWith('http')
      ? selectedUrl
      : `https://${selectedUrl}`
    return normalized.replace(/\/$/, '')
  }

  // Server-side in production without environment variables must fail clearly
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Production environment is missing APP_URL or NEXT_PUBLIC_APP_URL configuration.')
    throw new Error('APP_URL is not configured for production. Please set APP_URL in your hosting platform environment.')
  }

  // Local development default fallback
  return 'http://localhost:3000'
}

/**
 * Builds an absolute application URL given a path.
 */
export function appUrl(path = ''): string {
  const base = getAppUrl()
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${base}${cleanPath}`
}

/**
 * Centralized payment-link generator for Ctrl Room.
 * Generates the authoritative customer-facing payment URL across the app:
 * Admin dashboard, Copy button, WhatsApp messages, Email, Invoices, and Projects.
 */
export function getPaymentLink(tokenOrId: string): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  return appUrl(`/pay/${cleanToken}`)
}

/**
 * Centralized delivery-link generator for Ctrl Room.
 * Generates the authoritative customer-facing delivery portal URL across the app:
 * Client delivery portal, emails, and admin copy/share actions.
 */
export function getDeliveryLink(accessToken: string): string {
  const cleanToken = (accessToken || '').trim()
  return appUrl(`/delivery/${encodeURIComponent(cleanToken)}`)
}

