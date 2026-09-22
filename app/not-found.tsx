import Link from 'next/link'
import { FileQuestion, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-4">
          <FileQuestion size={24} />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">404</h1>
        <h2 className="text-base font-bold text-slate-800 mb-1">Page not found</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          The requested page or delivery resource does not exist or may have been moved.
        </p>
        <Link
          href="/dashboard"
          className="w-full h-11 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Home size={14} />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  )
}
