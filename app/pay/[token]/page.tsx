'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Lock,
  Building2,
  Calendar,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocuments,
  updateDocument,
  addDocument,
} from '@/lib/firebase/firestore'
import type { ClientLink, Invoice } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
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

function PublicPaymentPageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = (params?.token as string) || ''
  const refQuery = searchParams.get('reference')
  const isMockParam = searchParams.get('mock')
  const { branding } = useBranding()

  const [linkData, setLinkData] = useState<ClientLink | null>(null)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)

    async function loadPaymentDetails() {
      try {
        const allLinks = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS)
        const match = allLinks.find((l) => l.token === token)

        if (!match) {
          setErrorMsg('This payment link is invalid or does not exist.')
          setLoading(false)
          return
        }

        setLinkData(match)

        if (match.invoiceId) {
          const allInvoices = await getDocuments<Invoice>(COLLECTIONS.INVOICES)
          const inv = allInvoices.find((i) => i.id === match.invoiceId)
          if (inv) {
            setInvoiceData(inv)
            if (inv.status === 'Paid') {
              setPaymentSuccess(true)
            }
          }
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
  }, [token, refQuery])

  const verifyPaystackTransaction = async (reference: string, link: ClientLink) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`)
      const data = await res.json()

      if (res.ok && data.status === 'success') {
        setPaymentSuccess(true)
        toast.success('Payment verified successfully!')
      } else {
        toast.error(data.error || 'Payment verification failed')
      }
    } catch (err) {
      console.error('Verification error:', err)
      toast.error('An error occurred during verification')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePayNow = async () => {
    if (!linkData) return

    setIsProcessing(true)
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: linkData.token,
          email: linkData.clientName ? `${linkData.clientName.toLowerCase().replace(/\s+/g, '')}@client.com` : 'client@lexmedia.com',
          amount: linkData.amount,
          invoiceNumber: linkData.invoiceNumber,
          clientName: linkData.clientName,
        }),
      })

      const data = await res.json()

      if (data.status && data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        toast.error('Failed to initialize payment gateway')
      }
    } catch (err) {
      console.error('Pay error:', err)
      toast.error('Payment initialization failed. Please try again.')
    } finally {
      setIsProcessing(false)
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
          <ErrorReveal className="w-full max-w-md bg-white p-8 rounded-3xl border border-border shadow-modal text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-danger-50 text-danger-600 flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Request Unavailable</h2>
            <p className="text-sm text-muted leading-relaxed">
              {errorMsg || 'This payment link has expired, been revoked, or is invalid.'}
            </p>
          </ErrorReveal>
        </div>
      </PageEnter>
    )
  }

  const isAlreadyPaid = paymentSuccess || linkData.status === 'Paid' || (invoiceData && invoiceData.status === 'Paid')
  const isCancelled = linkData.status === 'Cancelled'

  return (
    <PageEnter>
      <div className="min-h-screen bg-gray-50/80 flex flex-col justify-between p-4 sm:p-6 font-sans">
        <div className="max-w-xl mx-auto w-full space-y-6 my-auto py-6">

          {/* Branding Header */}
          <SlideUp delay={0.05} className="text-center space-y-2">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.businessName}
                className="h-14 mx-auto object-contain"
              />
            ) : (
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl shadow-md mb-1"
                style={{ backgroundColor: branding.buttonColor || '#0A0A0A' }}
              >
                <Zap size={24} style={{ color: branding.buttonTextColor || '#FFFFFF' }} />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: branding.textColor || '#111827' }}>
              {(branding.businessName || 'LEXMEDIA').toUpperCase()}
            </h1>
            <p className="text-xs uppercase font-semibold tracking-wider" style={{ color: branding.mutedTextColor || '#6B7280' }}>
              Official Payment Portal
            </p>
          </SlideUp>

          {/* Card Body */}
          <CardReveal delay={0.12}>
            <Card className="p-6 sm:p-8 space-y-6 shadow-modal border-border bg-white rounded-3xl">
              {isCancelled ? (
                <ErrorReveal className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">Link Cancelled</h3>
                  <p className="text-sm text-muted">This payment link has been revoked by Lexmedia admin.</p>
                </ErrorReveal>
              ) : isAlreadyPaid ? (
                <SuccessReveal className="text-center py-6 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-success-50 text-success-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={36} />
                  </div>
                  <Badge variant="success" size="md">
                    Payment Complete
                  </Badge>
                  <h2 className="text-2xl font-bold text-gray-900 mt-2">Thank You!</h2>
                  <p className="text-sm text-muted max-w-sm mx-auto">
                    Payment for invoice <span className="font-semibold text-gray-900">{linkData.invoiceNumber}</span> has been completed successfully.
                  </p>
                  <div className="pt-4 text-xs text-muted border-t border-border">
                    Transaction Ref: <code className="font-mono text-gray-700">{refQuery || 'Verified'}</code>
                  </div>
                </SuccessReveal>
              ) : (
                <StaggerContainer delayStart={0.05} className="space-y-6">

                  {/* Client / Invoice header */}
                  <StaggerItem>
                    <div className="flex items-center justify-between border-b border-border pb-4">
                      <div>
                        <p className="text-xs text-muted">Billed To</p>
                        <p className="text-lg font-bold text-gray-900">{linkData.clientName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">Invoice Number</p>
                        <p className="font-mono font-bold text-accent-700">{linkData.invoiceNumber || 'LXM-INV'}</p>
                      </div>
                    </div>
                  </StaggerItem>

                  {/* Service/Package Item Summary */}
                  {invoiceData && invoiceData.items && invoiceData.items.length > 0 && (
                    <StaggerItem>
                      <div className="bg-gray-50 rounded-2xl p-4 border border-border space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Services / Package Details</p>
                        {invoiceData.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-start text-sm">
                            <div>
                              <p className="font-semibold text-gray-900">{item.description}</p>
                              <p className="text-xs text-muted">Qty: {item.quantity}</p>
                            </div>
                            <p className="font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    </StaggerItem>
                  )}

                  {/* Amount Box */}
                  <StaggerItem>
                    <div className="bg-accent-50/50 p-6 rounded-2xl border border-accent-100 text-center space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-accent-800">Amount Due</p>
                      <p className="text-3xl font-black text-accent-900">
                        {formatCurrency(linkData.amount || 0)}
                      </p>
                      {invoiceData?.dueDate && (
                        <p className="text-xs text-muted pt-1">
                          Due Date: {formatDate(invoiceData.dueDate)}
                        </p>
                      )}
                    </div>
                  </StaggerItem>

                  {/* Pay Now Button */}
                  <StaggerItem>
                    <Button
                      onClick={handlePayNow}
                      variant="primary"
                      fullWidth
                      size="lg"
                      loading={isProcessing}
                      className="py-4 text-base font-bold shadow-lg"
                      icon={<CreditCard size={20} />}
                    >
                      Pay Now ({formatCurrency(linkData.amount || 0)})
                    </Button>
                  </StaggerItem>

                  {/* Security notice */}
                  <StaggerItem>
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                      <ShieldCheck size={14} className="text-success-600" />
                      <span>Secured with Paystack 256-bit SSL encryption</span>
                    </div>
                  </StaggerItem>

                </StaggerContainer>
              )}
            </Card>
          </CardReveal>
        </div>

        {/* Footer */}
        <FadeIn delay={0.3}>
          <footer className="text-center py-4 text-xs" style={{ color: branding.mutedTextColor || '#6B7280' }}>
            © {new Date().getFullYear()} {branding.businessName || 'Lexmedia Agency'}. All rights reserved.
          </footer>
        </FadeIn>
      </div>
    </PageEnter>
  )
}

export default function PublicPaymentPage() {
  return (
    <BrandingProvider>
      <PublicPaymentPageInner />
    </BrandingProvider>
  )
}
