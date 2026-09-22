'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Users,
  FolderKanban,
  CreditCard,
  UploadCloud,
  CheckCircle2,
  ArrowLeft,
  Search,
  Bell,
  Check,
  Activity,
  Layers,
  FileCheck,
  TrendingUp,
} from 'lucide-react'
import { signInWithEmail, signInWithGoogle, sendPasswordReset } from '@/lib/firebase/auth'
import { getFirebaseErrorMessage } from '@/lib/utils'
import { PageLoader } from '@/components/ui/Spinner'
import { getDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BrandingSettings } from '@/lib/types'
import toast from 'react-hot-toast'

// Form validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

/**
 * Geometric LexMedia Folded Cube / Emblem
 */
function LexMediaEmblem({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M18 4L30 11V25L18 32L6 25V11L18 4Z" fill="#1D4ED8" fillOpacity="0.4" />
      <path d="M18 4L30 11L18 18L6 11L18 4Z" fill="#60A5FA" />
      <path d="M6 11L18 18V32L6 25V11Z" fill="#2563EB" />
      <path d="M30 11L18 18V32L30 25V11Z" fill="#1D4ED8" />
      <path d="M18 11L24 14.5L18 18L12 14.5L18 11Z" fill="#FFFFFF" fillOpacity="0.9" />
      <path d="M12 17.5L18 21V27L12 23.5V17.5Z" fill="#FFFFFF" fillOpacity="0.85" />
      <path d="M24 17.5L18 21V27L24 23.5V17.5Z" fill="#93C5FD" />
    </svg>
  )
}

function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams?.get('redirect') ?? '/dashboard'

  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [branding, setBranding] = useState<BrandingSettings | null>(null)

  // Forgot Password States
  const [isResetMode, setIsResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)

  // Fetch Central Branding Settings
  useEffect(() => {
    async function loadBranding() {
      try {
        const doc = await getDocument<BrandingSettings>(COLLECTIONS.SETTINGS, 'branding')
        if (doc) {
          setBranding(doc)
        }
      } catch (err) {
        console.warn('Failed to load dynamic branding:', err)
      }
    }
    loadBranding()
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  })

  // Sign In submit
  const onSubmit = async (data: LoginFormData) => {
    setAuthError('')
    try {
      const userCredential = await signInWithEmail(data.email, data.password)
      const idToken = await userCredential.user.getIdToken()
      document.cookie = `__session=${idToken}; path=/; ${
        data.rememberMe ? 'max-age=604800' : ''
      }`
      router.push(redirectTo)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      setAuthError(getFirebaseErrorMessage(code))
    }
  }

  // Google sign in trigger
  const handleGoogleLogin = async () => {
    setAuthError('')
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Hard navigation ensures __session cookie is sent to server-side middleware and layouts
      window.location.href = redirectTo || '/dashboard'
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      const message = (err as { message?: string }).message ?? ''

      if (code === 'auth/popup-closed-by-user') {
        // User cancelled — do nothing
      } else if (code === 'auth/unauthorized-admin') {
        // Custom error — show the server message directly
        setAuthError(message)
      } else {
        setAuthError(getFirebaseErrorMessage(code) || 'Failed to sign in with Google.')
      }
    } finally {
      setIsGoogleLoading(false)
    }
  }

  // Password reset action
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      toast.error('Please enter your email address.')
      return
    }
    setAuthError('')
    setIsResetLoading(true)
    try {
      await sendPasswordReset(resetEmail)
      setResetSuccess(true)
      toast.success('Password reset link dispatched!')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      setAuthError(getFirebaseErrorMessage(code) || 'Failed to send password reset email.')
    } finally {
      setIsResetLoading(false)
    }
  }

  const businessName = branding?.businessName || 'LEXMEDIA / CTRL ROOM'
  const tagline = branding?.tagline || 'STUDIO OPERATIONS & CLIENT DELIVERIES'
  const logoImage = branding?.logoLightUrl || branding?.logoUrl

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-[#0B0F19] text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* ================================================== */}
      {/* LEFT PANEL — BRAND ARCHITECTURE & SYSTEM TELEMETRY */}
      {/* ================================================== */}
      <section
        id="login-brand-panel"
        className="w-full lg:w-[48%] xl:w-[50%] relative flex flex-col justify-between p-8 sm:p-12 xl:p-16 bg-[#090D16] border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden"
      >
        {/* Subtle geometric background structure */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-indigo-600/10 blur-[130px]" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
        </div>

        {/* --- Top Brand Bar --- */}
        <header className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center p-2 shadow-sm">
              {logoImage ? (
                <Image
                  src={logoImage}
                  alt={businessName}
                  width={24}
                  height={24}
                  unoptimized
                  className="h-6 w-auto object-contain"
                />
              ) : (
                <LexMediaEmblem className="w-6 h-6" />
              )}
            </div>
            <div>
              <span className="font-bold text-[13px] tracking-[0.16em] uppercase text-white block leading-none">
                {businessName}
              </span>
              <span className="text-[10px] text-slate-400 tracking-[0.18em] uppercase font-semibold mt-1 block">
                {tagline}
              </span>
            </div>
          </div>

          {/* Operational Status Pill */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-medium text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Systems Online</span>
          </div>
        </header>

        {/* --- Center Brand Pitch & Telemetry --- */}
        <div className="relative z-10 my-auto py-10 space-y-8 max-w-xl">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-950/60 border border-blue-800/40 text-[11px] font-semibold text-blue-300 tracking-wide uppercase">
              <Layers size={13} className="text-blue-400" />
              <span>Agency Control Deck</span>
            </div>
            <h1 className="text-3xl sm:text-4xl xl:text-[40px] font-extrabold tracking-tight text-white leading-[1.18]">
              High-velocity studio operations &amp; client escrow.
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-lg">
              Manage client relationships, track project deliverables, accept Paystack payments, and deliver final creative assets with bank-grade link protection.
            </p>
          </div>

          {/* 3 Telemetry Metric Cards */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Active Jobs</span>
                <FolderKanban size={13} className="text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white tracking-tight">32 Live</div>
              <div className="text-[10px] text-emerald-400 font-medium">+14% this quarter</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Settlement</span>
                <CreditCard size={13} className="text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white tracking-tight">99.4%</div>
              <div className="text-[10px] text-emerald-400 font-medium">Instant Escrow</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Turnaround</span>
                <FileCheck size={13} className="text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white tracking-tight">3.2 Days</div>
              <div className="text-[10px] text-slate-400 font-medium">Average Signoff</div>
            </div>
          </div>

          {/* Studio Activity Micro-Feed */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              <span>Recent Operations Stream</span>
              <Activity size={13} className="text-blue-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-200 truncate max-w-[200px]">Brand Campaign Deliverables</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[10px] font-semibold">
                  Approved
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
                <span className="text-slate-200 truncate max-w-[200px]">Invoice #INV-2026-44</span>
                <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                  Settled
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-200 truncate max-w-[200px]">Client Token Delivery Generated</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* --- Bottom Trust & Compliance Footer --- */}
        <footer className="relative z-10 flex items-center justify-between pt-6 border-t border-slate-800/60 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>SOC2 Type II Workflow · TLS 1.3 Encryption</span>
          </div>
          <span>v2.4 Enterprise</span>
        </footer>
      </section>

      {/* ================================================== */}
      {/* RIGHT PANEL — DISTRACTION-FREE AUTHENTICATION DECK */}
      {/* ================================================== */}
      <section
        id="login-form-container"
        className="w-full lg:w-[52%] xl:w-[50%] flex flex-col justify-between p-6 sm:p-12 xl:p-16 bg-[#F8FAFC] text-slate-900 relative"
      >
        {/* Subtle Ambient Radial Lighting */}
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />

        {/* Top Header Tagline (Mobile brand display + right badge) */}
        <div className="w-full flex items-center justify-between z-10 mb-6 lg:mb-0">
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center p-1.5 shadow-sm">
              <LexMediaEmblem className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs tracking-wider uppercase text-slate-900">
              {businessName}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>Secure Access Point</span>
          </div>
        </div>

        {/* Centered Authentication Card */}
        <div className="my-auto py-6 sm:py-10 flex flex-col items-center justify-center z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="w-full max-w-[440px]"
          >
            {/* The Authentication Card */}
            <div
              id="login-card"
              className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-10 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.06),0_0_1px_1px_rgba(15,23,42,0.04)]"
            >
              {/* Card Title & Context */}
              <div className="mb-6 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider mb-2">
                  <span>Authorized Personnel</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isResetMode ? 'Recover Access' : 'Sign in to Control Room'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
                  {isResetMode
                    ? 'Enter your registered email address to receive password reset instructions.'
                    : 'Access your studio management workspace and client portal.'}
                </p>
              </div>

              {/* Error Banner */}
              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200/90 text-rose-800 text-xs mb-5"
                >
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{authError}</span>
                </motion.div>
              )}

              {/* ================================================== */}
              {/* PASSWORD RESET SUB-VIEW                            */}
              {/* ================================================== */}
              {isResetMode ? (
                <form id="reset-password-form" onSubmit={handlePasswordReset} className="space-y-4">
                  {resetSuccess ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle2 size={16} />
                          <span>Recovery Link Dispatched</span>
                        </div>
                        <p>
                          We sent a secure password reset link to{' '}
                          <strong className="font-semibold">{resetEmail}</strong>.
                        </p>
                        <p className="text-emerald-700/80">Please check your inbox and spam folder.</p>
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
                        className="w-full h-12 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        <ArrowLeft size={14} />
                        <span>Return to Sign In</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="reset-email-input"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Email Address <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Mail size={16} />
                          </div>
                          <input
                            id="reset-email-input"
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="staff@lexmedia.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 transition-colors focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                          />
                        </div>
                      </div>

                      <button
                        id="reset-submit-button"
                        type="submit"
                        disabled={isResetLoading}
                        className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wide shadow-sm hover:shadow transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {isResetLoading ? (
                          <span>Sending link...</span>
                        ) : (
                          <>
                            <span>Send Recovery Link</span>
                            <ArrowRight size={14} />
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
                        className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-semibold py-1 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ArrowLeft size={13} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                /* ================================================== */
                /* PRIMARY CREDENTIAL FORM                            */
                /* ================================================== */
                <form
                  id="primary-login-form"
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={16} />
                      </div>
                      <input
                        id="login-email-input"
                        type="email"
                        autoComplete="email"
                        placeholder="staff@lexmedia.com"
                        required
                        className={`w-full h-12 pl-11 pr-4 rounded-xl border bg-white text-slate-900 text-sm placeholder-slate-400 transition-colors focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 ${
                          errors.email ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200'
                        }`}
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-[11px] text-rose-600 font-medium">{errors.email.message}</p>
                    )}
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={16} />
                      </div>
                      <input
                        id="login-password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        required
                        className={`w-full h-12 pl-11 pr-11 rounded-xl border bg-white text-slate-900 text-sm placeholder-slate-400 transition-colors focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 ${
                          errors.password ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200'
                        }`}
                        {...register('password')}
                      />
                      <button
                        id="login-password-toggle"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-[11px] text-rose-600 font-medium">{errors.password.message}</p>
                    )}
                  </div>

                  {/* Remember Me & Forgot Password Row */}
                  <div className="flex items-center justify-between pt-1 select-none text-xs">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        id="remember-me-checkbox"
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0 cursor-pointer"
                        {...register('rememberMe')}
                      />
                      <span className="text-slate-600 group-hover:text-slate-900 font-medium transition-colors">
                        Remember me
                      </span>
                    </label>

                    <button
                      id="forgot-password-toggle"
                      type="button"
                      onClick={() => {
                        setIsResetMode(true)
                        setAuthError('')
                      }}
                      className="font-semibold text-slate-700 hover:text-slate-900 transition-colors hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Primary Submit Button */}
                  <button
                    id="login-submit-button"
                    type="submit"
                    disabled={isSubmitting || isGoogleLoading}
                    className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wide shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:pointer-events-none active:scale-[0.99]"
                  >
                    {isSubmitting ? (
                      <span>Signing in...</span>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Single Sign-On Divider */}
              {!isResetMode && (
                <>
                  <div className="relative my-6 flex items-center justify-center">
                    <div className="border-t border-slate-200 w-full" />
                    <span className="absolute bg-white px-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold whitespace-nowrap">
                      OR
                    </span>
                    <div className="border-t border-slate-200 w-full" />
                  </div>

                  {/* Google SSO Button */}
                  <button
                    id="google-login-button"
                    type="button"
                    disabled={isSubmitting || isGoogleLoading}
                    onClick={handleGoogleLogin}
                    className="w-full h-12 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-3 disabled:opacity-60 disabled:pointer-events-none shadow-xs"
                  >
                    {!isGoogleLoading && (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                    )}
                    <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                  </button>
                </>
              )}

              {/* Private Security Footnote */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400 font-normal">
                <ShieldCheck size={14} className="text-slate-400 shrink-0" />
                <span>Private access restricted to authorized staff only.</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="w-full flex items-center justify-between text-slate-400 text-xs font-normal z-10">
          <span>© {new Date().getFullYear()} {branding?.businessName || 'LexMedia'}. All rights reserved.</span>
          <span className="hidden sm:inline text-slate-400 text-[11px]">Protected by Firebase Auth</span>
        </div>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginFormContent />
    </Suspense>
  )
}
