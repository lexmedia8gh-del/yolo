'use client'

import React, { useState } from 'react'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import {
  AUTHORITATIVE_LEXMEDIA_LOGO,
  resolveDisplayBrandName,
} from '@/lib/branding/logo-resolver'
import { cn } from '@/lib/utils'

interface BrandLogoLockupProps {
  subtitle?: string
  variant?: 'adaptive' | 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CONFIG = {
  sm: {
    box: 'h-7 min-w-[28px] max-w-[76px]',
    img: 'max-h-7 w-auto max-w-[76px]',
    title: 'text-[13px]',
    subtitle: 'text-[11px]',
    gap: 'gap-2',
  },
  md: {
    box: 'h-8 min-w-[32px] max-w-[88px]',
    img: 'max-h-8 w-auto max-w-[88px]',
    title: 'text-sm',
    subtitle: 'text-[11px]',
    gap: 'gap-2.5',
  },
  lg: {
    box: 'h-10 min-w-[38px] max-w-[104px]',
    img: 'max-h-10 w-auto max-w-[104px]',
    title: 'text-[17px]',
    subtitle: 'text-xs',
    gap: 'gap-3',
  },
} as const

/**
 * Shared brand identity lockup displaying the saved logo from Branding Settings
 * (or the committed LexMedia brand mark asset) beside `lexmedia.gh` and optional subtitle.
 * Never renders a fabricated/generic placeholder icon.
 */
export function BrandLogoLockup({
  subtitle,
  variant = 'adaptive',
  size = 'md',
  className,
}: BrandLogoLockupProps) {
  const { branding } = useBranding()
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})

  const dims = SIZE_CONFIG[size]

  const mainLogoUrl = sanitizeBrandingLogoUrl(branding.logoUrl, branding.logoStoragePath)
  const lightLogoUrl = sanitizeBrandingLogoUrl(
    branding.logoLightUrl,
    branding.logoLightStoragePath
  )
  const faviconLogoUrl = sanitizeBrandingLogoUrl(branding.faviconUrl, branding.faviconStoragePath)

  const canShowMain = Boolean(mainLogoUrl && !failedUrls[mainLogoUrl])
  const canShowLight = Boolean(lightLogoUrl && !failedUrls[lightLogoUrl])
  const canShowFavicon = Boolean(faviconLogoUrl && !failedUrls[faviconLogoUrl])
  const canShowStaticMark = !failedUrls[AUTHORITATIVE_LEXMEDIA_LOGO]

  const markFailed = (url: string) => {
    if (!url) return
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }

  const displayBrandName = resolveDisplayBrandName(branding)

  const renderSingleImage = (url: string) => (
    <div className={cn(dims.box, 'flex items-center justify-center shrink-0')}>
      <img
        src={url}
        alt={`${displayBrandName} logo`}
        loading="eager"
        decoding="sync"
        referrerPolicy="no-referrer"
        onError={() => markFailed(url)}
        className={cn(dims.img, 'object-contain select-none')}
      />
    </div>
  )

  const renderLogoGraphic = () => {
    if (variant === 'light') {
      const lightPreferred = canShowMain
        ? mainLogoUrl
        : canShowFavicon
        ? faviconLogoUrl
        : canShowStaticMark
        ? AUTHORITATIVE_LEXMEDIA_LOGO
        : canShowLight
        ? lightLogoUrl
        : ''

      return lightPreferred ? renderSingleImage(lightPreferred) : null
    }

    if (variant === 'dark') {
      const darkPreferred = canShowLight
        ? lightLogoUrl
        : canShowMain
        ? mainLogoUrl
        : canShowStaticMark
        ? AUTHORITATIVE_LEXMEDIA_LOGO
        : ''

      return darkPreferred ? renderSingleImage(darkPreferred) : null
    }

    // Adaptive mode (light & dark themes)
    if (canShowMain && canShowLight && mainLogoUrl !== lightLogoUrl) {
      return (
        <div className={cn(dims.box, 'flex items-center justify-center shrink-0')}>
          <img
            src={mainLogoUrl}
            alt={`${displayBrandName} logo`}
            loading="eager"
            decoding="sync"
            referrerPolicy="no-referrer"
            onError={() => markFailed(mainLogoUrl)}
            className={cn(dims.img, 'object-contain dark:hidden select-none')}
          />
          <img
            src={lightLogoUrl}
            alt={`${displayBrandName} logo`}
            loading="eager"
            decoding="sync"
            referrerPolicy="no-referrer"
            onError={() => markFailed(lightLogoUrl)}
            className={cn(dims.img, 'object-contain hidden dark:block select-none')}
          />
        </div>
      )
    }

    const activeSingleUrl = canShowMain
      ? mainLogoUrl
      : canShowLight
      ? lightLogoUrl
      : canShowFavicon
      ? faviconLogoUrl
      : canShowStaticMark
      ? AUTHORITATIVE_LEXMEDIA_LOGO
      : ''

    return activeSingleUrl ? renderSingleImage(activeSingleUrl) : null
  }

  return (
    <div className={cn('font-sans flex items-center min-w-0', dims.gap, className)}>
      {renderLogoGraphic()}
      <div className="min-w-0 text-left">
        <span
          className={cn(
            'font-bold tracking-[-0.015em] block leading-tight truncate',
            dims.title,
            variant === 'dark'
              ? 'text-slate-100'
              : variant === 'light'
              ? 'text-[#0F172A]'
              : 'text-[#0F172A] dark:text-slate-100'
          )}
        >
          {displayBrandName}
        </span>
        {subtitle && (
          <span
            className={cn(
              'font-medium block leading-tight truncate mt-0.5',
              dims.subtitle,
              variant === 'dark'
                ? 'text-slate-400'
                : variant === 'light'
                ? 'text-[#64748B]'
                : 'text-[#64748B] dark:text-slate-400'
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
