'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App runtime error caught by boundary:', error)
  }, [error])

  // Re-throw Next.js internal navigation and 404 signals so Next.js routing functions properly
  if (
    error?.digest?.startsWith('NEXT_REDIRECT') ||
    error?.message?.includes('NEXT_REDIRECT') ||
    error?.digest?.startsWith('NEXT_NOT_FOUND') ||
    error?.message?.includes('NEXT_NOT_FOUND')
  ) {
    throw error
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          An unexpected error occurred while loading this view. You can reload the state or return to the main dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 h-11 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} />
            <span>Try Again</span>
          </button>
          <Link
            href="/dashboard"
            className="flex-1 h-11 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Home size={14} />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
