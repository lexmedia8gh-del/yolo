'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 antialiased font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Application error</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            A critical application error occurred. Please try reloading the application.
          </p>
          <button
            onClick={() => reset()}
            className="w-full h-11 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} />
            <span>Reload Application</span>
          </button>
        </div>
      </body>
    </html>
  )
}
