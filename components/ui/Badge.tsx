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
  default: 'bg-gray-50 text-gray-700 border border-gray-200',
  status: '',
  accent: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200',
  muted: 'bg-gray-50 text-gray-600 border border-gray-200',
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
