'use client'

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  CreditCard,
  FolderKanban,
  Layers,
  ShieldCheck,
  KeyRound,
  Mail,
  Phone,
} from 'lucide-react'
import { BrandingProvider, useBranding } from '@/lib/contexts/BrandingContext'
import { formatCurrency } from '@/lib/utils'

interface PortalItem {
  id: string
  projectName: string
  status: string
  accessToken: string
  fileCount: number
}

interface PaymentLinkItem {
  id: string
  title: string
  amount: number
  currency: string
  token: string
  status: string
}

function GeneralClientPortalContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { branding } = useBranding()

  const clientParam = searchParams?.get('client') || ''
  const nameParam = searchParams?.get('name') || ''

  const [loading, setLoading] = useState(Boolean(clientParam))
  const [clientName, setClientName] = useState(nameParam || 'Valued Client')
  const [portals, setPortals] = useState<PortalItem[]>([])
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkItem[]>([])
  const [businessContact, setBusinessContact] = useState<{ email?: string; phone?: string } | null>(
    null
  )
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [lookupError, setLookupError] = useState('')

  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((d) => {
        if (d?.business) {
          setBusinessContact({
            email: d.business.email || d.business.supportEmail,
            phone: d.business.phone || d.business.supportPhone,
          })
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientParam) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    fetch(
      `/api/delivery/portal?client=${encodeURIComponent(clientParam)}&name=${encodeURIComponent(nameParam)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        if (data?.clientName) setClientName(data.clientName)
        if (Array.isArray(data?.portals)) setPortals(data.portals)
        if (Array.isArray(data?.paymentLinks)) setPaymentLinks(data.paymentLinks)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [clientParam, nameParam])

  const handleOpenCode = (e: React.FormEvent) => {
    e.preventDefault()
    setLookupError('')
    const raw = accessCodeInput.trim()
    if (!raw) {
      setLookupError('Enter your project delivery link or access token.')
      return
    }

    // Extract path if user pasted a full URL
    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const parsed = new URL(raw)
        if (
          parsed.pathname.startsWith('/delivery/') ||
          parsed.pathname.startsWith('/pay/') ||
          parsed.pathname.startsWith('/client-preview/')
        ) {
          router.push(`${parsed.pathname}${parsed.search}`)
          return
        }
      }
    } catch {
      // Treat as bare token
    }

    const cleanToken = raw.replace(/^\/+/, '')
    if (cleanToken.startsWith('pay/')) {
      router.push(`/${cleanToken}`)
      return
    }
    router.push(`/delivery/${encodeURIComponent(cleanToken)}`)
  }

  const brandName = branding.businessName || 'LEXMEDIA.GH'
  const logoSrc = branding.logoLightUrl || branding.logoUrl
  const accentBg = branding.buttonColor || branding.accentColor || '#1D63ED'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={brandName}
                className="h-8 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: accentBg }}
              >
                {(branding.shortName || brandName || 'LM').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <span className="font-bold tracking-tight text-white text-base">{brandName}</span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono ml-2.5 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">
                Client Portal
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={13} />
            Secure Client Access
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full flex-1 space-y-8">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Layers size={14} />
            <span>{brandName} Client Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Welcome, {clientName}
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Access your active project portals, review deliverables, and manage project payments securely from one place.
          </p>
        </section>

        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
            Loading your active portals...
          </div>
        ) : (
          <>
            {portals.length > 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <FolderKanban size={16} className="text-blue-400" />
                    <span>Your Active Project Portals</span>
                  </h2>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {portals.length} project{portals.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="divide-y divide-slate-800">
                  {portals.map((p) => (
                    <div
                      key={p.id}
                      className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-white text-sm">{p.projectName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Status: <span className="text-slate-300 font-medium">{p.status}</span>
                          {p.fileCount > 0 ? ` · ${p.fileCount} deliverable file(s)` : ''}
                        </p>
                      </div>
                      <Link
                        href={`/delivery/${encodeURIComponent(p.accessToken)}`}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 shrink-0"
                        style={{ backgroundColor: accentBg }}
                      >
                        <span>Open Project Portal</span>
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {paymentLinks.length > 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <CreditCard size={16} className="text-emerald-400" />
                  <span>Invoices & Payment Links</span>
                </h2>
                <div className="divide-y divide-slate-800">
                  {paymentLinks.map((item) => (
                    <div
                      key={item.id}
                      className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-white text-sm">{item.title}</p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                          {formatCurrency(item.amount, item.currency)} · {item.status}
                        </p>
                      </div>
                      <Link
                        href={`/pay/${encodeURIComponent(item.token)}`}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition-colors shrink-0"
                      >
                        <span>View Invoice</span>
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {portals.length === 0 && paymentLinks.length === 0 && (
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                <h2 className="text-base font-semibold text-white">No Active Project Deliverables Yet</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your client profile is active. As soon as a new project, proof preview, or deliverable link is assigned to you, you will receive a direct notification link by email or SMS.
                </p>
              </section>
            )}
          </>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound size={16} className="text-blue-400" />
            <span>Have a Direct Delivery or Payment Token?</span>
          </div>
          <form onSubmit={handleOpenCode} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              placeholder="Paste your access token or portal link..."
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white inline-flex items-center justify-center gap-2 cursor-pointer transition-opacity hover:opacity-90"
              style={{ backgroundColor: accentBg }}
            >
              <span>Open Portal</span>
              <ArrowRight size={15} />
            </button>
          </form>
          {lookupError && <p className="text-xs text-rose-400">{lookupError}</p>}
        </section>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 px-4 sm:px-6 text-center text-xs text-slate-400 space-y-1.5">
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-300">
          {businessContact?.email && (
            <a
              href={`mailto:${businessContact.email}`}
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              <Mail size={13} />
              <span>{businessContact.email}</span>
            </a>
          )}
          {businessContact?.phone && (
            <span className="inline-flex items-center gap-1.5">
              <Phone size={13} />
              <span>{businessContact.phone}</span>
            </span>
          )}
        </div>
        <p>© {new Date().getFullYear()} {brandName}. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default function GeneralClientPortalPage() {
  return (
    <BrandingProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
            Loading Client Portal...
          </div>
        }
      >
        <GeneralClientPortalContent />
      </Suspense>
    </BrandingProvider>
  )
}
