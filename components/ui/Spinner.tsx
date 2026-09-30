import React from 'react'
import { cn } from '@/lib/utils'
import { TrimPathLogo } from './TrimPathLogo'

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  color?: string
}

const sizeClasses = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
}

export function Spinner({ size = 'md', className, color }: SpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-current border-t-transparent',
        sizeClasses[size],
        color ?? 'text-accent-500',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

// ─── Full-page loader ────────────────────────────────────────
export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F19] text-white p-4 font-sans select-none animate-fade-in transition-opacity duration-300">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs mx-auto">
        {/* SVG Trim-Path Logo Animation */}
        <TrimPathLogo size="lg" animated={true} />

        {/* Brand Label & Loading State */}
        <div className="space-y-1.5 pt-1">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white font-mono">
            LEXMEDIA<span className="text-indigo-400">.GH</span>
          </h1>
          <p className="text-xs font-semibold tracking-widest text-indigo-200/80 uppercase animate-pulse">
            Loading LEXMEDIA.GH...
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton Loader ─────────────────────────────────────────
interface SkeletonProps {
  className?: string
  rounded?: string
}

export function Skeleton({ className, rounded = 'rounded-lg' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200',
        rounded,
        className
      )}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
