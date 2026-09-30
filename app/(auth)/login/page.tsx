'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
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

  const businessName = branding?.businessName || 'LEXMEDIA.GH'
  const logoImage = branding?.logoLightUrl || branding?.logoUrl

  return (
    <main className="min-h-screen w-full bg-[#06080E] text-slate-100 flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Subtle Background Lighting & Radial Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/15 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="w-full max-w-md pt-2 pb-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-center p-1.5 shadow-sm">
            {logoImage ? (
              <Image
                src={logoImage}
                alt={businessName}
                width={20}
                height={20}
                unoptimized
                className="h-5 w-auto object-contain"
              />
            ) : (
              <LexMediaEmblem className="w-5 h-5" />
            )}
          </div>
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-400">
            {businessName}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>System Online</span>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <div className="my-auto py-4 w-full max-w-[420px] z-10">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          <div
            id="login-card"
            className="w-full bg-[#0D121F]/80 backdrop-blur-xl rounded-2xl border border-slate-800/80 p-6 sm:p-9 shadow-[0_0_50px_-12px_rgba(37,99,235,0.2),0_10px_30px_-10px_rgba(0,0,0,0.5)] relative overflow-hidden"
          >
            {/* Subtle top ambient accent line */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

            {/* Branding Header Inside Card */}
            <div className="text-center space-y-1.5 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/50 border border-blue-800/30 text-blue-400 text-[11px] font-semibold tracking-wider uppercase mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>CTRL ROOM</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {isResetMode ? 'Reset Password' : 'Welcome back'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-normal leading-relaxed">
                {isResetMode
                  ? 'Enter your account email to receive recovery instructions.'
                  : 'Sign in to your operations workspace.'}
              </p>
            </div>

            {/* Error Banner */}
            {authError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs mb-5"
              >
                <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{authError}</span>
              </motion.div>
            )}

            {/* Password Reset Form */}
            {isResetMode ? (
              <form id="reset-password-form" onSubmit={handlePasswordReset} className="space-y-4">
                {resetSuccess ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs font-normal space-y-1.5">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 size={15} />
                        <span>Recovery Link Dispatched</span>
                      </div>
                      <p className="text-slate-300">
                        We sent a password reset link to{' '}
                        <strong className="text-white font-medium">{resetEmail}</strong>.
                      </p>
                      <p className="text-slate-400 text-[11px]">Please check your inbox and spam folder.</p>
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
                      className="w-full h-11 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2"
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
                        className="block text-xs font-medium text-slate-300"
                      >
                        Email Address <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
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
                          className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-100 text-xs sm:text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    </div>

                    <button
                      id="reset-submit-button"
                      type="submit"
                      disabled={isResetLoading}
                      className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs tracking-wide shadow-[0_4px_16px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none active:scale-[0.99]"
                    >
                      {isResetLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending link...</span>
                        </span>
                      ) : (
                        <>
                          <span>Send Reset Link</span>
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
                      className="w-full text-center text-xs text-slate-400 hover:text-slate-200 font-medium py-1 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft size={13} />
                      <span>Back to Sign In</span>
                    </button>
                  </div>
                )}
              </form>
            ) : (
              /* Primary Credential Form */
              <form
                id="primary-login-form"
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {/* Email Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-email-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Email Address <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail size={16} />
                    </div>
                    <input
                      id="login-email-input"
                      type="email"
                      autoComplete="email"
                      placeholder="staff@lexmedia.com"
                      required
                      className={`w-full h-11 pl-10 pr-4 rounded-xl bg-slate-900/90 border text-slate-100 text-xs sm:text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 ${
                        errors.email ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-800'
                      }`}
                      {...register('email')}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-[11px] text-rose-400 font-medium">{errors.email.message}</p>
                  )}
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-password-input"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock size={16} />
                    </div>
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      required
                      className={`w-full h-11 pl-10 pr-11 rounded-xl bg-slate-900/90 border text-slate-100 text-xs sm:text-sm placeholder-slate-500 transition-all focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 ${
                        errors.password ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-800'
                      }`}
                      {...register('password')}
                    />
                    <button
                      id="login-password-toggle"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[11px] text-rose-400 font-medium">{errors.password.message}</p>
                  )}
                </div>

                {/* Remember Me & Forgot Password Row */}
                <div className="flex items-center justify-between pt-1 select-none text-xs">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      id="remember-me-checkbox"
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      {...register('rememberMe')}
                    />
                    <span className="text-slate-400 group-hover:text-slate-200 font-normal transition-colors">
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
                    className="font-medium text-blue-400 hover:text-blue-300 transition-colors hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Primary Submit Button */}
                <button
                  id="login-submit-button"
                  type="submit"
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs tracking-wide shadow-[0_4px_16px_rgba(37,99,235,0.3)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:pointer-events-none active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </span>
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
                <div className="relative my-5 flex items-center justify-center">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="absolute bg-[#0D121F] px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
                    OR
                  </span>
                  <div className="border-t border-slate-800 w-full" />
                </div>

                {/* Google SSO Button */}
                <button
                  id="google-login-button"
                  type="button"
                  disabled={isSubmitting || isGoogleLoading}
                  onClick={handleGoogleLogin}
                  className="w-full h-11 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-slate-200 font-medium text-xs transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:pointer-events-none"
                >
                  {isGoogleLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-200 rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </span>
                  ) : (
                    <>
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
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Private Security Footnote inside card */}
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500 font-normal">
              <ShieldCheck size={14} className="text-blue-500/80 shrink-0" />
              <span>Authorized LEXMEDIA.GH access only</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer Security Message */}
      <footer className="w-full max-w-md pb-3 pt-2 text-center z-10 flex flex-col items-center gap-1 text-[11px] text-slate-500 font-normal">
        <span>LEXMEDIA.GH • Ctrl Room</span>
        <span className="text-slate-600">© {new Date().getFullYear()} All rights reserved.</span>
      </footer>
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
