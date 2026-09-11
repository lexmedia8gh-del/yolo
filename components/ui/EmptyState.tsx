import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number | string; className?: string }>
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    variant?: 'primary' | 'secondary' | 'outline'
  }
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30',
        className
      )}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center mb-3.5 shrink-0">
          <Icon size={22} className="stroke-[1.75]" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          <Button
            size="sm"
            variant={action.variant || 'primary'}
            icon={action.icon}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
