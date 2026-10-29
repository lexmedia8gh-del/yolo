'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Check,
} from 'lucide-react'
import {
  signInWithEmail,
  signInWithGoogle,
  sendPasswordReset,
  setSessionCookie,
  getActiveIdToken,
  signOut,
} from '@/lib/firebase/auth'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { hexToRgba, normalizeHexColor } from '@/lib/hooks/useInvoiceBranding'
import { getFirebaseErrorMessage } from '@/lib/utils'
import { BrandLogoLockup } from '@/components/branding/BrandLogoLockup'
import toast from 'react-hot-toast'

const REMEMBERED_EMAIL_KEY = 'lexmedia_remembered_email'
const EMAIL_CHECK_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Form validation schema
const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

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
      <div className="w-full max-w-[440px] rounded-2xl bg-white border border-[#E2E8F0] p-8 shadow-sm space-y-5">
        <div className="h-9 w-36 bg-[#F1F5F9] rounded-lg mx-auto animate-pulse" />
        <div className="space-y-2.5 pt-2">
          <div className="h-4 w-24 bg-[#F1F5F9] rounded animate-pulse" />
          <div className="h-12 w-full bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] animate-pulse" />
        </div>
        <div className="space-y-2.5">
          <div className="h-4 w-20 bg-[#F1F5F9] rounded animate-pulse" />
          <div className="h-12 w-full bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] animate-pulse" />
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

  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Forgot Password States
  const [isResetMode, setIsResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)

  const autoRedirectedRef = useRef(false)

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  })

  // Pre-fill remembered email when previously saved
  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY)
      if (remembered && !getValues('email')) {
        setValue('email', remembered)
      }
    } catch {}
  }, [getValues, setValue])

  // Seamlessly resume workspace if an authenticated admin session is already active in Firebase
  useEffect(() => {
    if (
      authLoading ||
      !activeUser ||
      autoRedirectedRef.current ||
      isSubmitting ||
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
  }, [authLoading, activeUser, safeRedirectTo, isSubmitting, isGoogleLoading])

  // Resolve colors from Branding Settings while enforcing consistent LexMedia Blue & light contrast
  const legacyAccents = new Set([
    '#0a0a0a',
    '#0f172a',
    '#111827',
    '#4f46e5',
    '#6366f1',
    '',
  ])
  const rawButtonLower = (branding.buttonColor || '').trim().toLowerCase()
  const rawAccentLower = (branding.accentColor || '').trim().toLowerCase()
  const rawSecondaryLower = (branding.secondaryColor || '').trim().toLowerCase()

  const resolvedBrandBlue = !legacyAccents.has(rawButtonLower)
    ? normalizeHexColor(branding.buttonColor, '#1D63ED')
    : !legacyAccents.has(rawAccentLower)
    ? normalizeHexColor(branding.accentColor, '#1D63ED')
    : !legacyAccents.has(rawSecondaryLower)
    ? normalizeHexColor(branding.secondaryColor, '#1D63ED')
    : '#1D63ED'

  const resolvedBrandBlueHover = darkenHex(resolvedBrandBlue, 0.88)
  const isLightAccent = getRelativeLuminance(resolvedBrandBlue) > 0.45
  const resolvedBrandBlueFg = isLightAccent ? '#0F172A' : '#FFFFFF'
  const resolvedBrandBlueRing = hexToRgba(resolvedBrandBlue, 0.16)
  const resolvedBrandBlueShadow = hexToRgba(resolvedBrandBlue, 0.2)
  const resolvedBrandBlueWash = hexToRgba(resolvedBrandBlue, 0.045)
  const resolvedBrandBlueRule = hexToRgba(resolvedBrandBlue, 0.28)

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
      --login-input-bg: #F8FAFC;
      --login-accent: ${resolvedBrandBlue};
      --login-accent-hover: ${resolvedBrandBlueHover};
      --login-accent-fg: ${resolvedBrandBlueFg};
      --login-accent-ring: ${resolvedBrandBlueRing};
      --login-accent-shadow: ${resolvedBrandBlueShadow};
      --login-accent-wash: ${resolvedBrandBlueWash};
      --login-accent-rule: ${resolvedBrandBlueRule};
    }
  `

  // Primary Email & Password Sign In
  const onSubmit = async (data: LoginFormData) => {
    setAuthError('')
    try {
      const remember = Boolean(data.rememberMe)
      await signInWithEmail(data.email, data.password, remember)

      try {
        if (remember) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, data.email.trim().toLowerCase())
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY)
        }
      } catch {}

      window.location.assign(safeRedirectTo)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      const message = (err as { message?: string })?.message ?? ''
      if (code === 'auth/unauthorized-admin' && message) {
        setAuthError(message)
      } else {
        setAuthError(getFirebaseErrorMessage(code))
      }
    }
  }

  // Google / Gmail Sign In
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
        // User intentionally closed or replaced the Google chooser popup
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

  // Password Reset Flow
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = resetEmail.trim()
    if (!trimmedEmail || !EMAIL_CHECK_REGEX.test(trimmedEmail)) {
      setAuthError('Please enter a valid email address.')
      return
    }
    setAuthError('')
    setIsResetLoading(true)
    try {
      await sendPasswordReset(trimmedEmail)
      setResetSuccess(true)
      toast.success('Password reset link sent')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      setAuthError(getFirebaseErrorMessage(code) || 'Failed to send password reset email.')
    } finally {
      setIsResetLoading(false)
    }
  }

  const headingTitle = isResetMode ? 'Reset password' : 'Welcome back'
  const supportingCopy = isResetMode
    ? 'Enter your email address to receive a password reset link.'
    : 'Sign in to continue to your workspace.'

  const primarySpinnerBorder = isLightAccent
    ? 'border-slate-900/30 border-t-slate-900'
    : 'border-white/30 border-t-white'

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
              {headingTitle}
            </h1>
            <p className="mt-3 text-[16px] leading-[1.6] text-[var(--login-muted)] font-normal">
              {supportingCopy}
            </p>
            <div
              aria-hidden="true"
              className="mt-5 w-9 h-[2.5px] rounded-full bg-[var(--login-accent)]"
            />
          </div>

          {/* Centered Form Column (Single column on mobile, 440px card on sm+/desktop) */}
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
                  {headingTitle}
                </h1>
                <p className="mt-1.5 text-[15px] leading-[1.55] text-[var(--login-muted)] font-normal">
                  {supportingCopy}
                </p>
                <div
                  aria-hidden="true"
                  className="mt-3.5 w-8 h-[2px] rounded-full bg-[var(--login-accent-rule)]"
                />
              </div>

              {/* Concise Error Alert */}
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

              {/* Forgot Password Flow */}
              {isResetMode ? (
                <form
                  id="reset-password-form"
                  onSubmit={handlePasswordReset}
                  noValidate
                  className="space-y-4"
                >
                  {resetSuccess ? (
                    <div className="space-y-4">
                      <div
                        role="status"
                        className="p-4 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[13px] space-y-1.5"
                      >
                        <div className="flex items-center gap-2 font-semibold text-[#15803D]">
                          <CheckCircle2 size={16} className="shrink-0" />
                          <span>Reset link sent</span>
                        </div>
                        <p className="text-[#166534] leading-relaxed font-normal">
                          If an account exists for{' '}
                          <strong className="font-semibold">{resetEmail.trim()}</strong>, you will
                          receive password reset instructions shortly.
                        </p>
                      </div>

                      <button
                        id="reset-return-button"
                        type="button"
                        onClick={() => {
                          setIsResetMode(false)
                          setResetSuccess(false)
                          setResetEmail('')
                          setAuthError('')
                        }}
                        className="w-full h-12 px-5 rounded-xl bg-white border border-[var(--login-border)] hover:bg-[#F8FAFC] hover:border-[var(--login-border-hover)] text-[var(--login-heading)] font-semibold text-sm transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)] focus-visible:ring-offset-2"
                      >
                        <ArrowLeft size={16} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="reset-email-input"
                          className="block text-[13px] font-semibold leading-5 text-[var(--login-heading)]"
                        >
                          Email address
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--login-muted)]">
                            <Mail size={18} strokeWidth={1.8} />
                          </div>
                          <input
                            id="reset-email-input"
                            type="email"
                            inputMode="email"
                            required
                            autoComplete="email"
                            placeholder="you@lexmedia.gh"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            disabled={isResetLoading}
                            className="w-full h-12 pl-11 pr-4 rounded-xl bg-[var(--login-input-bg)] border border-[var(--login-border)] text-[var(--login-heading)] text-sm font-normal placeholder:text-[#94A3B8] transition-colors focus:bg-white focus:outline-none focus:border-[var(--login-accent)] focus:ring-4 focus:ring-[var(--login-accent-ring)] disabled:opacity-60"
                          />
                        </div>
                      </div>

                      <button
                        id="reset-submit-button"
                        type="submit"
                        disabled={isResetLoading}
                        className="w-full h-12 px-5 rounded-xl bg-[var(--login-accent)] hover:bg-[var(--login-accent-hover)] text-[var(--login-accent-fg)] font-semibold text-sm shadow-[0_6px_18px_-4px_var(--login-accent-shadow)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)] focus-visible:ring-offset-2"
                      >
                        {isResetLoading ? (
                          <span className="flex items-center gap-2">
                            <span
                              className={`w-4 h-4 border-2 ${primarySpinnerBorder} rounded-full animate-spin`}
                            />
                            <span>Sending link...</span>
                          </span>
                        ) : (
                          <>
                            <span>Send Reset Link</span>
                            <ArrowRight size={16} strokeWidth={2.2} />
                          </>
                        )}
                      </button>

                      <button
                        id="reset-back-button"
                        type="button"
                        onClick={() => {
                          setIsResetMode(false)
                          setAuthError('')
                        }}
                        className="w-full min-h-[44px] px-4 rounded-xl text-[13px] font-semibold text-[var(--login-body)] hover:text-[var(--login-heading)] hover:bg-[#F8FAFC] transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)]"
                      >
                        <ArrowLeft size={15} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                /* Primary Email & Password Sign-In Form */
                <form
                  id="primary-login-form"
                  onSubmit={handleSubmit(onSubmit)}
                  noValidate
                  className="space-y-4"
                >
                  {/* 1. Email Address Input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email-input"
                      className="block text-[13px] font-semibold leading-5 text-[var(--login-heading)]"
                    >
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--login-muted)]">
                        <Mail size={18} strokeWidth={1.8} />
                      </div>
                      <input
                        id="login-email-input"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@lexmedia.gh"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'login-email-error' : undefined}
                        disabled={isSubmitting || isGoogleLoading}
                        className={`w-full h-12 pl-11 pr-4 rounded-xl bg-[var(--login-input-bg)] border text-[var(--login-heading)] text-sm font-normal placeholder:text-[#94A3B8] transition-colors focus:bg-white focus:outline-none focus:ring-4 disabled:opacity-60 ${
                          errors.email
                            ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-red-600/15'
                            : 'border-[var(--login-border)] focus:border-[var(--login-accent)] focus:ring-[var(--login-accent-ring)]'
                        }`}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p
                        id="login-email-error"
                        role="alert"
                        className="text-xs text-[#DC2626] font-medium pt-0.5"
                      >
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* 2. Password Input & Visibility Toggle */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password-input"
                      className="block text-[13px] font-semibold leading-5 text-[var(--login-heading)]"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--login-muted)]">
                        <Lock size={18} strokeWidth={1.8} />
                      </div>
                      <input
                        id="login-password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby={errors.password ? 'login-password-error' : undefined}
                        disabled={isSubmitting || isGoogleLoading}
                        className={`w-full h-12 pl-11 pr-12 rounded-xl bg-[var(--login-input-bg)] border text-[var(--login-heading)] text-sm font-normal placeholder:text-[#94A3B8] transition-colors focus:bg-white focus:outline-none focus:ring-4 disabled:opacity-60 ${
                          errors.password
                            ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-red-600/15'
                            : 'border-[var(--login-border)] focus:border-[var(--login-accent)] focus:ring-[var(--login-accent-ring)]'
                        }`}
                        {...register('password')}
                      />
                      <button
                        id="login-password-toggle"
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isSubmitting || isGoogleLoading}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute inset-y-0 right-0 w-11 h-12 flex items-center justify-center rounded-r-xl text-[var(--login-muted)] hover:text-[var(--login-heading)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--login-accent)]"
                      >
                        {showPassword ? (
                          <EyeOff size={18} strokeWidth={1.8} />
                        ) : (
                          <Eye size={18} strokeWidth={1.8} />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p
                        id="login-password-error"
                        role="alert"
                        className="text-xs text-[#DC2626] font-medium pt-0.5"
                      >
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* 4 & 5. Remember Me & Forgot Password Row (44px+ touch targets) */}
                  <div className="flex items-center justify-between gap-3 select-none">
                    <label
                      htmlFor="remember-me-checkbox"
                      className="min-h-[44px] inline-flex items-center gap-2.5 cursor-pointer group"
                    >
                      <span className="relative inline-flex items-center justify-center w-[18px] h-[18px] shrink-0">
                        <input
                          id="remember-me-checkbox"
                          type="checkbox"
                          disabled={isSubmitting || isGoogleLoading}
                          className="peer sr-only"
                          {...register('rememberMe')}
                        />
                        <span className="w-[18px] h-[18px] rounded-[5px] border border-[#CBD5E1] bg-white transition-colors peer-checked:bg-[var(--login-accent)] peer-checked:border-[var(--login-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--login-accent)] peer-focus-visible:ring-offset-2 group-hover:border-[#94A3B8]" />
                        <Check
                          size={12}
                          strokeWidth={3}
                          className="absolute text-[var(--login-accent-fg)] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                        />
                      </span>
                      <span className="text-[13px] font-medium text-[var(--login-body)] group-hover:text-[var(--login-heading)] transition-colors whitespace-nowrap">
                        Remember me
                      </span>
                    </label>

                    <button
                      id="forgot-password-toggle"
                      type="button"
                      disabled={isSubmitting || isGoogleLoading}
                      onClick={() => {
                        const currentEmail = getValues('email')?.trim() || ''
                        if (currentEmail && !resetEmail) {
                          setResetEmail(currentEmail)
                        }
                        setIsResetMode(true)
                        setResetSuccess(false)
                        setAuthError('')
                      }}
                      className="min-h-[44px] inline-flex items-center px-1 rounded-lg text-[13px] font-semibold text-[var(--login-accent)] hover:text-[var(--login-accent-hover)] hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)]"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* 6. Primary Sign In Button */}
                  <button
                    id="login-submit-button"
                    type="submit"
                    disabled={isSubmitting || isGoogleLoading}
                    className="w-full h-12 px-5 rounded-xl bg-[var(--login-accent)] hover:bg-[var(--login-accent-hover)] text-[var(--login-accent-fg)] font-semibold text-sm shadow-[0_6px_18px_-4px_var(--login-accent-shadow)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--login-accent)] focus-visible:ring-offset-2"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 border-2 ${primarySpinnerBorder} rounded-full animate-spin`}
                        />
                        <span>Signing in...</span>
                      </span>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={16} strokeWidth={2.2} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* 7 & 8. Subtle OR Divider + Continue with Google */}
              {!isResetMode && (
                <>
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
                    disabled={isSubmitting || isGoogleLoading}
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
                </>
              )}

              {/* Desktop Card Footer */}
              <p className="hidden lg:block mt-7 text-center text-xs text-[var(--login-muted)] font-normal">
                © 2026 {footerBrandName}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Subtle Footer */}
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
