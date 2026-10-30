import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isValid } from 'date-fns'
import { Timestamp } from 'firebase/firestore'

// ─── Class Merge Utility ─────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency Formatting ─────────────────────────────────────
export interface CurrencyConfig {
  code: string
  label: string
  symbol: string
  locale: string
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'GHS', label: 'Ghana Cedi (GH₵)', symbol: 'GH₵', locale: 'en-GH' },
  { code: 'USD', label: 'US Dollar ($)', symbol: '$', locale: 'en-US' },
  { code: 'EUR', label: 'Euro (€)', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', label: 'British Pound (£)', symbol: '£', locale: 'en-GB' },
]

export function getCurrencySymbol(code = 'GHS'): string {
  const match = SUPPORTED_CURRENCIES.find(
    (c) => c.code.toUpperCase() === code.toUpperCase()
  )
  return match?.symbol || 'GH₵'
}

export function formatCurrency(
  amount: number,
  currency = 'GHS',
  symbol?: string
): string {
  const normalizedCode = (currency || 'GHS').toUpperCase()
  const matched = SUPPORTED_CURRENCIES.find((c) => c.code === normalizedCode)
  const actualSymbol = symbol || matched?.symbol || 'GH₵'
  const locale = matched?.locale || 'en-GH'

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)

  return `${actualSymbol}${formatted}`
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// ─── Date Formatting ─────────────────────────────────────────
export function resolveDateValue(
  date: Timestamp | Date | string | number | { seconds?: number; _seconds?: number; toDate?: () => Date } | null | undefined
): Date | null {
  if (!date) return null
  try {
    let d: Date
    if (date instanceof Timestamp) {
      d = date.toDate()
    } else if (date instanceof Date) {
      d = date
    } else if (typeof (date as any)?.toDate === 'function') {
      d = (date as any).toDate()
    } else if (typeof (date as any)?.seconds === 'number') {
      d = new Date((date as any).seconds * 1000)
    } else if (typeof (date as any)?._seconds === 'number') {
      d = new Date((date as any)._seconds * 1000)
    } else {
      d = new Date(date as string | number)
    }
    return isValid(d) ? d : null
  } catch {
    return null
  }
}

export function formatDate(
  date: Timestamp | Date | string | null | undefined,
  fmt = 'dd MMM yyyy'
): string {
  const d = resolveDateValue(date)
  if (!d) return '—'
  try {
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatRelativeTime(
  date: Timestamp | Date | string | null | undefined
): string {
  const d = resolveDateValue(date)
  if (!d) return '—'
  try {
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatDateTime(date: Timestamp | Date | string | null | undefined): string {
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
    // Quick Jobs & Delivery
    'Ready for Delivery': 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60',
    'Delivery Released': 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60',
    Released: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60',
    delivered: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    pending_payment: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
    paid: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
    ready: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60',
    draft: 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
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
    'auth/email-already-in-use': 'This email address is already registered to another account.',
    'auth/requires-recent-login':
      'For your security, please reauthenticate to confirm this account change.',
    'auth/user-token-expired':
      'Your session has expired. Please sign in again to continue.',
    'auth/user-mismatch':
      'The selected Google account does not match the signed-in administrator.',
    'auth/popup-closed-by-user':
      'Sign-in window was closed before completing authentication.',
    'auth/popup-blocked':
      'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
    'auth/unauthorized-domain':
      'This domain is not yet authorized in Firebase Authentication settings.',
    'auth/weak-password': 'Password must be at least 6 characters long.',
    'auth/operation-not-allowed':
      'Email/Password sign-in is not enabled in Firebase yet. Please use "Continue with Google" below, or enable Email/Password in your Firebase Console.',
    'auth/too-many-requests':
      'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
    'auth/invalid-credential': 'Incorrect email or password. Please check your credentials and try again.',
    'auth/configuration-not-found':
      'Firebase Authentication is not configured yet. Please sign in with email and password.',
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

// ─── Clipboard & External Navigation ─────────────────────────
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

export function openExternalUrl(url: string): void {
  if (!url || typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

// ─── Centralized App URL & Payment Link Utilities ───────────
// Delegated to authoritative gateway in ./app-url
export {
  getAppBaseUrl,
  getRuntimeUrl,
  getCustomerUrl,
  validateUrlSecurity,
  validateAppUrl,
  isVercelPlatformDomain,
  getProductionUrl,
  getAppUrl,
  appUrl,
  buildAppUrl,
  buildSecureLink,
  getPaymentLink,
  getDeliveryLink,
  buildClientPreviewUrl,
  getClientPreviewLink,
  buildPaymentUrl,
  buildSecurePaymentUrl,
  buildInvoiceUrl,
  buildDeliveryUrl,
  buildSecureDeliveryUrl,
  buildQuickJobUrl,
  buildQuickJobDeliveryUrl,
  buildPaymentCallbackUrl,
  getRuntimeOrigin,
  buildVerificationUrl,
  sanitizeRedirectUrl,
  normalizeUrl,
  isTrustedHost,
} from './app-url'


