'use client'

import React, { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Download,
  CreditCard,
  RefreshCw,
  Copy,
  Clock,
  FileText,
  Printer,
  X,
  Lock,
  ExternalLink,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import {
  formatCurrency,
  formatDateTime,
  copyToClipboard,
  fetchWithTimeout,
} from '@/lib/utils'
import { useBranding } from '@/lib/contexts/BrandingContext'
import {
  resolveBrandLogoCandidates,
  resolveBrandPalette,
} from '@/lib/branding/payment-theme'
import type { BrandingSettings, BusinessSettings } from '@/lib/types'
import toast from 'react-hot-toast'

type PaymentVerificationState =
  | 'verifying'
  | 'success'
  | 'pending'
  | 'failed'
  | 'invalid_reference'

interface VerifyResult {
  status: string
  paymentState?: PaymentVerificationState
  gatewayStatus?: string
  message?: string
  error?: string
  reference?: string
  receiptNumber?: string
  amount?: number
  currency?: string
  paidAt?: string
  channel?: string
  invoiceId?: string
  invoiceNumber?: string
  projectName?: string
  clientName?: string
  clientEmail?: string
  paymentStatus?: string
  totalAmount?: number
  totalPaid?: number
  remainingBalance?: number
  isFullyPaid?: boolean
  token?: string
  canAccessDeliverables?: boolean
  lockedDeliveryExists?: boolean
  deliveryAccessToken?: string
  deliveryUrl?: string | null
  quickJobPortalToken?: string
}

const CELEBRATION_DOTS = [
  { x: -58, y: -42, delay: 0.08, size: 'w-1.5 h-1.5' },
  { x: 58, y: -38, delay: 0.12, size: 'w-2 h-2' },
  { x: -68, y: 8, delay: 0.16, size: 'w-1.5 h-1.5' },
  { x: 66, y: 12, delay: 0.14, size: 'w-1.5 h-1.5' },
  { x: -38, y: 48, delay: 0.2, size: 'w-2 h-2' },
  { x: 42, y: 46, delay: 0.18, size: 'w-1.5 h-1.5' },
]

function formatChannelLabel(raw?: string): string {
  if (!raw) return 'Paystack Checkout'
  const cleaned = raw.trim().toLowerCase()
  if (cleaned === 'mobile_money' || cleaned === 'momo') return 'Mobile Money'
  if (cleaned === 'card') return 'Card Payment'
  if (cleaned === 'bank_transfer' || cleaned === 'dedicated_nuban') return 'Bank Transfer'
  if (cleaned === 'ussd') return 'USSD'
  return cleaned
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function CallbackBrandLogo({
  branding,
  businessName,
  surface = 'adaptive',
  size = 'md',
}: {
  branding: Partial<BrandingSettings>
  businessName: string
  surface?: 'light' | 'dark' | 'adaptive'
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})

  const markFailed = useCallback((url: string) => {
    if (!url) return
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }, [])

  const lightCandidates = useMemo(
    () => resolveBrandLogoCandidates(branding, 'light'),
    [branding]
  )
  const darkCandidates = useMemo(
    () => resolveBrandLogoCandidates(branding, 'dark'),
    [branding]
  )

  const activeLightLogo = lightCandidates.find((u) => !failedUrls[u]) || ''
  const activeDarkLogo = darkCandidates.find((u) => !failedUrls[u]) || ''

  const sizeClass =
    size === 'lg'
      ? 'max-h-12 sm:max-h-14 max-w-[190px] sm:max-w-[220px]'
      : size === 'sm'
      ? 'max-h-8 sm:max-h-9 max-w-[140px] sm:max-w-[165px]'
      : 'max-h-10 sm:max-h-11 max-w-[168px] sm:max-w-[200px]'

  if (surface === 'light') {
    if (!activeLightLogo) {
      return (
        <span className="text-lg sm:text-xl font-extrabold tracking-[-0.025em] text-[#0F172A] break-words">
          {businessName}
        </span>
      )
    }
    return (
      <img
        src={activeLightLogo}
        alt={`${businessName} logo`}
        referrerPolicy="no-referrer"
        onError={() => markFailed(activeLightLogo)}
        className={`${sizeClass} w-auto h-auto object-contain select-none`}
      />
    )
  }

  if (surface === 'dark') {
    if (!activeDarkLogo) {
      return (
        <span className="text-lg sm:text-xl font-extrabold tracking-[-0.025em] text-white break-words">
          {businessName}
        </span>
      )
    }
    return (
      <img
        src={activeDarkLogo}
        alt={`${businessName} logo`}
        referrerPolicy="no-referrer"
        onError={() => markFailed(activeDarkLogo)}
        className={`${sizeClass} w-auto h-auto object-contain select-none`}
      />
    )
  }

  // Adaptive mode for light + dark theme
  if (!activeLightLogo && !activeDarkLogo) {
    return (
      <span className="text-xl sm:text-2xl font-extrabold tracking-[-0.025em] text-[#0F172A] dark:text-[#F8FAFC] break-words">
        {businessName}
      </span>
    )
  }

  if (activeLightLogo && activeDarkLogo && activeLightLogo !== activeDarkLogo) {
    return (
      <>
        <img
          src={activeLightLogo}
          alt={`${businessName} logo`}
          referrerPolicy="no-referrer"
          onError={() => markFailed(activeLightLogo)}
          className={`${sizeClass} w-auto h-auto object-contain select-none dark:hidden`}
        />
        <img
          src={activeDarkLogo}
          alt={`${businessName} logo`}
          referrerPolicy="no-referrer"
          onError={() => markFailed(activeDarkLogo)}
          className={`${sizeClass} w-auto h-auto object-contain select-none hidden dark:block`}
        />
      </>
    )
  }

  const singleUrl = activeLightLogo || activeDarkLogo
  return (
    <img
      src={singleUrl}
      alt={`${businessName} logo`}
      referrerPolicy="no-referrer"
      onError={() => markFailed(singleUrl)}
      className={`${sizeClass} w-auto h-auto object-contain select-none`}
    />
  )
}

function ThankYouPopupModal({
  open,
  onClose,
  branding,
  businessName,
  amountFormatted,
  invoiceNumber,
}: {
  open: boolean
  onClose: () => void
  branding: Partial<BrandingSettings>
  businessName: string
  amountFormatted: string
  invoiceNumber?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thank-you-popup-heading"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.22 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-md"
          />

          {/* Modal Dialog */}
          <motion.div
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: 16 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 10 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 300, damping: 26 }
            }
            className="relative z-10 w-full max-w-[420px] rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_28px_70px_-12px_rgba(15,23,42,0.42)] overflow-hidden text-center"
          >
            {/* Brand Top Accent Strip */}
            <div className="h-1.5 w-full bg-[image:var(--cb-header-gradient)]" />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close thank you popup"
              className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white hover:bg-[#F1F5F9] dark:hover:bg-[#1F2937] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="px-6 pt-7 pb-7 sm:px-8 sm:pt-8 sm:pb-8 space-y-6">
              {/* Configured Business Logo */}
              <div className="flex flex-col items-center justify-center gap-1.5">
                <CallbackBrandLogo
                  branding={branding}
                  businessName={businessName}
                  surface="adaptive"
                  size="md"
                />
              </div>

              {/* Animated Checkmark & Subtle Celebratory Motion */}
              <div className="relative flex items-center justify-center py-2">
                {!prefersReducedMotion && (
                  <>
                    <motion.div
                      initial={{ scale: 0.7, opacity: 0.55 }}
                      animate={{ scale: 1.55, opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                      className="absolute w-16 h-16 rounded-full border-2 border-emerald-500/40 pointer-events-none"
                    />
                    {CELEBRATION_DOTS.map((dot, idx) => (
                      <motion.span
                        key={idx}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                        animate={{
                          x: dot.x,
                          y: dot.y,
                          scale: [0, 1.1, 0],
                          opacity: [0, 0.85, 0],
                        }}
                        transition={{
                          duration: 0.85,
                          delay: dot.delay,
                          ease: 'easeOut',
                        }}
                        className={`absolute rounded-full ${dot.size} ${
                          idx % 2 === 0
                            ? 'bg-emerald-500'
                            : 'bg-[var(--cb-accent)]'
                        } pointer-events-none`}
                      />
                    ))}
                  </>
                )}

                <motion.div
                  initial={prefersReducedMotion ? { opacity: 1 } : { scale: 0.65, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0.1 }
                      : { type: 'spring', stiffness: 320, damping: 20, delay: 0.05 }
                  }
                  className="relative w-[68px] h-[68px] rounded-[22px] bg-emerald-500/12 dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm"
                >
                  <Check size={34} strokeWidth={2.75} />
                </motion.div>
              </div>

              {/* Copy */}
              <div className="space-y-2">
                <h2
                  id="thank-you-popup-heading"
                  className="text-2xl sm:text-[26px] font-extrabold tracking-[-0.025em] text-[#0F172A] dark:text-[#F8FAFC]"
                >
                  Thank You!
                </h2>
                <p className="text-sm sm:text-[15px] leading-relaxed text-[#475569] dark:text-[#94A3B8] max-w-[320px] mx-auto">
                  Your payment has been successfully received. We appreciate your business!
                </p>
              </div>

              {/* Verified Amount Summary Strip */}
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="text-left min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B] dark:text-[#94A3B8]">
                    Confirmed Amount
                  </p>
                  {invoiceNumber && (
                    <p className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1] truncate mt-0.5">
                      {invoiceNumber}
                    </p>
                  )}
                </div>
                <span className="font-mono tabular-nums text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {amountFormatted}
                </span>
              </div>

              {/* Branded Primary Action */}
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[48px] px-5 py-3.5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm tracking-[-0.01em] shadow-[0_10px_24px_-6px_var(--cb-cta-shadow)] hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>View Payment Details</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function OfficialReceiptModal({
  open,
  onClose,
  branding,
  businessInfo,
  businessName,
  result,
  reference,
  resolvedToken,
  onOpenPaymentPortal,
}: {
  open: boolean
  onClose: () => void
  branding: Partial<BrandingSettings>
  businessInfo: Partial<BusinessSettings> | null
  businessName: string
  result: VerifyResult
  reference: string
  resolvedToken: string
  onOpenPaymentPortal: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const currency = result.currency || 'GHS'
  const amountPaid = Number(result.amount || 0)
  const totalAmount = Number(result.totalAmount || amountPaid)
  const totalPaid = Number(result.totalPaid || amountPaid)
  const remainingBalance = Math.max(0, Number(result.remainingBalance ?? 0))
  const isFullyPaid = result.isFullyPaid !== false && remainingBalance <= 0.01
  const receiptNumber =
    result.receiptNumber ||
    `RCP-${reference.replace(/^LXM_/i, '').replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase() || '000001'}`

  const supportEmail = (businessInfo?.email || '').trim()
  const supportPhone = (businessInfo?.phone || businessInfo?.whatsapp || '').trim()
  const supportAddress = (businessInfo?.address || '').trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-receipt-title"
    >
      <div
        onClick={onClose}
        className="no-print fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-[580px] my-auto">
        {/* Top Action Toolbar (Hidden when printing) */}
        <div className="no-print flex items-center justify-between gap-2 mb-3 px-1">
          <span className="text-xs font-semibold text-white/90 tracking-wide">
            Official Payment Receipt
          </span>
          <div className="flex items-center gap-2">
            {resolvedToken && (
              <button
                type="button"
                onClick={onOpenPaymentPortal}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Payment Portal</span>
                <ExternalLink size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] text-xs font-bold transition-opacity hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt"
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Printable White Paper Receipt Sheet */}
        <article className="invoice-paper-sheet rounded-[24px] bg-white text-[#1E1F1D] border border-[#E2E8F0] shadow-2xl overflow-hidden">
          <div className="h-2 w-full bg-[image:var(--cb-header-gradient)]" />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#E5E7EB]">
              <div className="space-y-1.5">
                <CallbackBrandLogo
                  branding={branding}
                  businessName={businessName}
                  surface="light"
                  size="md"
                />
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#475569] pt-1">
                  {businessName}
                </p>
                {(supportEmail || supportPhone || supportAddress) && (
                  <div className="text-[11.5px] text-[#64748B] space-y-0.5 leading-snug">
                    {supportPhone && <p>{supportPhone}</p>}
                    {supportEmail && <p className="break-all">{supportEmail}</p>}
                    {supportAddress && <p>{supportAddress}</p>}
                  </div>
                )}
              </div>

              <div className="sm:text-right space-y-1">
                <h2
                  id="payment-receipt-title"
                  className="text-xl sm:text-2xl font-extrabold tracking-[-0.025em] text-[#0F172A]"
                >
                  Payment Receipt
                </h2>
                <p className="font-mono tabular-nums text-xs font-bold text-[#334155]">
                  {receiptNumber}
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-700">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    {isFullyPaid ? 'Paid in Full' : 'Verified Deposit'}
                  </span>
                </div>
              </div>
            </div>

            {/* Amount Highlight */}
            <div className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#64748B]">
                  Amount Received
                </p>
                <p className="text-xs text-[#475569] mt-0.5">
                  Verified via Paystack ({formatChannelLabel(result.channel)})
                </p>
              </div>
              <p className="font-mono tabular-nums text-2xl sm:text-3xl font-extrabold text-[#0F172A]">
                {formatCurrency(amountPaid, currency)}
              </p>
            </div>

            {/* Metadata Rows */}
            <div className="divide-y divide-[#E5E7EB] text-xs sm:text-[13px]">
              {result.clientName && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <span className="text-[#64748B] font-medium">Received From</span>
                  <span className="font-bold text-[#0F172A] text-right break-words">
                    {result.clientName}
                  </span>
                </div>
              )}
              {result.projectName && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <span className="text-[#64748B] font-medium">Project / Description</span>
                  <span className="font-semibold text-[#0F172A] text-right break-words max-w-[65%]">
                    {result.projectName}
                  </span>
                </div>
              )}
              {result.invoiceNumber && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <span className="text-[#64748B] font-medium">Invoice Number</span>
                  <span className="font-mono tabular-nums font-bold text-[#0F172A] text-right">
                    {result.invoiceNumber}
                  </span>
                </div>
              )}
              <div className="py-2.5 flex items-baseline justify-between gap-4">
                <span className="text-[#64748B] font-medium shrink-0">Payment Reference</span>
                <span className="font-mono tabular-nums font-semibold text-[#0F172A] text-right break-all">
                  {result.reference || reference}
                </span>
              </div>
              <div className="py-2.5 flex items-baseline justify-between gap-4">
                <span className="text-[#64748B] font-medium">Payment Date</span>
                <span className="font-semibold tabular-nums text-[#0F172A] text-right">
                  {formatDateTime(result.paidAt || new Date().toISOString())}
                </span>
              </div>
              <div className="py-2.5 flex items-baseline justify-between gap-4">
                <span className="text-[#64748B] font-medium">Payment Status</span>
                <span className="font-bold text-emerald-700 text-right">
                  {isFullyPaid ? 'Confirmed — Paid in Full' : 'Confirmed — Partially Paid'}
                </span>
              </div>
            </div>

            {/* Balance Breakdown if Invoice/Project has Total */}
            {totalAmount > 0 && (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#475569]">
                  <span>Total Billed</span>
                  <span className="font-mono tabular-nums font-semibold text-[#0F172A]">
                    {formatCurrency(totalAmount, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#475569]">
                  <span>Total Paid to Date</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    {formatCurrency(totalPaid, currency)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between font-bold text-[13px] text-[#0F172A]">
                  <span>Remaining Balance</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(remainingBalance, currency)}
                  </span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-3 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#64748B]">
              <span>Thank you for your business with {businessName}.</span>
              <span className="inline-flex items-center gap-1 font-medium">
                <ShieldCheck size={13} className="text-emerald-600" />
                Verified by Paystack
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()
  const { branding } = useBranding()
  const scopeId = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  const reference = (
    searchParams?.get('reference') ||
    searchParams?.get('trxref') ||
    ''
  ).trim()
  const queryToken = (searchParams?.get('token') || '').trim()

  const [liveBrandingOverride, setLiveBrandingOverride] =
    useState<Partial<BrandingSettings> | null>(null)
  const [businessInfo, setBusinessInfo] = useState<Partial<BusinessSettings> | null>(null)

  const [paymentState, setPaymentState] = useState<PaymentVerificationState>(() =>
    reference ? 'verifying' : 'invalid_reference'
  )
  const [statusMessage, setStatusMessage] = useState<string>(() =>
    reference ? '' : 'No payment transaction reference was found in this confirmation link.'
  )
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [isRechecking, setIsRechecking] = useState(false)
  const [isNavigatingPrimary, setIsNavigatingPrimary] = useState(false)
  const [copiedRef, setCopiedRef] = useState(false)
  const [showThankYouPopup, setShowThankYouPopup] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Fetch latest branding & business contact settings so updates in Settings -> Branding always reflect immediately
  useEffect(() => {
    let active = true
    fetch('/api/branding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!active || !payload?.success) return
        if (payload.branding) {
          setLiveBrandingOverride(payload.branding)
        }
        if (payload.business) {
          setBusinessInfo(payload.business)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const effectiveBranding = useMemo<BrandingSettings>(
    () => ({
      ...branding,
      ...(liveBrandingOverride || {}),
    }),
    [branding, liveBrandingOverride]
  )

  const palette = useMemo(
    () => resolveBrandPalette(effectiveBranding),
    [effectiveBranding]
  )

  const scopedCss = useMemo(
    () => `
      [data-cb-scope="${scopeId}"] {
        --cb-primary: ${palette.primaryColor};
        --cb-secondary: ${palette.secondaryColor};
        --cb-accent: ${palette.accentColor};
        --cb-cta-bg: ${palette.ctaBg};
        --cb-cta-text: ${palette.ctaText};
        --cb-cta-shadow: ${palette.ctaShadow};
        --cb-accent-soft: ${palette.accentSoftBg};
        --cb-accent-border: ${palette.accentSoftBorder};
        --cb-primary-soft: ${palette.primarySoftBg};
        --cb-header-gradient: ${palette.headerGradient};
      }
    `,
    [scopeId, palette]
  )

  const triggerThankYouOnce = useCallback((verifiedRef: string) => {
    if (!verifiedRef || typeof window === 'undefined') return
    try {
      const storageKey = `lexmedia_ty_popup_${verifiedRef}`
      const alreadyShown = window.sessionStorage.getItem(storageKey)
      if (!alreadyShown) {
        window.sessionStorage.setItem(storageKey, '1')
        setShowThankYouPopup(true)
      }
    } catch {
      setShowThankYouPopup(true)
    }
  }, [])

  const runVerification = useCallback(
    async (isManualRecheck = false) => {
      if (!reference) {
        setPaymentState('invalid_reference')
        setStatusMessage(
          'No payment transaction reference was found in this confirmation link.'
        )
        return
      }

      if (isManualRecheck) {
        setIsRechecking(true)
      } else {
        setPaymentState('verifying')
      }

      try {
        const queryParams = new URLSearchParams()
        queryParams.set('reference', reference)
        if (queryToken) queryParams.set('token', queryToken)

        const res = await fetchWithTimeout(
          `/api/paystack/verify?${queryParams.toString()}`,
          { timeoutMs: 20000, cache: 'no-store' }
        )
        const data: VerifyResult = await res.json().catch(() => ({
          status: 'error',
          error: 'Invalid response received from verification server.',
        }))

        if (!mountedRef.current) return

        if (res.ok && (data.status === 'success' || data.paymentState === 'success')) {
          setResult(data)
          setPaymentState('success')
          setStatusMessage('')
          triggerThankYouOnce(data.reference || reference)
          if (isManualRecheck) {
            toast.success('Payment verified!')
          }
          return
        }

        if (res.status === 202 || data.paymentState === 'pending' || data.status === 'pending') {
          setResult(data)
          setPaymentState('pending')
          setStatusMessage(
            data.message ||
              'Your payment is still being processed by your bank or mobile money provider. Please wait a moment and recheck.'
          )
          if (isManualRecheck) {
            toast('Payment is still processing with the gateway.', { icon: '⏳' })
          }
          return
        }

        if (
          data.paymentState === 'invalid_reference' ||
          data.status === 'invalid_reference' ||
          res.status === 404
        ) {
          setResult(data)
          setPaymentState('invalid_reference')
          setStatusMessage(
            data.error ||
              'We could not find a valid payment transaction matching this reference.'
          )
          if (isManualRecheck) {
            toast.error('Invalid or unrecognized payment reference.')
          }
          return
        }

        setResult(data)
        setPaymentState('failed')
        setStatusMessage(
          data.error ||
            'We were unable to confirm completion of this payment with Paystack.'
        )
        if (isManualRecheck) {
          toast.error(data.error || 'Payment could not be confirmed.')
        }
      } catch {
        if (!mountedRef.current) return
        setPaymentState('pending')
        setStatusMessage(
          'Network connection timed out while checking with the payment gateway. Please recheck your payment status.'
        )
        if (isManualRecheck) {
          toast.error('Connection timed out. Please try again.')
        }
      } finally {
        if (mountedRef.current) {
          setIsRechecking(false)
        }
      }
    },
    [reference, queryToken, triggerThankYouOnce]
  )

  useEffect(() => {
    runVerification(false)
  }, [runVerification])

  const resolvedToken = (result?.token || queryToken || '').trim()
  const verifiedRef = (result?.reference || reference || '').trim()
  const currency = result?.currency || 'GHS'
  const amountPaid = Number(result?.amount || 0)
  const formattedAmountPaid = formatCurrency(amountPaid, currency)
  const remainingBalance = Math.max(0, Number(result?.remainingBalance ?? 0))
  const isFullyPaid = result?.isFullyPaid !== false && remainingBalance <= 0.01

  const canOpenDeliverables = Boolean(
    result?.canAccessDeliverables && result?.deliveryAccessToken
  )
  const canOpenQuickJobPortal = Boolean(
    !canOpenDeliverables && result?.isFullyPaid && result?.quickJobPortalToken
  )

  const handleCopyReference = async () => {
    if (!verifiedRef) return
    const ok = await copyToClipboard(verifiedRef)
    if (ok) {
      setCopiedRef(true)
      toast.success('Payment reference copied')
      window.setTimeout(() => {
        if (mountedRef.current) setCopiedRef(false)
      }, 2000)
    }
  }

  const handleNavigatePrimary = (targetPath: string) => {
    if (!targetPath || isNavigatingPrimary) return
    setIsNavigatingPrimary(true)
    router.push(targetPath)
    window.setTimeout(() => {
      if (mountedRef.current) setIsNavigatingPrimary(false)
    }, 4000)
  }

  return (
    <div
      data-cb-scope={scopeId}
      className="min-h-screen w-full overflow-x-hidden bg-[#F8FAFC] dark:bg-[#090D16] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col justify-between px-4 pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10 relative"
    >
      <style dangerouslySetInnerHTML={{ __html: scopedCss }} />

      {/* Subtle Brand Ambient Glow */}
      <div className="no-print fixed inset-x-0 top-0 h-72 pointer-events-none bg-[radial-gradient(ellipse_75%_65%_at_50%_-15%,var(--cb-accent-soft),transparent)]" />

      {/* Branded Thank You Popup (Shown Once After Verified Payment) */}
      {paymentState === 'success' && result && (
        <ThankYouPopupModal
          open={showThankYouPopup}
          onClose={() => setShowThankYouPopup(false)}
          branding={effectiveBranding}
          businessName={palette.businessName}
          amountFormatted={formattedAmountPaid}
          invoiceNumber={result.invoiceNumber}
        />
      )}

      {/* Printable Official Payment Receipt Modal */}
      {paymentState === 'success' && result && (
        <OfficialReceiptModal
          open={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          branding={effectiveBranding}
          businessInfo={businessInfo}
          businessName={palette.businessName}
          result={result}
          reference={verifiedRef}
          resolvedToken={resolvedToken}
          onOpenPaymentPortal={() => {
            if (resolvedToken) {
              router.push(`/pay/${encodeURIComponent(resolvedToken)}?receipt=1`)
            }
          }}
        />
      )}

      {/* Main Confirmation Content */}
      <main className="no-print w-full max-w-[540px] mx-auto my-auto z-10 space-y-6">
        {/* 1. Dynamic Brand Header */}
        <header className="flex flex-col items-center text-center space-y-2.5">
          <CallbackBrandLogo
            branding={effectiveBranding}
            businessName={palette.businessName}
            surface="adaptive"
            size="lg"
          />

          <div className="space-y-0.5">
            <h1 className="text-base sm:text-lg font-bold tracking-[-0.015em] text-[#0F172A] dark:text-[#F8FAFC]">
              {palette.businessName}
            </h1>
            <p className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Secure Payment Verification</span>
            </p>
          </div>
        </header>

        {/* 2. State Cards */}
        {paymentState === 'verifying' && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="h-1.5 w-full bg-[image:var(--cb-header-gradient)]" />
            <div className="p-6 sm:p-9 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-[var(--cb-accent-soft)] border border-[var(--cb-accent-border)] flex items-center justify-center mx-auto text-[var(--cb-cta-bg)] dark:text-[#60A5FA]">
                <RefreshCw size={28} className="animate-spin" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-[#0F172A] dark:text-[#F8FAFC]">
                  Verifying Your Payment
                </h2>
                <p className="text-sm text-[#475569] dark:text-[#94A3B8] max-w-sm mx-auto leading-relaxed">
                  Confirming your transaction status directly with Paystack and preparing your confirmation details...
                </p>
              </div>

              {reference && (
                <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] py-2.5 px-4 text-xs font-mono tabular-nums text-[#475569] dark:text-[#94A3B8] break-all">
                  Reference: {reference}
                </div>
              )}
            </div>
          </motion.section>
        )}

        {paymentState === 'success' && result && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_22px_55px_-14px_rgba(15,23,42,0.1)] overflow-hidden"
          >
            {/* Brand Top Accent Strip */}
            <div className="h-1.5 w-full bg-[image:var(--cb-header-gradient)]" />

            <div className="p-6 sm:p-8 space-y-6">
              {/* Success Hero Section */}
              <div className="text-center space-y-3">
                <motion.div
                  initial={prefersReducedMotion ? { opacity: 1 } : { scale: 0.82, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0.1 }
                      : { type: 'spring', stiffness: 280, damping: 20 }
                  }
                  className="w-16 h-16 rounded-[22px] bg-emerald-500/12 dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 size={32} strokeWidth={2.25} />
                </motion.div>

                <div className="space-y-1.5">
                  <h2 className="text-2xl sm:text-[26px] font-extrabold tracking-[-0.025em] text-[#0F172A] dark:text-[#F8FAFC]">
                    Payment Confirmed!
                  </h2>
                  <p className="text-sm leading-relaxed text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                    Thank you for your payment. Your transaction has been securely verified and processed.
                  </p>
                </div>

                {/* Prominent Amount Anchor */}
                <div className="pt-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B] dark:text-[#94A3B8]">
                    Amount Paid
                  </p>
                  <p className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#0F172A] dark:text-[#F8FAFC] mt-0.5">
                    {formattedAmountPaid}
                  </p>
                </div>
              </div>

              {/* Real Verified Payment Information Ledger */}
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] px-4 py-1.5 sm:px-5 divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs sm:text-[13.5px]">
                <div className="py-3 flex items-center justify-between gap-3">
                  <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">
                    Amount Paid
                  </span>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {formattedAmountPaid}
                  </span>
                </div>

                {result.invoiceNumber && (
                  <div className="py-3 flex items-center justify-between gap-3">
                    <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                      Invoice Number
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#0F172A] dark:text-[#F8FAFC] text-right break-words">
                      {result.invoiceNumber}
                    </span>
                  </div>
                )}

                {result.projectName && (
                  <div className="py-3 flex items-baseline justify-between gap-3">
                    <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                      Project / Service
                    </span>
                    <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] text-right break-words max-w-[65%]">
                      {result.projectName}
                    </span>
                  </div>
                )}

                {verifiedRef && (
                  <div className="py-3 flex items-center justify-between gap-3">
                    <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                      Payment Reference
                    </span>
                    <div className="flex items-center justify-end gap-1.5 min-w-0">
                      <span className="font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#E2E8F0] text-right break-all">
                        {verifiedRef}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyReference}
                        aria-label="Copy payment reference"
                        title="Copy reference"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white hover:bg-[#E2E8F0]/60 dark:hover:bg-[#1E293B] transition-colors shrink-0 cursor-pointer"
                      >
                        {copiedRef ? (
                          <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="py-3 flex items-center justify-between gap-3">
                  <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                    Payment Date
                  </span>
                  <span className="font-semibold tabular-nums text-[#0F172A] dark:text-[#F8FAFC] text-right">
                    {formatDateTime(result.paidAt || new Date().toISOString())}
                  </span>
                </div>

                <div className="py-3 flex items-center justify-between gap-3">
                  <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                    Payment Status
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 text-right">
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>
                      {isFullyPaid ? 'Confirmed • Paid in Full' : 'Confirmed • Partially Paid'}
                    </span>
                  </span>
                </div>

                {!isFullyPaid && remainingBalance > 0 && (
                  <div className="py-3 flex items-center justify-between gap-3">
                    <span className="text-[#64748B] dark:text-[#94A3B8] font-medium shrink-0">
                      Remaining Balance
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#0F172A] dark:text-[#F8FAFC] text-right">
                      {formatCurrency(remainingBalance, currency)}
                    </span>
                  </div>
                )}
              </div>

              {/* Partial-Payment Deliverable Gate Notice (if deliverables require full balance) */}
              {result.lockedDeliveryExists && !canOpenDeliverables && (
                <div className="rounded-2xl bg-amber-500/8 dark:bg-amber-500/10 border border-amber-500/25 px-4 py-3.5 flex items-start gap-3 text-left">
                  <Lock size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed text-[#475569] dark:text-[#CBD5E1]">
                    Your deposit has been verified and credited. Project deliverables will unlock automatically once the remaining balance of{' '}
                    <strong className="font-mono tabular-nums text-[#0F172A] dark:text-white">
                      {formatCurrency(remainingBalance, currency)}
                    </strong>{' '}
                    is completed.
                  </p>
                </div>
              )}

              {/* Primary & Secondary Actions */}
              <div className="space-y-3 pt-1">
                {canOpenDeliverables ? (
                  <button
                    type="button"
                    disabled={isNavigatingPrimary}
                    onClick={() =>
                      handleNavigatePrimary(
                        `/delivery/secure/${encodeURIComponent(result.deliveryAccessToken!)}`
                      )
                    }
                    className="w-full min-h-[50px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm sm:text-[15px] tracking-[-0.01em] shadow-[0_12px_28px_-6px_var(--cb-cta-shadow)] hover:opacity-95 active:scale-[0.99] disabled:opacity-65 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    {isNavigatingPrimary ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Opening Deliverables...</span>
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        <span>Access Deliverables Now</span>
                      </>
                    )}
                  </button>
                ) : canOpenQuickJobPortal ? (
                  <button
                    type="button"
                    disabled={isNavigatingPrimary}
                    onClick={() =>
                      handleNavigatePrimary(
                        `/quick-jobs/${encodeURIComponent(result.quickJobPortalToken!)}`
                      )
                    }
                    className="w-full min-h-[50px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm sm:text-[15px] tracking-[-0.01em] shadow-[0_12px_28px_-6px_var(--cb-cta-shadow)] hover:opacity-95 active:scale-[0.99] disabled:opacity-65 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    {isNavigatingPrimary ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Opening Deliverables...</span>
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        <span>Access Deliverables Now</span>
                      </>
                    )}
                  </button>
                ) : resolvedToken && !isFullyPaid ? (
                  <button
                    type="button"
                    disabled={isNavigatingPrimary}
                    onClick={() =>
                      handleNavigatePrimary(`/pay/${encodeURIComponent(resolvedToken)}`)
                    }
                    className="w-full min-h-[50px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm sm:text-[15px] tracking-[-0.01em] shadow-[0_12px_28px_-6px_var(--cb-cta-shadow)] hover:opacity-95 active:scale-[0.99] disabled:opacity-65 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <CreditCard size={18} />
                    <span>View Payment Portal</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                  className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#334155] text-[#0F172A] dark:text-[#F1F5F9] font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText size={16} className="text-[#475569] dark:text-[#94A3B8]" />
                  <span>View Payment Receipt</span>
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {/* Payment Still Processing State */}
        {paymentState === 'pending' && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="h-1.5 w-full bg-amber-500" />
            <div className="p-6 sm:p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-[22px] bg-amber-500/12 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                <Clock size={30} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-[#0F172A] dark:text-[#F8FAFC]">
                  Payment Still Processing
                </h2>
                <p className="text-sm leading-relaxed text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                  {statusMessage ||
                    'Your payment is currently being confirmed by the payment provider. Please wait a few seconds and recheck your status.'}
                </p>
              </div>

              {reference && (
                <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] py-2.5 px-4 text-xs font-mono tabular-nums text-[#475569] dark:text-[#94A3B8] break-all">
                  Reference: {reference}
                </div>
              )}

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={isRechecking}
                  onClick={() => runVerification(true)}
                  className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm shadow-[0_10px_24px_-6px_var(--cb-cta-shadow)] hover:opacity-95 disabled:opacity-65 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw size={17} className={isRechecking ? 'animate-spin' : ''} />
                  <span>
                    {isRechecking ? 'Rechecking Payment Status...' : 'Recheck Payment Status'}
                  </span>
                </button>

                {resolvedToken && (
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/${encodeURIComponent(resolvedToken)}`)}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] text-[#334155] dark:text-[#E2E8F0] font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={15} />
                    <span>Return to Payment Page</span>
                  </button>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* Payment Failed / Not Completed State */}
        {paymentState === 'failed' && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="h-1.5 w-full bg-rose-500" />
            <div className="p-6 sm:p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-[22px] bg-rose-500/12 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
                <AlertCircle size={32} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-[#0F172A] dark:text-[#F8FAFC]">
                  Payment Not Completed
                </h2>
                <p className="text-sm leading-relaxed text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                  {statusMessage ||
                    'This transaction could not be completed. No verified payment was recorded against your invoice.'}
                </p>
              </div>

              {reference && (
                <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#0B1120] border border-[#E2E8F0] dark:border-[#1E293B] py-2.5 px-4 text-xs font-mono tabular-nums text-[#475569] dark:text-[#94A3B8] break-all">
                  Reference: {reference}
                </div>
              )}

              <div className="space-y-3 pt-1">
                {resolvedToken && (
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/${encodeURIComponent(resolvedToken)}`)}
                    className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm shadow-[0_10px_24px_-6px_var(--cb-cta-shadow)] hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={18} />
                    <span>Return to Payment Page</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isRechecking}
                  onClick={() => runVerification(true)}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] text-[#334155] dark:text-[#E2E8F0] font-semibold text-xs sm:text-sm disabled:opacity-65 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw size={15} className={isRechecking ? 'animate-spin' : ''} />
                  <span>{isRechecking ? 'Rechecking...' : 'Retry Verification'}</span>
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {/* Invalid or Missing Reference State */}
        {paymentState === 'invalid_reference' && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[28px] bg-[#FFFFFF] dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1F2937] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="h-1.5 w-full bg-slate-400 dark:bg-slate-600" />
            <div className="p-6 sm:p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-[22px] bg-slate-500/10 border border-slate-400/30 flex items-center justify-center mx-auto text-[#475569] dark:text-[#94A3B8]">
                <AlertTriangle size={30} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-[#0F172A] dark:text-[#F8FAFC]">
                  Invalid Payment Reference
                </h2>
                <p className="text-sm leading-relaxed text-[#475569] dark:text-[#94A3B8] max-w-md mx-auto">
                  {statusMessage ||
                    'We could not verify this confirmation page because the payment reference is missing or unrecognized. Please open the payment link sent to your email or WhatsApp.'}
                </p>
              </div>

              {queryToken && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/${encodeURIComponent(queryToken)}`)}
                    className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-[var(--cb-cta-bg)] text-[var(--cb-cta-text)] font-bold text-sm shadow-[0_10px_24px_-6px_var(--cb-cta-shadow)] hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={18} />
                    <span>Return to Payment Page</span>
                  </button>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </main>

      {/* Subtle Trust Footer */}
      <footer className="no-print w-full max-w-[540px] mx-auto pt-6 text-center z-10 space-y-1">
        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center gap-1.5">
          <Lock size={12} className="shrink-0" />
          <span>Payments securely processed and verified via Paystack</span>
        </p>
        <p className="text-[11px] text-[#94A3B8] dark:text-[#64748B]">
          &copy; {new Date().getFullYear()} {palette.businessName}
        </p>
      </footer>
    </div>
  )
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#090D16] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  )
}
