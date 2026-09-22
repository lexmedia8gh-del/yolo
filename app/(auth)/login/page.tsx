'use client'

import React, { useState, useEffect, Suspense } from 'react'
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

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F8FAFC] text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* ================================================== */}
      {/* LEFT SIDE — BRAND EXPERIENCE & CONTROL ROOM PREVIEW */}
      {/* ================================================== */}
      <div className="w-full lg:w-[50%] xl:w-[49%] relative flex-shrink-0 bg-[#060D1E] text-white flex flex-col justify-between p-6 sm:p-10 xl:p-14 overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800/80">
        {/* Subtle Atmospheric Lighting & Gradients */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
          {/* Soft top-left light bloom */}
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-blue-600/15 blur-[120px]" />
          {/* Subtle central radial depth */}
          <div className="absolute top-1/3 left-1/4 w-[380px] h-[380px] rounded-full bg-sky-500/10 blur-[100px]" />
          {/* Bottom right blue glow */}
          <div className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full bg-blue-700/15 blur-[110px]" />
          {/* Ambient micro grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        {/* --- Top Brand Identifier --- */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-900 border border-blue-400/30 flex items-center justify-center shadow-lg shadow-blue-950/60 p-2 shrink-0">
            {branding?.logoLightUrl || branding?.logoUrl ? (
              <img
                src={branding.logoLightUrl || branding.logoUrl}
                alt={branding.businessName || 'LexMedia'}
                className="h-6 w-auto object-contain"
              />
            ) : (
              <LexMediaEmblem className="w-6 h-6" />
            )}
          </div>
          <div>
            <span className="font-bold text-[14px] tracking-[0.14em] uppercase text-white block leading-none">
              {branding?.businessName || 'LEXMEDIA.GH'}
            </span>
            <span className="text-[9px] text-blue-300/80 tracking-[0.22em] uppercase font-semibold mt-1 block">
              {branding?.tagline || 'PROFESSIONAL DIGITAL SERVICES'}
            </span>
          </div>
        </div>

        {/* --- Center Brand Introduction & Features --- */}
        <div className="relative z-10 my-auto py-8 lg:py-6 space-y-6 max-w-xl">
          {/* Workspace Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-xs font-semibold text-blue-300 backdrop-blur-md shadow-xs">
            <Sparkles size={12} className="text-blue-400 shrink-0" />
            <span className="tracking-wide">Workspace &amp; Client Portal Ecosystem</span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-3xl sm:text-4xl xl:text-[42px] font-extrabold tracking-tight text-white leading-[1.14]">
            Everything your business needs,{' '}
            <span className="text-blue-400 font-extrabold">in one room.</span>
          </h1>

          {/* Subheading */}
          <p className="text-sm text-slate-300/85 leading-relaxed font-normal max-w-lg">
            Manage clients, projects, payments, final deliverables, and your team workflow from one central control deck.
          </p>

          {/* Four Compact Feature Blocks (Feature Strip) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            {/* Feature 1 */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-blue-500/30 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-2">
                <Users size={14} />
              </div>
              <h4 className="text-xs font-semibold text-white tracking-tight leading-tight">Client Management</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">Track &amp; support clients</p>
            </div>

            {/* Feature 2 */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-blue-500/30 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-2">
                <FolderKanban size={14} />
              </div>
              <h4 className="text-xs font-semibold text-white tracking-tight leading-tight">Project Tracking</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">Stay on top of progress</p>
            </div>

            {/* Feature 3 */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-blue-500/30 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-2">
                <CreditCard size={14} />
              </div>
              <h4 className="text-xs font-semibold text-white tracking-tight leading-tight">Payments &amp; Invoices</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">Secure &amp; automated</p>
            </div>

            {/* Feature 4 */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-blue-500/30 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-2">
                <UploadCloud size={14} />
              </div>
              <h4 className="text-xs font-semibold text-white tracking-tight leading-tight">File Delivery</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">Fast &amp; reliable</p>
            </div>
          </div>
        </div>

        {/* --- Floating Realistic Dashboard Mockup --- */}
        <div className="relative z-10 pt-2 pb-1">
          <div className="relative rounded-2xl bg-gradient-to-b from-slate-900/95 to-[#070E22]/95 border border-white/[0.12] p-4 sm:p-5 shadow-2xl shadow-black/80 backdrop-blur-xl">
            {/* Subtle top edge specular highlight */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />

            {/* Dashboard Mockup Top Bar */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center p-1 shadow-sm">
                  <LexMediaEmblem className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold tracking-wider text-white">LEXMEDIA.GH</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] text-slate-400">
                  <Search size={10} />
                  <span>Search...</span>
                </div>
                <div className="w-5 h-5 rounded-md bg-white/[0.05] flex items-center justify-center text-slate-400">
                  <Bell size={10} />
                </div>
                <div className="w-5 h-5 rounded-full bg-blue-500/30 border border-blue-400/40 text-[9px] font-bold text-white flex items-center justify-center">
                  A
                </div>
              </div>
            </div>

            {/* Dashboard Inner Layout */}
            <div className="flex gap-4">
              {/* Mini Sidebar */}
              <div className="hidden sm:flex flex-col gap-1 w-24 shrink-0 border-r border-white/[0.06] pr-2">
                <div className="px-2 py-1 rounded bg-blue-600/20 text-blue-300 text-[10px] font-semibold flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Dashboard</span>
                </div>
                <span className="px-2 py-1 text-[10px] text-slate-400 font-medium">Clients</span>
                <span className="px-2 py-1 text-[10px] text-slate-400 font-medium">Projects</span>
                <span className="px-2 py-1 text-[10px] text-slate-400 font-medium">Payments</span>
                <span className="px-2 py-1 text-[10px] text-slate-400 font-medium">Deliveries</span>
                <span className="px-2 py-1 text-[10px] text-slate-400 font-medium">Settings</span>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Greeting */}
                <div>
                  <div className="text-xs font-bold text-white">Good morning, Alex</div>
                  <div className="text-[10px] text-slate-400">Here&apos;s what&apos;s happening with your business today.</div>
                </div>

                {/* 4 Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[9px] text-slate-400 font-medium">Total Clients</div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-xs font-bold text-white">24</span>
                      <span className="text-[9px] text-emerald-400 font-semibold">+12%</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[9px] text-slate-400 font-medium">Active Projects</div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-xs font-bold text-white">18</span>
                      <span className="text-[9px] text-emerald-400 font-semibold">+8%</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[9px] text-slate-400 font-medium">Pending Payments</div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-xs font-bold text-white">6</span>
                      <span className="text-[9px] text-rose-400 font-semibold">-32%</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[9px] text-slate-400 font-medium">Delivered Files</div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="text-xs font-bold text-white">42</span>
                      <span className="text-[9px] text-emerald-400 font-semibold">+15%</span>
                    </div>
                  </div>
                </div>

                {/* Recent Projects & Mini Revenue Chart */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                  {/* Table (2 cols on sm) */}
                  <div className="sm:col-span-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Recent Projects</div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9px] py-0.5 border-b border-white/[0.04]">
                        <span className="text-white font-medium truncate max-w-[110px]">Brand Identity Design</span>
                        <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[8px] font-medium">In Progress</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] py-0.5 border-b border-white/[0.04]">
                        <span className="text-white font-medium truncate max-w-[110px]">Event Photography</span>
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-medium">Delivered</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] py-0.5">
                        <span className="text-white font-medium truncate max-w-[110px]">Social Media Graphics</span>
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[8px] font-medium">In Review</span>
                      </div>
                    </div>
                  </div>

                  {/* Revenue Curve */}
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between">
                    <div>
                      <div className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Revenue Overview</div>
                      <div className="text-[8px] text-emerald-400 font-bold mt-0.5">+24% This Month</div>
                    </div>
                    {/* SVG Sparkline Curve */}
                    <div className="h-8 w-full mt-1.5">
                      <svg viewBox="0 0 100 35" className="w-full h-full overflow-visible">
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 28 Q 15 24, 30 18 T 60 14 T 85 6 T 100 2 L 100 35 L 0 35 Z"
                          fill="url(#chartGrad)"
                        />
                        <path
                          d="M0 28 Q 15 24, 30 18 T 60 14 T 85 6 T 100 2"
                          fill="none"
                          stroke="#3B82F6"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================== */}
      {/* RIGHT SIDE — CLEAN & BRIGHT LOGIN EXPERIENCE       */}
      {/* ================================================== */}
      <div className="w-full lg:w-[50%] xl:w-[51%] relative flex flex-col justify-between p-6 sm:p-12 xl:p-16 bg-[#F8FAFC]">
        {/* Subtle Radial Blue Glow in background */}
        <div className="absolute top-1/3 right-1/4 w-[420px] h-[420px] rounded-full bg-blue-500/[0.035] blur-[100px] pointer-events-none" />

        {/* Top Header Tagline */}
        <div className="w-full flex justify-between items-center z-10">
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center p-1">
              <LexMediaEmblem className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs tracking-wider uppercase text-slate-900">
              {branding?.businessName || 'LEXMEDIA.GH'}
            </span>
          </div>
          <div className="ml-auto text-[10px] tracking-[0.25em] text-slate-400 font-semibold uppercase select-none">
            CREATE &nbsp;/&nbsp; MANAGE &nbsp;/&nbsp; DELIVER
          </div>
        </div>

        {/* Center Login Card Container */}
        <div className="my-auto py-8 flex flex-col items-center justify-center z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[460px]"
          >
            {/* Login Card */}
            <div className="bg-white rounded-[22px] border border-slate-200/80 p-8 sm:p-10 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.06),0_0_1px_1px_rgba(15,23,42,0.04)] transition-all">
              {/* Brand Logo Header */}
              <div className="flex items-center gap-3.5 mb-7">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E3A8A] border border-blue-500/20 flex items-center justify-center shadow-sm p-2 shrink-0">
                  {branding?.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt={branding.businessName || 'LexMedia'}
                      className="h-6 w-auto object-contain"
                    />
                  ) : (
                    <LexMediaEmblem className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-[14px] text-slate-900 tracking-[0.14em] uppercase leading-none">
                    {branding?.businessName || 'LEXMEDIA.GH'}
                  </h3>
                  <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-slate-500 mt-1 block">
                    {branding?.tagline || 'PROFESSIONAL DIGITAL SERVICES'}
                  </span>
                </div>
              </div>

              {/* Title & Subheading */}
              <div className="mb-6">
                <h2 className="text-2xl sm:text-[30px] font-extrabold text-slate-900 tracking-tight leading-tight">
                  {isResetMode ? (
                    'Reset password'
                  ) : (
                    <>
                      Welcome <span className="text-blue-600">back</span>
                    </>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-normal">
                  {isResetMode
                    ? 'Enter your registered email address to receive a secure password recovery link.'
                    : 'Secure sign in with your staff credentials.'}
                </p>
              </div>

              {/* Error Banner */}
              {authError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 mb-5"
                >
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 font-medium leading-relaxed">{authError}</p>
                </motion.div>
              )}

              {/* ================================================== */}
              {/* PASSWORD RESET FORM                                */}
              {/* ================================================== */}
              {isResetMode ? (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  {resetSuccess ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-medium space-y-1">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                          <CheckCircle2 size={16} />
                          <span>Recovery Link Sent</span>
                        </div>
                        <p>
                          A password reset link was dispatched to{' '}
                          <strong className="font-bold">{resetEmail}</strong>.
                        </p>
                        <p className="text-emerald-700/80">Please check your inbox and spam folder.</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(false)
                          setResetSuccess(false)
                          setResetEmail('')
                        }}
                        className="w-full h-[50px] rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        <ArrowLeft size={14} />
                        <span>Return to Sign In</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Registered Staff Email <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Mail size={16} />
                          </div>
                          <input
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="staff@lexmedia.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="w-full h-[52px] pl-11 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 hover:border-slate-300"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isResetLoading}
                        className="w-full h-[52px] rounded-xl bg-gradient-to-r from-[#0A1128] via-[#101F42] to-[#1E40AF] hover:from-[#0F1B3E] hover:to-[#2563EB] text-white font-bold text-xs tracking-wide shadow-md shadow-blue-950/20 hover:shadow-lg hover:shadow-blue-900/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {isResetLoading ? (
                          <span>Dispatching Link...</span>
                        ) : (
                          <>
                            <span>Send Password Reset Link</span>
                            <ArrowRight size={15} />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(false)
                          setAuthError('')
                        }}
                        className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-semibold py-1.5 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ArrowLeft size={13} />
                        <span>Back to Sign In</span>
                      </button>
                    </div>
                  )}
                </form>
              ) : (
                /* ================================================== */
                /* STANDARD SIGN IN FORM                              */
                /* ================================================== */
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail size={16} />
                      </div>
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="staff@lexmedia.com"
                        required
                        className={`w-full h-[52px] pl-11 pr-4 rounded-xl border bg-white text-slate-900 text-sm placeholder-slate-400 transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 hover:border-slate-300 ${
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
                    <label className="block text-xs font-semibold text-slate-700">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock size={16} />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter password"
                        required
                        className={`w-full h-[52px] pl-11 pr-11 rounded-xl border bg-white text-slate-900 text-sm placeholder-slate-400 transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 hover:border-slate-300 ${
                          errors.password ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : 'border-slate-200'
                        }`}
                        {...register('password')}
                      />
                      <button
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

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between pt-1 select-none">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                        {...register('rememberMe')}
                      />
                      <span className="text-xs text-slate-600 group-hover:text-slate-900 font-medium transition-colors">
                        Remember me for 7 days
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setIsResetMode(true)
                        setAuthError('')
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Primary Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || isGoogleLoading}
                    className="w-full h-[52px] rounded-xl bg-gradient-to-r from-[#0A1128] via-[#101F42] to-[#1E40AF] hover:from-[#0F1B3E] hover:to-[#2563EB] text-white font-bold text-xs tracking-wide shadow-md shadow-blue-950/20 hover:shadow-lg hover:shadow-blue-900/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {isSubmitting ? (
                      <span>Signing in...</span>
                    ) : (
                      <>
                        <ArrowRight size={15} />
                        <span>Sign In with Email</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Alternative Auth Provider (Google) */}
              {!isResetMode && (
                <>
                  <div className="relative my-6 flex items-center justify-center">
                    <div className="border-t border-slate-200/90 w-full" />
                    <span className="absolute bg-white px-3 text-[9px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">
                      OR CONTINUE WITH
                    </span>
                    <div className="border-t border-slate-200/90 w-full" />
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting || isGoogleLoading}
                    onClick={handleGoogleLogin}
                    className="w-full h-[52px] rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 text-slate-700 font-semibold text-xs transition-all duration-150 shadow-xs flex items-center justify-center gap-3 disabled:opacity-60 disabled:pointer-events-none"
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

              {/* Security Audit Footnote */}
              <div className="mt-7 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-center text-[10.5px] text-slate-400 font-normal leading-relaxed">
                <ShieldCheck size={13} className="text-slate-400 shrink-0" />
                <span>Private access restricted to authorized staff only.</span>
              </div>
              <p className="text-center text-[10px] text-slate-400/80 mt-0.5">
                All login events are securely logged and audited.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Bottom Decorative Element / Agency Grid Mark */}
        <div className="w-full flex items-center justify-between text-slate-400 text-[11px] font-medium z-10">
          <span>© {new Date().getFullYear()} {branding?.businessName || 'LexMedia'}. All rights reserved.</span>
          {/* Subtle architectural dot grid */}
          <div className="hidden sm:grid grid-cols-4 gap-1 opacity-50">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-slate-300" />
            ))}
          </div>
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
