import React from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<any>
  iconColor?: string
  iconBg?: string
  trend?: {
    value: number
    label?: string
    direction: 'up' | 'down' | 'neutral'
  }
  loading?: boolean
  className?: string
  onClick?: () => void
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-accent-600',
  iconBg = 'bg-accent-50',
  trend,
  loading = false,
  className,
  onClick,
}: StatCardProps) {
  const trendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  }[trend?.direction ?? 'neutral']

  const trendColor = {
    up: 'text-success-600',
    down: 'text-danger-600',
    neutral: 'text-muted',
  }[trend?.direction ?? 'neutral']

  const TrendIcon = trendIcon

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm',
        'transition-all duration-150',
        onClick && 'cursor-pointer hover:border-gray-300 hover:shadow',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider truncate">
            {title}
          </p>
          {loading ? (
            <div className="mt-2 h-7 w-20 rounded-md bg-gray-100 animate-pulse" />
          ) : (
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-gray-900 truncate">
              {value}
            </p>
          )}
          {subtitle && !loading && (
            <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>
          )}
          {trend && !loading && (
            <div className={cn('flex items-center gap-1 mt-1.5', trendColor)}>
              <TrendIcon size={12} />
              <span className="text-xs font-medium">
                {Math.abs(trend.value)}%{' '}
                {trend.label ?? (trend.direction === 'up' ? 'increase' : 'decrease')}
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'p-2 rounded-lg shrink-0 border border-gray-100',
            iconBg
          )}
        >
          <Icon size={16} className={iconColor} />
        </div>
      </div>
    </div>
  )
}

// ─── Stats Grid ───────────────────────────────────────────────
export function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {children}
    </div>
  )
}
