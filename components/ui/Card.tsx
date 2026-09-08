import React from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingClasses = {
  none: '',
  sm: 'p-3.5',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({
  className,
  children,
  glass = false,
  hover = false,
  padding = 'md',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200/80 dark:border-gray-800/90 bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100',
        hover && 'transition-all duration-150 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow',
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Card sub-components
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  action?: React.ReactNode
}

export function CardHeader({
  title,
  subtitle,
  action,
  children,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between gap-4 mb-6', className)}
      {...props}
    >
      {(title || subtitle) && (
        <div>
          {title && (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          {subtitle && (
            <p className="text-sm text-muted dark:text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      {children}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 mt-6 pt-4 border-t border-border dark:border-gray-800',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Divider inside card
export function CardDivider({ className }: { className?: string }) {
  return <div className={cn('border-t border-border dark:border-gray-800 my-4', className)} />
}
