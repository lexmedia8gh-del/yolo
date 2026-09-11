'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Download,
  CreditCard,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency } from '@/lib/utils'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import toast from 'react-hot-toast'

interface VerifyResult {
  status: string
  amount?: number
  currency?: string
  reference?: string
  invoiceNumber?: string
  clientName?: string
  deliveryAccessToken?: string
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { branding } = useBranding()

  const reference = searchParams?.get('reference') || searchParams?.get('trxref') || ''
  const token = searchParams?.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)

  useEffect(() => {
    if (!reference) {
      setErrorMsg('No payment transaction reference found in callback.')
      setLoading(false)
      return
    }

    let isMounted = true

    async function verify() {
      setLoading(true)
      try {
        const queryParams = new URLSearchParams()
        queryParams.set('reference', reference)
        if (token) queryParams.set('token', token)

        const res = await fetch(`/api/paystack/verify?${queryParams.toString()}`)
        const data = await res.json()

        if (!isMounted) return

        if (res.ok && (data.status === 'success' || data.success)) {
          setSuccess(true)
          setResult(data)
          toast.success('Payment verified successfully!')
        } else {
          setErrorMsg(data.error || 'Payment verification could not be completed.')
        }
      } catch (err: any) {
        console.error('Payment callback verification error:', err)
        if (isMounted) {
          setErrorMsg(err.message || 'An unexpected error occurred during payment verification.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    verify()

    return () => {
      isMounted = false
    }
  }, [reference, token])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-indigo-500 selection:text-white">
      {/* Background radial gradient */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />

      <div className="w-full max-w-lg z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 font-medium mb-3">
            <ShieldCheck size={14} className="text-indigo-400" />
            <span>Secure Payment Verification</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            {branding.businessName || 'LexMedia'} Studio
          </h1>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
              <RefreshCw size={28} className="animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Verifying Transaction</h2>
              <p className="text-sm text-slate-400 mt-1">
                Confirming payment with the gateway and updating your deliverables...
              </p>
            </div>
            {reference && (
              <div className="text-xs font-mono text-slate-500 bg-slate-950/60 py-2 px-3 rounded-lg border border-slate-800/80">
                Ref: {reference}
              </div>
            )}
          </div>
        )}

        {/* Success state */}
        {!loading && success && (
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={32} />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Payment Confirmed!</h2>
              <p className="text-sm text-slate-400">
                Thank you. Your transaction has been securely verified and processed.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-left space-y-2.5 text-xs">
              {result?.amount && (
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Amount Paid</span>
                  <span className="font-bold text-emerald-400 text-sm font-mono">
                    {formatCurrency(result.amount, result.currency || 'GHS')}
                  </span>
                </div>
              )}
              {result?.invoiceNumber && (
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Invoice</span>
                  <span className="font-medium text-slate-200">{result.invoiceNumber}</span>
                </div>
              )}
              {reference && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Reference</span>
                  <span className="font-mono text-slate-300 truncate max-w-[200px]">{reference}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              {result?.deliveryAccessToken ? (
                <button
                  onClick={() => router.push(`/delivery/secure/${result.deliveryAccessToken}`)}
                  className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download size={18} />
                  <span>Access Deliverables Now</span>
                </button>
              ) : token ? (
                <button
                  onClick={() => router.push(`/payment/secure/${token}`)}
                  className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard size={18} />
                  <span>View Payment Details</span>
                </button>
              ) : null}

              <button
                onClick={() => router.push('/')}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-300 font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Return to Home</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {!loading && !success && (
          <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle size={32} />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Verification Status</h2>
              <p className="text-sm text-rose-300/90">
                {errorMsg || 'We were unable to confirm this transaction.'}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {token && (
                <button
                  onClick={() => router.push(`/payment/secure/${token}`)}
                  className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard size={18} />
                  <span>Return to Payment Page</span>
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-300 font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Retry Verification</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PaymentCallbackPage() {
  return (
    <BrandingProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
            <Spinner size="lg" className="text-indigo-500" />
          </div>
        }
      >
        <PaymentCallbackContent />
      </Suspense>
    </BrandingProvider>
  )
}
