'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock, Zap, AlertCircle, ShieldCheck, Sparkles, Layers, ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import { signInWithEmail, signInWithGoogle, sendPasswordReset } from '@/lib/firebase/auth'
import { getFirebaseErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'
import { getDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BrandingSettings } from '@/lib/types'
import toast from 'react-hot-toast'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

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
        // Our custom error — show the server message directly
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

  // Brand color calculations
  const brandButtonBg = branding?.buttonColor || '#2563eb'
  const brandButtonText = branding?.buttonTextColor || '#ffffff'
  const brandAccent = branding?.accentColor || '#3b82f6'
  const brandPrimary = branding?.primaryColor || '#1e3a8a'

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-12 bg-white dark:bg-gray-950 font-sans transition-colors duration-200">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Dynamic Brand Overrides */
        input:focus {
          border-color: ${brandAccent} !important;
          box-shadow: 0 0 0 2px ${brandAccent}25 !important;
        }
        input[type="checkbox"]:checked {
          background-color: ${brandAccent} !important;
          border-color: ${brandAccent} !important;
        }
        ::selection {
          background-color: ${brandAccent} !important;
          color: #ffffff !important;
        }
        .brand-text-accent {
          color: ${brandAccent} !important;
        }
        .brand-bg-accent {
          background-color: ${brandAccent} !important;
        }
        .brand-border-accent {
          border-color: ${brandAccent} !important;
        }
      ` }} />
      
      {/* LEFT SIDE — BRAND EXPERIENCE */}
      <div className="hidden lg:flex lg:col-span-5 xl:col-span-6 relative overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 text-white p-12 xl:p-16 flex-col justify-between">
        {/* Ambient subtle glowing nodes to match modern SaaS aesthetics with a distinct premium blue feel */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-40 bg-blue-600" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-25 bg-sky-500" />
        
        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] flex items-center justify-center shadow-lg">
            {branding?.logoLightUrl || branding?.logoUrl ? (
              <img src={branding.logoLightUrl || branding.logoUrl} alt={branding.businessName} className="h-6 w-auto object-contain" />
            ) : (
              <Zap size={20} className="text-blue-400" />
            )}
          </div>
          <div>
            <span className="font-bold text-base tracking-wider uppercase text-white block leading-none">
              {branding?.businessName || 'CTRL ROOM'}
            </span>
            <span className="text-[10px] text-blue-200 tracking-widest uppercase font-semibold mt-1 block">
              {branding?.tagline || 'Creative Operations Platform'}
            </span>
          </div>
        </div>

        {/* Center Dynamic Brand Experience Mockup */}
        <div className="relative z-10 my-auto space-y-10 max-w-md xl:max-w-lg">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold backdrop-blur-sm text-blue-300">
              <Sparkles size={13} className="text-blue-300" />
              <span>Workspace & Client Portal Ecosystem</span>
            </div>
            
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-[1.2]">
              Everything your business needs, in one room.
            </h1>
            
            <p className="text-blue-200/75 text-sm leading-relaxed font-medium">
              Manage clients, projects, payments, final deliverables, and your team workflow from one central control deck.
            </p>
          </div>

          {/* Abstract Glass Dashboard Mockup */}
          <div className="bg-white/[0.02] backdrop-blur-md border border-white/[0.06] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <div className="px-3 py-0.5 rounded-full bg-white/[0.04] text-[9px] font-mono text-blue-300 tracking-wider">
                workspace.ctrl-room
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="h-3.5 bg-white/[0.06] rounded-md w-2/3" />
              <div className="h-2.5 bg-white/[0.03] rounded w-full" />
              <div className="h-2.5 bg-white/[0.03] rounded w-5/6" />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col justify-between h-14">
                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Clients</span>
                <span className="text-xs font-bold font-mono text-white">Active</span>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col justify-between h-14" style={{ borderColor: `${brandAccent}20` }}>
                <span className="text-[9px] text-blue-400 uppercase font-bold tracking-wider">Projects</span>
                <span className="text-xs font-bold font-mono text-blue-300">Live</span>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col justify-between h-14">
                <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">Payments</span>
                <span className="text-xs font-bold font-mono text-emerald-300">Verified</span>
              </div>
            </div>
          </div>

          {/* Minimal visual stats alignment */}
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-blue-200 shrink-0">
                <ShieldCheck size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Secure Access</p>
                <p className="text-[10px] text-blue-200/60">Two-factor protection</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-blue-200 shrink-0">
                <Layers size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Cloud Delivery</p>
                <p className="text-[10px] text-blue-200/60">Instant file portals</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trust Statement */}
        <div className="relative z-10 pt-6 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-blue-200/60">
          <span>Protected by enterprise-grade Firebase security</span>
          <span className="font-mono text-[10px] tracking-widest font-bold uppercase text-blue-400">v2.5 Workspace</span>
        </div>
      </div>

      {/* RIGHT SIDE — LOGIN FORM */}
      <div className="lg:col-span-7 xl:col-span-6 flex flex-col items-center justify-center p-6 sm:p-12 xl:p-16 bg-blue-50/10 dark:bg-gray-950 transition-colors">
        <div className="w-full max-w-[440px] animate-fade-in flex flex-col">
          
          {/* Dynamic Top Brand Logo Header */}
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 flex items-center justify-center shadow-md shadow-gray-100/50 dark:shadow-none mb-3.5 transition-all">
              {branding?.logoUrl ? (
                <>
                  <img src={branding.logoUrl} alt={branding.businessName} className="h-7 w-auto object-contain dark:hidden" />
                  {branding?.logoLightUrl ? (
                    <img src={branding.logoLightUrl} alt={branding.businessName} className="h-7 w-auto object-contain hidden dark:block" />
                  ) : (
                    <img src={branding.logoUrl} alt={branding.businessName} className="h-7 w-auto object-contain hidden dark:block invert dark:invert-0" />
                  )}
                </>
              ) : (
                <Zap size={22} style={{ color: brandAccent }} />
              )}
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900 dark:text-white tracking-tight leading-none">
                {branding?.businessName || 'CTRL ROOM'}
              </h1>
              <span className="text-[10px] uppercase tracking-wider font-bold mt-1.5 block" style={{ color: brandAccent }}>
                {branding?.tagline || 'Staff & Operations Hub'}
              </span>
            </div>
          </div>

          {/* Refined Login Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-850 p-8 sm:p-10 shadow-xl shadow-gray-100/30 dark:shadow-none transition-all">
            
            {/* Form Header */}
            <div className="mb-8">
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                {isResetMode ? 'Forgot Password?' : 'Welcome back'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                {isResetMode 
                  ? 'Enter your registered email address below, and we will dispatch a password reset link to your inbox.' 
                  : 'Secure sign in with your staff credentials.'}
              </p>
            </div>

            {/* General Error Banner */}
            {authError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 mb-6 animate-shake">
                <AlertCircle size={18} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-300 font-semibold leading-relaxed">{authError}</p>
              </div>
            )}

            {/* PASSWORD RESET MODE */}
            {isResetMode ? (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                {resetSuccess ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-900 dark:text-emerald-300 text-xs font-medium space-y-1">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold mb-1">
                        <CheckCircle2 size={16} />
                        <span>Link Dispatched</span>
                      </div>
                      <p>A password reset link was successfully dispatched to <strong className="font-bold">{resetEmail}</strong>.</p>
                      <p className="opacity-80">Please check your email folders and spam box.</p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      fullWidth
                      onClick={() => {
                        setIsResetMode(false)
                        setResetSuccess(false)
                        setResetEmail('')
                      }}
                      className="text-xs font-semibold py-2.5"
                    >
                      Return to Login
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Input
                      label="Registered Email"
                      type="email"
                      placeholder="you@lexmedia.com"
                      leftIcon={<Mail size={16} />}
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    />

                    <div className="flex flex-col gap-2 pt-1">
                      <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        loading={isResetLoading}
                        className="font-bold py-3 text-xs shadow-md transition-all duration-150"
                        style={{ backgroundColor: brandButtonBg, color: brandButtonText }}
                      >
                        {isResetLoading ? 'Sending Link...' : 'Send Password Reset Link'}
                      </Button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(false)
                          setAuthError('')
                        }}
                        className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors py-2 font-semibold"
                      >
                        <ArrowLeft size={13} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            ) : (
              /* STANDARD LOGIN MODE */
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="staff@lexmedia.com"
                  leftIcon={<Mail size={16} />}
                  error={errors.email?.message}
                  autoComplete="email"
                  required
                  className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white h-10 rounded-lg text-xs"
                  {...register('email')}
                />

                <div className="space-y-1.5">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    leftIcon={<Lock size={16} />}
                    error={errors.password?.message}
                    autoComplete="current-password"
                    required
                    className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white h-10 rounded-lg text-xs"
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-gray-650 dark:hover:text-gray-300 transition-colors p-1"
                        tabIndex={-1}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    }
                    {...register('password')}
                  />
                </div>

                <div className="flex items-center justify-between pt-1 select-none">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      {...register('rememberMe')}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Remember me for 7 days</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true)
                      setAuthError('')
                    }}
                    className="text-xs hover:underline font-bold"
                    style={{ color: brandAccent }}
                  >
                    Forgot Password?
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isSubmitting}
                  className="mt-3 font-bold py-3 text-xs shadow-md transition-all duration-150"
                  disabled={isGoogleLoading}
                  style={{ backgroundColor: brandButtonBg, color: brandButtonText }}
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In with Email'}
                </Button>
              </form>
            )}

            {!isResetMode && (
              <>
                {/* Modern subtle divider */}
                <div className="relative my-7 flex items-center justify-center">
                  <div className="border-t border-gray-200/80 dark:border-gray-800 w-full" />
                  <span className="absolute bg-white dark:bg-gray-900 px-4 text-[9px] uppercase tracking-widest text-gray-400 font-bold whitespace-nowrap">
                    Or continue with
                  </span>
                  <div className="border-t border-gray-200/80 dark:border-gray-800 w-full" />
                </div>

                {/* Enhanced Premium Google Button */}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    fullWidth
                    loading={isGoogleLoading}
                    disabled={isSubmitting}
                    onClick={handleGoogleLogin}
                    className="relative flex items-center justify-center gap-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 font-bold text-xs py-3 rounded-xl shadow-xs transition-all duration-150 hover:border-gray-300 hover:shadow-md"
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
                        <path d="M1 1h22v22H1z" fill="none" />
                      </svg>
                    )}
                    <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                  </Button>
                </div>
              </>
            )}

            {/* Protected Warning Text */}
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-6 leading-relaxed font-medium">
              Private access restricted to authorized staff only.
              <br />
              All login events are securely logged and audited.
            </p>
          </div>

          {/* Footer Copyright */}
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-8 font-medium">
            © {new Date().getFullYear()} {branding?.businessName || 'Lexmedia'}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginFormContent />
    </Suspense>
  )
}
