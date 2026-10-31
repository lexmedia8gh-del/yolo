'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useId, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Lock,
  Building2,
  FileText,
  Clock,
  ShieldCheck,
  Printer,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
} from '@/lib/firebase/firestore'
import type { ClientLink, Invoice, BrandingSettings } from '@/lib/types'
import { formatCurrency, formatDateTime, fetchWithTimeout, formatActionError } from '@/lib/utils'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { resolveBrandLogoCandidates, resolveBrandPalette } from '@/lib/branding/payment-theme'
import toast from 'react-hot-toast'
import {
  PageEnter,
  FadeIn,
  SlideUp,
  CardReveal,
  StaggerContainer,
  StaggerItem,
  SuccessReveal,
  ErrorReveal,
  PulseIcon,
} from '@/lib/motion'

function PortalBrandMark({
  logoCandidates,
  businessName,
}: {
  logoCandidates: string[]
  businessName: string
}) {
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const activeUrl = logoCandidates.find((u) => !failed[u]) || ''
  if (!activeUrl) return null
  return (
    <img
      src={activeUrl}
      alt={`${businessName} logo`}
      referrerPolicy="no-referrer"
      onError={() => setFailed((prev) => ({ ...prev, [activeUrl]: true }))}
      className="max-h-12 w-auto max-w-[190px] mx-auto object-contain select-none"
    />
  )
}

function PublicPaymentPageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = (params?.token as string) || ''
  const refQuery = searchParams?.get('reference')
  const { branding: contextBranding } = useBranding()
  const scopeId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [liveBrandingOverride, setLiveBrandingOverride] = useState<Partial<BrandingSettings> | null>(null)

  // Fetch latest branding from /api/branding so Settings -> Branding changes take immediate effect
  useEffect(() => {
    let active = true
    fetch('/api/branding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (active && payload?.success && payload.branding) {
          setLiveBrandingOverride(payload.branding)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const effectiveBranding = useMemo<BrandingSettings>(
    () => ({
      ...contextBranding,
      ...(liveBrandingOverride || {}),
    }),
    [contextBranding, liveBrandingOverride]
  )

  const palette = useMemo(() => resolveBrandPalette(effectiveBranding), [effectiveBranding])
  const logoCandidates = useMemo(() => resolveBrandLogoCandidates(effectiveBranding, 'light'), [effectiveBranding])

  const scopedPayCss = useMemo(
    () => `
      [data-pay-scope="${scopeId}"] {
        --pay-primary: ${palette.primaryColor};
        --pay-secondary: ${palette.secondaryColor};
        --pay-accent: ${palette.accentColor};
        --pay-cta-bg: ${palette.ctaBg};
        --pay-cta-text: ${palette.ctaText};
        --pay-cta-shadow: ${palette.ctaShadow};
      }
    `,
    [scopeId, palette]
  )

  const [linkData, setLinkData] = useState<ClientLink | null>(null)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)
  const [quickJobData, setQuickJobData] = useState<any>(null)
  const [projectData, setProjectData] = useState<any>(null)
  const [lastPayment, setLastPayment] = useState<{
    reference: string
    receiptNumber: string
    amount: number
    currency: string
    paidAt: string | null
    channel: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [verifiedAmount, setVerifiedAmount] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [deliveryAccessToken, setDeliveryAccessToken] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)

    async function loadPaymentDetails() {
      try {
        // 1. Try server API first (bypasses client security rule restrictions and guarantees invoice lookup)
        const res = await fetch(`/api/pay/${encodeURIComponent(token)}`)
        if (res.ok) {
          const apiData = await res.json()
          if (apiData?.success && apiData.link) {
            setLinkData(apiData.link)
            if (apiData.invoice) {
              setInvoiceData(apiData.invoice)
            }
            if (apiData.quickJob) {
              setQuickJobData(apiData.quickJob)
            }
            if (apiData.project) {
              setProjectData(apiData.project)
            }
            if (apiData.lastPayment) {
              setLastPayment(apiData.lastPayment)
            }
            if (apiData.isAlreadyPaid) {
              setPaymentSuccess(true)
            }
            if (apiData.deliveryAccessToken) {
              setDeliveryAccessToken(apiData.deliveryAccessToken)
            }

            if (refQuery) {
              await verifyPaystackTransaction(refQuery, apiData.link)
            }
            setLoading(false)
            return
          }
        }

        // 2. Client-side fallback if server API is unreachable or returned 404
        const allLinks = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS)
        const match = allLinks.find((l) => l.token === token || l.id === token)

        if (!match) {
          setErrorMsg('This payment link is invalid or does not exist.')
          setLoading(false)
          return
        }

        setLinkData(match)
        if (match.status === 'Paid' || match.paymentStatus === 'Paid') {
          setPaymentSuccess(true)
        }

        // Safe invoice lookup: do not throw or crash if invoice is restricted
        if (match.invoiceId) {
          try {
            const allInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
            const inv = allInvoices.find((i) => i.id === match.invoiceId)
            if (inv) {
              setInvoiceData(inv)
              if (inv.status === 'Paid') {
                setPaymentSuccess(true)
              }
            }
          } catch {
            // Unauthenticated users cannot read invoices directly; ignore gracefully
          }
        }

        // Safe quickJob lookup
        if (match.quickJobId) {
          try {
            const allJobs = await getDocuments<any>(COLLECTIONS.QUICK_JOBS)
            const qj = allJobs.find((j) => j.id === match.quickJobId)
            if (qj) {
              setQuickJobData(qj)
              if (qj.paymentStatus === 'Paid' || (qj.outstandingBalance !== undefined && qj.outstandingBalance <= 0)) {
                setPaymentSuccess(true)
              }
            }
          } catch {}
        }

        // Safe project lookup
        if (match.projectId) {
          try {
            const allProjects = await getDocuments<any>(COLLECTIONS.PROJECTS)
            const proj = allProjects.find((p) => p.id === match.projectId)
            if (proj) {
              setProjectData(proj)
              if (proj.paymentStatus === 'Paid' || (proj.outstandingBalance !== undefined && proj.outstandingBalance <= 0)) {
                setPaymentSuccess(true)
              }
            }
          } catch {}
        }

        if (refQuery) {
          await verifyPaystackTransaction(refQuery, match)
        }
      } catch (err) {
        console.error('Error fetching public payment link:', err)
        setErrorMsg('Failed to load payment request details.')
      } finally {
        setLoading(false)
      }
    }

    loadPaymentDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refQuery])

  const verifyPaystackTransaction = async (reference: string, _link: ClientLink) => {
    setIsProcessing(true)
    try {
      const res = await fetchWithTimeout(
        `/api/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`,
        { timeoutMs: 15000 }
      )
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.status === 'success') {
        setPaymentSuccess(true)
        if (data.amount) {
          setVerifiedAmount(data.amount)
        }
        toast.success('Payment verified successfully!')

        // Fetch latest updated client/payment data before rendering Thank You page
        const refreshRes = await fetchWithTimeout(`/api/pay/${encodeURIComponent(token)}`, {
          timeoutMs: 12000,
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json().catch(() => ({}))
          if (refreshData?.success && refreshData.link) {
            setLinkData(refreshData.link)
            if (refreshData.invoice) {
              setInvoiceData(refreshData.invoice)
            }
            if (refreshData.lastPayment) {
              setLastPayment(refreshData.lastPayment)
            }
            if (refreshData.deliveryAccessToken) {
              setDeliveryAccessToken(refreshData.deliveryAccessToken)
            }
          }
        }
      } else {
        toast.error(data.error || 'Payment verification failed')
      }
    } catch (err) {
      console.error('Verification error:', err)
      toast.error(formatActionError(err, 'An error occurred during verification'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePayNow = async () => {
    if (!linkData || isProcessing) return

    setIsProcessing(true)
    let redirecting = false
    try {
      const res = await fetchWithTimeout('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: linkData.token,
          email: linkData.clientName
            ? `${linkData.clientName.toLowerCase().replace(/\s+/g, '')}@client.com`
            : 'client@lexmedia.com',
          amount: linkData.amount,
          invoiceNumber: linkData.invoiceNumber,
          clientName: linkData.clientName,
        }),
        timeoutMs: 15000,
      })

      const data = await res.json().catch(() => ({}))

      if (data.status && data.authorization_url) {
        redirecting = true
        window.location.href = data.authorization_url
      } else {
        toast.error(data.error || 'Failed to initialize payment gateway')
      }
    } catch (err) {
      console.error('Pay error:', err)
      toast.error(formatActionError(err, 'Payment initialization failed. Please try again.'))
    } finally {
      if (!redirecting) {
        setIsProcessing(false)
      } else {
        window.setTimeout(() => setIsProcessing(false), 8000)
      }
    }
  }

  // ── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <FadeIn className="text-center space-y-4">
            <PulseIcon className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto">
              <CreditCard size={24} className="text-blue-500" />
            </PulseIcon>
            <p className="text-sm text-gray-500 font-medium">Securing payment request details...</p>
          </FadeIn>
        </div>
      </PageEnter>
    )
  }

  // ── Error State ────────────────────────────────────────────────────────────
  if (errorMsg || !linkData) {
    return (
      <PageEnter>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <ErrorReveal className="w-full max-w-md bg-white p-8 rounded-3xl border border-gray-200 shadow-lg text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Request Unavailable</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {errorMsg || 'This payment link has expired, been revoked, or is invalid.'}
            </p>
          </ErrorReveal>
        </div>
      </PageEnter>
    )
  }

  const isAlreadyPaid =
    paymentSuccess ||
    linkData.status === 'Paid' ||
    linkData.paymentStatus === 'Paid' ||
    (invoiceData && invoiceData.status === 'Paid') ||
    (projectData && (projectData.paymentStatus === 'Paid' || (projectData.outstandingBalance !== undefined && projectData.outstandingBalance <= 0)))

  const isCancelled = linkData.status === 'Cancelled'
  const isExpired =
    linkData.status === 'Expired' ||
    (linkData.expiresAt ? new Date(linkData.expiresAt as string).getTime() < Date.now() : false)

  const isQuickJob = !!quickJobData || !!linkData.quickJobId
  const isProject = !isQuickJob && (!!projectData || !!linkData.projectId)

  const originalTotal = isQuickJob
    ? Number(quickJobData?.originalAgreedPrice || 0)
    : isProject
    ? Number(projectData?.price || linkData.amount || 0)
    : (invoiceData?.total || linkData.amount || 0)

  const paymentReceivedAmount = verifiedAmount || linkData.amount || 0

  const totalPaid = isQuickJob
    ? Number(quickJobData?.amountPaid || 0) + (paymentSuccess ? paymentReceivedAmount : 0)
    : isProject
    ? Number(projectData?.amountPaid || 0) + (paymentSuccess ? paymentReceivedAmount : 0)
    : (invoiceData?.amountPaid ?? (isAlreadyPaid ? originalTotal : paymentReceivedAmount))

  const remainingBalance = isQuickJob
    ? Math.max(0, originalTotal - totalPaid)
    : isProject
    ? Math.max(0, (projectData?.outstandingBalance !== undefined ? Number(projectData.outstandingBalance) : originalTotal) - (paymentSuccess ? paymentReceivedAmount : 0))
    : (invoiceData?.balanceDue ?? Math.max(0, originalTotal - totalPaid))

  const isFullyPaid = remainingBalance <= 0 || invoiceData?.status === 'Paid' || linkData.status === 'Paid' || projectData?.paymentStatus === 'Paid'

  if (isAlreadyPaid || paymentSuccess) {
    const activeReference = lastPayment?.reference || (linkData as any).paystackReference || refQuery || ''
    const activePaidAt = lastPayment?.paidAt || null

    return (
      <PageEnter>
        <div
          data-pay-scope={scopeId}
          className="min-h-screen bg-gray-50/80 flex flex-col justify-between p-4 sm:p-6 font-sans"
        >
          <style dangerouslySetInnerHTML={{ __html: scopedPayCss }} />
          <div className="max-w-xl mx-auto w-full space-y-6 my-auto py-6">
            {/* Branding Header */}
            <SlideUp delay={0.05} className="text-center space-y-2">
              <PortalBrandMark
                logoCandidates={logoCandidates}
                businessName={palette.businessName}
              />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                {palette.businessName}
              </h1>
              <p className="text-xs uppercase font-semibold tracking-wider text-gray-500">
                Official Payment Receipt
              </p>
            </SlideUp>

            {/* Dedicated Confirmation & Receipt Card */}
            <CardReveal delay={0.12}>
              <Card className="invoice-paper-sheet border border-gray-200/85 shadow-xl shadow-emerald-500/5 rounded-3xl overflow-hidden bg-white">
                <div className="p-6 sm:p-8 space-y-6 text-center">
                  {/* Success Icon */}
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 size={32} />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                      {isFullyPaid ? 'Payment Confirmed!' : 'Payment Received!'}
                    </h2>
                    <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
                      {isFullyPaid
                        ? 'Thank you for your payment. Your transaction has been securely verified and processed.'
                        : 'Your payment has been securely verified and credited to your account.'}
                    </p>
                  </div>

                  {/* Verified Receipt Information */}
                  <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200/70 text-left space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                      <span className="text-gray-500 font-medium">Client</span>
                      <span className="font-bold text-gray-900 text-right break-words">
                        {linkData.clientName || projectData?.clientName || quickJobData?.clientName || invoiceData?.clientName || 'Valued Client'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                      <span className="text-gray-500 font-medium">{isQuickJob ? 'Job Description' : isProject ? 'Project' : 'Project / Service'}</span>
                      <span className="font-semibold text-gray-900 text-right break-words max-w-[65%]">
                        {projectData?.name || quickJobData?.jobDescription || linkData.projectName || invoiceData?.projectName || linkData.title || 'Professional Service'}
                      </span>
                    </div>

                    {(linkData.invoiceNumber || invoiceData?.invoiceNumber) && (
                      <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                        <span className="text-gray-500 font-medium">Invoice Number</span>
                        <span className="font-mono tabular-nums font-bold text-gray-900 text-right">
                          {linkData.invoiceNumber || invoiceData?.invoiceNumber}
                        </span>
                      </div>
                    )}

                    {activeReference && (
                      <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                        <span className="text-gray-500 font-medium shrink-0">Payment Reference</span>
                        <span className="font-mono tabular-nums font-semibold text-gray-900 text-right break-all text-xs sm:text-sm">
                          {activeReference}
                        </span>
                      </div>
                    )}

                    {activePaidAt && (
                      <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                        <span className="text-gray-500 font-medium">Payment Date</span>
                        <span className="font-semibold tabular-nums text-gray-900 text-right text-xs sm:text-sm">
                          {formatDateTime(activePaidAt)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                      <span className="text-gray-500 font-medium">Amount Paid</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-600">
                        {formatCurrency(lastPayment?.amount || paymentReceivedAmount, linkData.currency || projectData?.currency || invoiceData?.currency || quickJobData?.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                      <span className="text-gray-500 font-medium">{isQuickJob ? 'Original Job Total' : isProject ? 'Original Project Price' : 'Invoice Total'}</span>
                      <span className="font-mono tabular-nums font-semibold text-gray-900">
                        {formatCurrency(originalTotal, linkData.currency || projectData?.currency || invoiceData?.currency || quickJobData?.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-gray-200/65">
                      <span className="text-gray-500 font-medium">Total Paid to Date</span>
                      <span className="font-mono tabular-nums font-semibold text-gray-900">
                        {formatCurrency(totalPaid, linkData.currency || projectData?.currency || invoiceData?.currency || quickJobData?.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-sm py-2 font-bold pt-1">
                      <span className="text-gray-800">Remaining Balance</span>
                      <span className="font-mono tabular-nums text-gray-900 text-base">
                        {formatCurrency(remainingBalance, linkData.currency || projectData?.currency || invoiceData?.currency || quickJobData?.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Security Verification Line */}
                  <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 bg-emerald-50/80 py-2.5 px-4 rounded-xl border border-emerald-200">
                    <ShieldCheck size={16} /> Verified & Secured by Paystack
                  </div>

                  <div className="no-print space-y-2.5 pt-1">
                    {isFullyPaid && deliveryAccessToken && (
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = `/delivery/secure/${encodeURIComponent(deliveryAccessToken)}`
                        }}
                        className="w-full min-h-[48px] py-3.5 px-5 text-sm sm:text-base font-bold bg-[var(--pay-cta-bg)] text-[var(--pay-cta-text)] hover:opacity-95 rounded-xl transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FileText className="w-5 h-5" />
                        <span>Access Deliverables Now</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="w-full min-h-[44px] py-2.5 px-4 text-xs sm:text-sm font-semibold border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Printer size={15} />
                      <span>Print / Save Receipt</span>
                    </button>
                  </div>
                </div>
              </Card>
            </CardReveal>

            {/* Bottom Branding Footer */}
            <FadeIn delay={0.25} className="no-print text-center">
              <p className="text-xs text-gray-400">
                &copy; {new Date().getFullYear()} {palette.businessName}. All rights reserved.
              </p>
            </FadeIn>
          </div>
        </div>
      </PageEnter>
    )
  }

  return (
    <PageEnter>
      <div
        data-pay-scope={scopeId}
        className="min-h-screen bg-gray-50/80 flex flex-col justify-between p-4 sm:p-6 font-sans"
      >
        <style dangerouslySetInnerHTML={{ __html: scopedPayCss }} />
        <div className="max-w-xl mx-auto w-full space-y-6 my-auto py-6">

          {/* Branding Header */}
          <SlideUp delay={0.05} className="text-center space-y-2">
            <PortalBrandMark
              logoCandidates={logoCandidates}
              businessName={palette.businessName}
            />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {palette.businessName}
            </h1>
            <p className="text-xs uppercase font-semibold tracking-wider text-gray-500">
              Official Payment Portal
            </p>
          </SlideUp>

          {/* Card Body */}
          <CardReveal delay={0.12}>
            <Card className="border border-gray-200/80 shadow-xl shadow-gray-200/40 rounded-3xl overflow-hidden bg-white">
              <div className="p-6 sm:p-8 space-y-6">

                {/* Amount Header Banner */}
                <div className="text-center p-6 rounded-2xl bg-gradient-to-b from-gray-50 to-white border border-gray-100 space-y-1.5 shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    {isAlreadyPaid ? 'Amount Paid' : (isQuickJob || isProject) ? 'Amount Due for This Payment' : 'Total Amount Due'}
                  </span>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight text-[var(--pay-cta-bg)] font-mono">
                    {formatCurrency(linkData.amount || invoiceData?.balanceDue || 0, linkData.currency || invoiceData?.currency)}
                  </div>
                  <div className="pt-2 flex justify-center">
                    {isAlreadyPaid ? (
                      <Badge variant="success" className="px-3.5 py-1 font-semibold text-xs gap-1.5 shadow-sm">
                        <CheckCircle2 size={13} className="text-emerald-500" /> Payment Complete
                      </Badge>
                    ) : isCancelled ? (
                      <Badge variant="danger" className="px-3.5 py-1 font-semibold text-xs">
                        Cancelled
                      </Badge>
                    ) : isExpired ? (
                      <Badge variant="danger" className="px-3.5 py-1 font-semibold text-xs">
                        Expired
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="px-3.5 py-1 font-semibold text-xs gap-1.5 shadow-sm">
                        <Clock size={13} /> Awaiting Secure Payment
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Project Financial Breakdown (Requirement 3) */}
                {isProject && projectData && (
                  <div className="bg-slate-50/90 rounded-2xl p-5 border border-gray-200/80 space-y-3 text-xs sm:text-sm">
                    <div className="flex items-start justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                      <span className="text-gray-500">Project</span>
                      <span className="font-semibold text-gray-900 text-right max-w-[260px]">
                        {projectData.name || linkData.projectName || 'Project'}
                      </span>
                    </div>
                    {(projectData.serviceName || projectData.packageTitle) && (
                      <div className="flex items-start justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                        <span className="text-gray-500">Service / Package</span>
                        <span className="font-semibold text-gray-900 text-right max-w-[260px]">
                          {[projectData.serviceName, projectData.packageTitle].filter(Boolean).join(' • ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                      <span className="text-gray-500">Original Project Total</span>
                      <span className="font-mono font-bold text-gray-900">
                        {formatCurrency(projectData.price, linkData.currency || projectData.currency)}
                      </span>
                    </div>
                    {Number(projectData.amountPaid || 0) > 0 && (
                      <div className="flex items-center justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                        <span className="text-gray-500">Previously Paid Amount</span>
                        <span className="font-mono font-semibold text-emerald-600">
                          {formatCurrency(projectData.amountPaid || 0, linkData.currency || projectData.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-bold text-gray-900 pb-2 border-b border-gray-200/60">
                      <span className="text-[var(--pay-cta-bg)] font-semibold">Amount Due for This Payment</span>
                      <span className="font-mono text-[var(--pay-cta-bg)] text-base font-extrabold">
                        {formatCurrency(linkData.amount || 0, linkData.currency || projectData.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700 font-medium pt-0.5">
                      <span className="text-gray-500">Remaining Balance After Payment</span>
                      <span className="font-mono font-bold text-gray-900">
                        {formatCurrency(
                          Math.max(
                            0,
                            (projectData.outstandingBalance !== undefined
                              ? Number(projectData.outstandingBalance)
                              : Number(projectData.price || 0) - Number(projectData.amountPaid || 0)) -
                              Number(linkData.amount || 0)
                          ),
                          linkData.currency || projectData.currency
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Quick Job Financial Breakdown (Specification Requirement 3) */}
                {isQuickJob && quickJobData && (
                  <div className="bg-slate-50/90 rounded-2xl p-5 border border-gray-200/80 space-y-3 text-xs sm:text-sm">
                    <div className="flex items-start justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                      <span className="text-gray-500">Job Description</span>
                      <span className="font-semibold text-gray-900 text-right max-w-[260px]">
                        {quickJobData.jobDescription || linkData.title || 'Quick Job'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                      <span className="text-gray-500">Original Job Total</span>
                      <span className="font-mono font-bold text-gray-900">
                        {formatCurrency(quickJobData.originalAgreedPrice, linkData.currency || quickJobData.currency)}
                      </span>
                    </div>
                    {Number(quickJobData.amountPaid || 0) > 0 && (
                      <div className="flex items-center justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                        <span className="text-gray-500">Previously Paid Amount</span>
                        <span className="font-mono font-semibold text-emerald-600">
                          {formatCurrency(quickJobData.amountPaid || 0, linkData.currency || quickJobData.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-bold text-gray-900 pb-2 border-b border-gray-200/60">
                      <span className="text-[var(--pay-cta-bg)] font-semibold">Amount Due for This Payment</span>
                      <span className="font-mono text-[var(--pay-cta-bg)] text-base font-extrabold">
                        {formatCurrency(linkData.amount || 0, linkData.currency || quickJobData.currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-700 font-medium pt-0.5">
                      <span className="text-gray-500">Remaining Balance After Payment</span>
                      <span className="font-mono font-bold text-gray-900">
                        {formatCurrency(
                          Math.max(
                            0,
                            (quickJobData.outstandingBalance !== undefined
                              ? quickJobData.outstandingBalance
                              : Number(quickJobData.originalAgreedPrice || 0) - Number(quickJobData.amountPaid || 0)) -
                              Number(linkData.amount || 0)
                          ),
                          linkData.currency || quickJobData.currency
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Invoice Financial Breakdown (if invoice data exists and not quick job and not project) */}
                {invoiceData && !isQuickJob && !isProject && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-gray-200/60 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-gray-600 font-medium pb-2 border-b border-gray-200/60">
                      <span>Invoice Total</span>
                      <span className="font-mono font-bold text-gray-900">{formatCurrency(invoiceData.total, invoiceData.currency)}</span>
                    </div>
                    {(invoiceData.amountPaid ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-gray-600 font-medium">
                        <span>Already Paid</span>
                        <span className="font-mono font-semibold text-emerald-600">-{formatCurrency(invoiceData.amountPaid || 0, invoiceData.currency)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-gray-900 font-bold pt-1 border-t border-gray-200/60 text-sm">
                      <span>Remaining Balance Due</span>
                      <span className="font-mono text-[var(--pay-cta-bg)] font-extrabold">{formatCurrency(invoiceData.balanceDue ?? invoiceData.total, invoiceData.currency)}</span>
                    </div>
                  </div>
                )}

                {/* Summary Metadata */}
                <StaggerContainer delayStart={0.18} className="space-y-3 pt-1">
                  {(linkData.clientName || projectData?.clientName || quickJobData?.clientName || invoiceData?.clientName) && (
                    <StaggerItem>
                      <div className="flex items-center justify-between text-sm py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 flex items-center gap-2">
                          <Building2 size={16} className="text-gray-400" /> Client
                        </span>
                        <span className="font-semibold text-gray-900 text-right">{linkData.clientName || projectData?.clientName || quickJobData?.clientName || invoiceData?.clientName || 'Valued Client'}</span>
                      </div>
                    </StaggerItem>
                  )}

                  {(linkData.projectName || projectData?.name || quickJobData?.jobDescription || invoiceData?.projectName) && (
                    <StaggerItem>
                      <div className="flex items-center justify-between text-sm py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 flex items-center gap-2">
                          <FileText size={16} className="text-gray-400" /> {isQuickJob ? 'Job Description' : 'Project'}
                        </span>
                        <span className="font-semibold text-gray-900 text-right">{projectData?.name || quickJobData?.jobDescription || linkData.projectName || invoiceData?.projectName}</span>
                      </div>
                    </StaggerItem>
                  )}

                  {(linkData.invoiceNumber || invoiceData?.invoiceNumber) && (
                    <StaggerItem>
                      <div className="flex items-center justify-between text-sm py-2.5 border-b border-gray-100">
                        <span className="text-gray-500 flex items-center gap-2">
                          <FileText size={16} className="text-gray-400" /> Invoice Reference
                        </span>
                        <span className="font-mono font-bold text-gray-900">{linkData.invoiceNumber || invoiceData?.invoiceNumber}</span>
                      </div>
                    </StaggerItem>
                  )}

                  <StaggerItem>
                    <div className="flex items-center justify-between text-sm py-2">
                      <span className="text-gray-500 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-emerald-500" /> Payment Security
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        256-Bit SSL Encrypted
                      </span>
                    </div>
                  </StaggerItem>
                </StaggerContainer>

                {/* Primary Action Button */}
                <div className="pt-2">
                  {isAlreadyPaid ? (
                    <SuccessReveal className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-1">
                        <CheckCircle2 size={22} />
                      </div>
                      <h3 className="font-bold text-emerald-900 text-base">Payment Confirmed</h3>
                      <p className="text-xs text-emerald-700 leading-relaxed max-w-sm mx-auto">
                        Thank you! This payment has been successfully received and recorded. Your project team has been notified.
                      </p>
                    </SuccessReveal>
                  ) : isCancelled ? (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center text-sm text-gray-500 font-medium">
                      This payment link is no longer accepting payments.
                    </div>
                  ) : isExpired ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center text-sm text-amber-700 font-medium">
                      This payment link has expired and can no longer be used.
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full h-14 rounded-2xl font-bold text-base shadow-lg transition-transform active:scale-[0.99] flex items-center justify-center gap-2 bg-[var(--pay-cta-bg)] text-[var(--pay-cta-text)] hover:opacity-95"
                      icon={<Lock size={18} />}
                      loading={isProcessing}
                      loadingText="Connecting to Paystack..."
                      onClick={handlePayNow}
                    >
                      Proceed to Pay {formatCurrency(linkData.amount || invoiceData?.balanceDue || 0, linkData.currency || invoiceData?.currency)}
                    </Button>
                  )}
                </div>

                {/* Trust Footer Notice */}
                <div className="text-center pt-2">
                  <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
                    <Lock size={12} />
                    Transactions are processed securely by Paystack. Card details are never stored.
                  </p>
                </div>

              </div>
            </Card>
          </CardReveal>

          {/* Bottom Branding Footer */}
          <FadeIn delay={0.25} className="text-center">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} {palette.businessName}. All rights reserved.
            </p>
          </FadeIn>

        </div>
      </div>
    </PageEnter>
  )
}

export default function PublicPaymentPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#090D16] flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <PublicPaymentPageInner />
    </React.Suspense>
  )
}
