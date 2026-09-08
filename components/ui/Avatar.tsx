import React from 'react'
import Image from 'next/image'
import { cn, getInitials } from '@/lib/utils'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  name: string
  src?: string | null
  size?: AvatarSize
  className?: string
  ring?: boolean
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
}

const colorPalette = [
  'bg-accent-100 text-accent-700',
  'bg-success-100 text-success-700',
  'bg-warning-100 text-warning-600',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-cyan-100 text-cyan-700',
]

function getColorForName(name: string): string {
  const idx = name.charCodeAt(0) % colorPalette.length
  return colorPalette[idx]
}

export function Avatar({ name, src, size = 'md', className, ring = false }: AvatarProps) {
  const safeName = name || 'Admin User'
  const initials = getInitials(safeName)
  const colorClass = getColorForName(safeName)
  const sizeClass = sizeClasses[size]

  if (src) {
    return (
      <div
        className={cn(
          'relative rounded-full overflow-hidden shrink-0',
          sizeClass,
          ring && 'ring-2 ring-white ring-offset-1',
          className
        )}
      >
        <Image
          src={src}
          alt={name}
          fill
          className="object-cover"
          sizes="64px"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0 select-none',
        sizeClass,
        colorClass,
        ring && 'ring-2 ring-white ring-offset-1',
        className
      )}
      aria-label={name}
    >
      {initials}
    </div>
  )
}

// ─── Avatar Group ─────────────────────────────────────────────
interface AvatarGroupProps {
  avatars: Array<{ name: string; src?: string | null }>
  max?: number
  size?: AvatarSize
}

export function AvatarGroup({ avatars, max = 3, size = 'sm' }: AvatarGroupProps) {
  const shown = avatars.slice(0, max)
  const remaining = avatars.length - max

  return (
    <div className="flex -space-x-2">
      {shown.map((a, i) => (
        <Avatar key={i} name={a.name} src={a.src} size={size} ring />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-600 ring-2 ring-white ring-offset-1 shrink-0',
            sizeClasses[size]
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}
