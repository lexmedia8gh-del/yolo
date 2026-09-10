'use client'

import React, { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock, Zap, AlertCircle, ShieldCheck, Sparkles, Layers } from 'lucide-react'
import { signInWithEmail, signInWithGoogle } from '@/lib/firebase/auth'
import { getFirebaseErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'

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

  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
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

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-12 bg-white dark:bg-gray-950 font-sans selection:bg-indigo-500 selection:text-white">
      {/* LEFT SIDE — BRAND EXPERIENCE (45-50%) */}
      <div className="hidden lg:flex lg:col-span-6 relative overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-12 xl:p-16 flex-col justify-between">
        {/* Subtle background glow/mesh elements */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/80 backdrop-blur-md border border-indigo-400/30 flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-wider text-white block leading-none">CTRL ROOM</span>
            <span className="text-[11px] text-indigo-300 tracking-widest uppercase font-medium">LexMedia Workspace</span>
          </div>
        </div>

        {/* Center Hero Message */}
        <div className="relative z-10 my-auto space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/25 text-indigo-300 text-xs font-semibold backdrop-blur-sm">
            <Sparkles size={13} className="text-indigo-400" />
            <span>Creative Agency & Client Operations Platform</span>
          </div>
          
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
            Everything your creative business needs, in one place.
          </h1>
          
          <p className="text-indigo-200/90 text-base leading-relaxed">
            Manage clients, projects, payments, deliverables and your creative workflow from one powerful workspace designed for modern agencies.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-800/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
                <ShieldCheck size={16} />
              <div>
                <p className="text-xs font-semibold text-white">Secure Portals</p>
                <p className="text-[11px] text-indigo-300/80">Encrypted deliverables</p>
              </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
                <Layers size={16} />
              <div>
                <p className="text-xs font-semibold text-white">Real-Time Sync</p>
                <p className="text-[11px] text-indigo-300/80">Instant cloud updates</p>
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Trust Statement */}
        <div className="relative z-10 pt-6 border-t border-indigo-900/80 flex items-center justify-between text-xs text-indigo-300/70">
          <span>Protected by enterprise-grade Firebase security</span>
          <span className="font-mono">v2.5 Pro</span>
        </div>
      </div>

      {/* RIGHT SIDE — LOGIN FORM */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-12 xl:p-16 bg-gray-50/50 dark:bg-gray-950">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Zap size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900 dark:text-white leading-none">CTRL ROOM</h1>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-widest font-semibold">Lexmedia Workspace</span>
            </div>
          </div>

          {/* Refined Login Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 p-8 sm:p-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Welcome back</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                Sign in to continue to your workspace.
              </p>
            </div>

            {/* Error Banner */}
            {authError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 mb-6 animate-shake">
                <AlertCircle size={18} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 font-medium leading-relaxed">{authError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="admin@lexmedia.com"
                leftIcon={<Mail size={16} />}
                error={errors.email?.message}
                autoComplete="email"
                required
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                {...register('email')}
              />

              <div className="space-y-1.5">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  leftIcon={<Lock size={16} />}
                  error={errors.password?.message}
                  autoComplete="current-password"
                  required
                  className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                  {...register('password')}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                    {...register('rememberMe')}
                  />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">Remember me for 7 days</span>
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 shadow-md shadow-indigo-600/20 transition-all"
                disabled={isGoogleLoading}
              >
                {isSubmitting ? 'Signing in...' : 'Sign In with Email'}
              </Button>
            </form>

            <div className="my-6 flex items-center justify-center">
              <div className="border-t border-gray-200 dark:border-gray-800 w-full" />
              <span className="absolute bg-white dark:bg-gray-900 px-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                Or continue with
              </span>
              <div className="border-t border-gray-200 dark:border-gray-800 w-full" />
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                fullWidth
                loading={isGoogleLoading}
                disabled={isSubmitting}
                onClick={handleGoogleLogin}
                className="relative flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 font-medium py-3 shadow-xs transition-all"
              >
                {!isGoogleLoading && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                {isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}
              </Button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6 leading-relaxed">
              Private system for authorized Lexmedia staff only.
              <br />
              Unauthorized access is strictly prohibited.
            </p>
          </div>

          {/* Footer Copyright */}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-8">
            © {new Date().getFullYear()} Lexmedia Inc. All rights reserved.
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
