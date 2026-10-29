'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react'
import {
  signInWithGoogle,
  signInWithPin,
  setSessionCookie,
  getActiveIdToken,
  signOut,
} from '@/lib/firebase/auth'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { hexToRgba, normalizeHexColor } from '@/lib/hooks/useInvoiceBranding'
import { getFirebaseErrorMessage } from '@/lib/utils'
import { BrandLogoLockup } from '@/components/branding/BrandLogoLockup'
import { PinInput } from '@/components/auth/PinInput'

function resolveSafeRedirect(raw?: string | null): string {
  if (!raw) return '/dashboard'
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/login')) {
    return '/dashboard'
  }
  return trimmed
}

function getRelativeLuminance(hex: string): number {
  const clean = normalizeHexColor(hex, '#1D63ED').slice(1)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function darkenHex(hex: string, factor = 0.88): string {
  const clean = normalizeHexColor(hex, '#1D63ED').slice(1)
  const r = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(0, 2), 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(2, 4), 16) * factor)))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(4, 6), 16) * factor)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`
}

function LoginPageSkeleton() {
  return (
    <div className="login-light-surface font-sans min-h-[100dvh] w-full bg-[#F8FAFC] flex items-center justify-center p-5">
      <div className="w-full max-w-[440px] rounded-2xl bg-white border border-[#E2E8F0] p-8 shadow-sm space-y-6">
        <div className="h-9 w-36 bg-[#F1F5F9] rounded-lg mx-auto animate-pulse" />
        <div className="flex justify-center gap-2 py-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-11 h-13 rounded-xl bg-[#F1F5F9] animate-pulse" />
          ))}
        </div>
        <div className="h-12 w-full bg-[#E2E8F0] rounded-xl animate-pulse" />
      </div>
    </div>
  )
}

function LoginFormContent() {
  const searchParams = useSearchParams()
  const safeRedirectTo = resolveSafeRedirect(searchParams?.get('redirect'))
  const { user: activeUser, loading: authLoading } = useAuth()
  const { branding } = useBranding()

  const [pin, setPin] = useState('')
  const [authError, setAuthError] = useState('')
  const [isPinLoading, setIsPinLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const autoRedirectedRef = useRef(false)

  // Auto-resume workspace if an active admin session already exists
  useEffect(() => {
    if (
      authLoading ||
      !activeUser ||
      autoRedirectedRef.current ||
      isPinLoading ||
      isGoogleLoading
    ) {
      return
    }
    autoRedirectedRef.current = true
    ;(async () => {
      try {
        const token = await getActiveIdToken()
        if (!token) {
          autoRedirectedRef.current = false
          return
        }
        const sessionRes = await fetch('/api/admin/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, maxAgeSeconds: 604800 }),
        })
        if (sessionRes.ok) {
          setSessionCookie(token, 604800)
          window.location.replace(safeRedirectTo)
        } else {
          await signOut()
          autoRedirectedRef.current = false
        }
      } catch {
        autoRedirectedRef.current = false
      }
    })()
  }, [authLoading, activeUser, safeRedirectTo, isPinLoading, isGoogleLoading])

  // Enforce pure LexMedia Blue (#1D63ED) for login button & accent elements
  const resolvedBrandBlue = '#1D63ED'
  const resolvedBrandBlueHover = '#1550C7'
  const resolvedBrandBlueFg = '#FFFFFF'
  const resolvedBrandBlueRing = 'rgba(29, 99, 237, 0.20)'
  const resolvedBrandBlueShadow = 'rgba(29, 99, 237, 0.30)'
  const resolvedBrandBlueWash = 'rgba(29, 99, 237, 0.05)'
  const resolvedBrandBlueRule = 'rgba(29, 99, 237, 0.25)'

  const candidateBg = normalizeHexColor(branding.backgroundColor, '#F8FAFC')
  const resolvedCanvasBg =
    getRelativeLuminance(candidateBg) > 0.8 ? candidateBg : '#F8FAFC'

  const candidateSurface = normalizeHexColor(branding.surfaceColor, '#FFFFFF')
  const resolvedSurfaceBg =
    getRelativeLuminance(candidateSurface) > 0.88 ? candidateSurface : '#FFFFFF'

  const legacyTextDefaults = new Set(['#111827', '#0a0a0a', ''])
  const rawTextLower = (branding.textColor || '').trim().toLowerCase()
  const candidateHeading = !legacyTextDefaults.has(rawTextLower)
    ? normalizeHexColor(branding.textColor, '#0F172A')
    : '#0F172A'
  const resolvedHeadingText =
    getRelativeLuminance(candidateHeading) < 0.22 ? candidateHeading : '#0F172A'

  const rawBrandName = (branding.businessName || '').trim()
  const footerBrandName =
    rawBrandName && rawBrandName.toLowerCase() !== 'lexmedia'
      ? rawBrandName
      : 'lexmedia.gh'

  const scopedThemeCss = `
    .login-theme-vars {
      --login-bg: ${resolvedCanvasBg};
      --login-surface: ${resolvedSurfaceBg};
      --login-heading: ${resolvedHeadingText};
      --login-body: #334155;
      --login-muted: #64748B;
      --login-border: #E2E8F0;
      --login-border-hover: #CBD5E1;
      --login-accent: #1D63ED;
      --login-accent-hover: #1550C7;
      --login-accent-fg: #FFFFFF;
      --login-accent-ring: ${resolvedBrandBlueRing};
      --login-accent-shadow: ${resolvedBrandBlueShadow};
      --login-accent-wash: ${resolvedBrandBlueWash};
      --login-accent-rule: ${resolvedBrandBlueRule};
    }
  `

  // Submit 6-digit PIN login
  const handlePinSubmit = async (e?: React.FormEvent, submittedPin?: string) => {
    if (e) e.preventDefault()
    const targetPin = (submittedPin || pin).trim()

    if (targetPin.length !== 6 || !/^[0-9]{6}$/.test(targetPin)) {
      setAuthError('Please enter all six numeric digits.')
      return
    }

    setAuthError('')
    setIsPinLoading(true)

    try {
      await signInWithPin(targetPin)
      window.location.replace(safeRedirectTo)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      const message = (err as { message?: string })?.message ?? ''

      if (message) {
        setAuthError(message)
      } else {
        setAuthError(getFirebaseErrorMessage(code) || 'Incorrect 6-digit PIN.')
      }
    } finally {
      setIsPinLoading(false)
    }
  }

  // Google Sign-In trigger
  const handleGoogleLogin = async () => {
    setAuthError('')
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
      window.location.assign(safeRedirectTo)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      const message = (err as { message?: string })?.message ?? ''

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User intentionally closed or cancelled popup
      } else if (
        code === 'auth/unauthorized-admin' ||
        code === 'auth/configuration-not-found'
      ) {
        setAuthError(message || 'Google Sign-In is not available right now.')
      } else {
        setAuthError(getFirebaseErrorMessage(code) || 'Failed to sign in with Google.')
      }
    } finally {
      setIsGoogleLoading(false)
    }
  }

  const primarySpinnerBorder = 'border-white/30 border-t-white'

  return (
    <main className="login-light-surface login-theme-vars font-sans min-h-[100dvh] w-full overflow-x-hidden text-[var(--login-heading)] flex flex-col relative selection:bg-[#1D63ED] selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: scopedThemeCss }} />

      {/* Subtle desktop-only geometric corner wash */}
      <div
        aria-hidden="true"
        className="hidden lg:block pointer-events-none fixed -bottom-28 -left-28 w-[420px] h-[420px] rounded-[72px] rotate-12 bg-[var(--login-accent-wash)]"
      />

      <div className="w-full max-w-[1040px] mx-auto flex-1 flex flex-col justify-between px-5 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-9 relative z-10">
        {/* Minimal Brand Header */}
        <header className="w-full max-w-[440px] mx-auto lg:max-w-none lg:mx-0 flex items-center justify-center lg:justify-start pt-1 pb-4 sm:pb-6 lg:pb-2 shrink-0">
          <BrandLogoLockup subtitle="Ctrl Room" variant="light" size="md" />
        </header>

        {/* Main Responsive Content Container */}
        <div className="w-full my-auto py-1 sm:py-4 lg:grid lg:grid-cols-[1fr_440px] lg:items-center lg:gap-12 xl:gap-16">
          {/* Desktop Left Welcome Column */}
          <div className="hidden lg:flex flex-col items-start max-w-[400px] pr-4">
            <h1 className="text-[36px] font-bold tracking-[-0.025em] leading-[1.15] text-[var(--login-heading)] [text-wrap:balance]">
              Welcome back
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-[var(--login-muted)] font-normal">
              Enter your PIN to continue.
            </p>
            <div
              aria-hidden="true"
              className="mt-5 w-9 h-[2.5px] rounded-full bg-[var(--login-accent)]"
            />
          </div>

          {/* Centered Form Column (440px card on sm+/desktop) */}
          <div className="w-full max-w-[440px] mx-auto lg:mx-0">
            <div
              id="login-card"
              className="w-full bg-white sm:bg-[var(--login-surface)] sm:rounded-2xl sm:border sm:border-[var(--login-border)] sm:p-8 lg:p-9 sm:shadow-[0_14px_40px_-12px_rgba(15,23,42,0.08),0_2px_6px_-1px_rgba(15,23,42,0.03)]"
            >
              {/* Desktop Card Brand Lockup */}
              <div className="hidden lg:flex justify-center mb-7">
                <BrandLogoLockup subtitle="Ctrl Room" variant="light" size="lg" />
              </div>

              {/* Mobile & Tablet Heading Block */}
              <div className="lg:hidden mb-6">
                <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.025em] leading-[1.2] text-[var(--login-heading)] [text-wrap:balance]">
                  Welcome back
                </h1>
                <p className="mt-1.5 text-[15px] leading-[1.55] text-[var(--login-muted)] font-normal">
                  Enter your PIN to continue.
                </p>
                <div
                  aria-hidden="true"
                  className="mt-3.5 w-8 h-[2px] rounded-full bg-[var(--login-accent-rule)]"
                />
              </div>

              {/* Error Alert */}
              {authError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[13px] mb-5"
                >
                  <AlertCircle size={16} className="text-[#DC2626] shrink-0 mt-0.5" />
                  <span className="font-medium leading-snug">{authError}</span>
                </div>
              )}

              {/* 1. 6-Digit PIN Form */}
              <form
                id="pin-login-form"
                onSubmit={(e) => handlePinSubmit(e)}
                noValidate
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="block text-center text-xs font-semibold uppercase tracking-wider text-[var(--login-muted)]">
                    6-Digit Security PIN
                  </label>
                  <PinInput
                    value={pin}
                    onChange={(val) => {
                      setPin(val)
                      if (authError) setAuthError('')
                    }}
                    onComplete={(completedPin) => handlePinSubmit(undefined, completedPin)}
                    disabled={isPinLoading || isGoogleLoading}
                    hasError={Boolean(authError)}
                    autoFocus
                  />
                </div>

                <button
                  id="pin-submit-button"
                  type="submit"
                  disabled={isPinLoading || isGoogleLoading || pin.length !== 6}
                  className="w-full h-12 px-5 rounded-xl bg-[#1D63ED] hover:bg-[#1550C7] text-white font-semibold text-sm shadow-[0_6px_18px_-4px_rgba(29,99,237,0.30)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63ED] focus-visible:ring-offset-2"
                >
                  {isPinLoading ? (
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 border-2 ${primarySpinnerBorder} rounded-full animate-spin`}
                      />
                      <span>Verifying PIN...</span>
                    </span>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight size={16} strokeWidth={2.2} />
                    </>
                  )}
                </button>
              </form>

              {/* 2. Subtle OR Divider + Continue with Google */}
              <div className="relative my-5 flex items-center" role="separator">
                <div className="flex-1 border-t border-[var(--login-border)]" />
                <span className="px-3 text-[11px] tracking-[0.06em] text-[var(--login-muted)] font-semibold select-none">
                  OR
                </span>
                <div className="flex-1 border-t border-[var(--login-border)]" />
              </div>

              <button
                id="google-login-button"
                type="button"
                disabled={isPinLoading || isGoogleLoading}
                onClick={handleGoogleLogin}
                className="w-full h-12 px-5 rounded-xl bg-white border border-[var(--login-border)] hover:bg-[#F8FAFC] hover:border-[var(--login-border-hover)] text-[var(--login-heading)] font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)] focus-visible:ring-offset-2"
              >
                {isGoogleLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
                    <span>Connecting to Google...</span>
                  </span>
                ) : (
                  <>
                    <svg
                      className="w-[18px] h-[18px] shrink-0"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Desktop Card Footer */}
              <p className="hidden lg:block mt-7 text-center text-xs text-[var(--login-muted)] font-normal">
                © 2026 {footerBrandName}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Footer */}
        <footer className="lg:hidden w-full max-w-[440px] mx-auto pt-6 pb-1 text-center">
          <p className="text-xs text-[var(--login-muted)] font-normal">© 2026 {footerBrandName}</p>
        </footer>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageSkeleton />}>
      <LoginFormContent />
    </Suspense>
  )
}
