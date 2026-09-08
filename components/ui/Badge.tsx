import React from 'react'
import { cn, getStatusColor } from '@/lib/utils'

type BadgeVariant = 'default' | 'status' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  className?: string
  // If using status, pass the status string and it auto-colors
  status?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
  status: '',
  accent: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60',
  success: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
  warning: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
  danger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60',
  muted: 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-[11px] px-2 py-0.5 rounded-full font-medium',
  md: 'text-xs px-2.5 py-0.5 rounded-full font-medium',
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  status,
}: BadgeProps) {
  const colorClass =
    variant === 'status' && status
      ? getStatusColor(status)
      : variantClasses[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium whitespace-nowrap',
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      )}
      {children}
    </span>
  )
}

// ─── Status Badge (convenience wrapper) ──────────────────────
export function StatusBadge({
  status,
  size = 'md',
}: {
  status: string
  size?: BadgeSize
}) {
  return (
    <Badge variant="status" status={status} dot size={size}>
      {status}
    </Badge>
  )
}
