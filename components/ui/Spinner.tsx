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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F19] select-none animate-fade-in transition-opacity duration-300">
      <TrimPathLogo size="lg" animated={true} />
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
