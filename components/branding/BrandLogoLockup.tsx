'use client'

import React, { useState } from 'react'
import { Layers } from 'lucide-react'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import { cn } from '@/lib/utils'

const STATIC_LEXMEDIA_MARK = '/uploads/branding/logo/1788576626544_Untitled-1.png'

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
    fallbackBox: 'w-7 h-7 rounded-lg',
    iconSize: 15,
    title: 'text-[13px]',
    subtitle: 'text-[11px]',
    gap: 'gap-2',
  },
  md: {
    box: 'h-8 min-w-[32px] max-w-[88px]',
    img: 'max-h-8 w-auto max-w-[88px]',
    fallbackBox: 'w-8 h-8 rounded-lg',
    iconSize: 16,
    title: 'text-sm',
    subtitle: 'text-[11px]',
    gap: 'gap-2.5',
  },
  lg: {
    box: 'h-10 min-w-[38px] max-w-[104px]',
    img: 'max-h-10 w-auto max-w-[104px]',
    fallbackBox: 'w-10 h-10 rounded-xl',
    iconSize: 18,
    title: 'text-[17px]',
    subtitle: 'text-xs',
    gap: 'gap-3',
  },
} as const

/**
 * Shared brand identity lockup displaying the saved logo from Branding Settings
 * (or the committed LexMedia brand mark asset) beside `lexmedia.gh` and optional subtitle.
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
  const canShowStaticMark = !failedUrls[STATIC_LEXMEDIA_MARK]

  const markFailed = (url: string) => {
    if (!url) return
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }

  const rawBrandName = (branding.businessName || '').trim()
  const displayBrandName =
    rawBrandName && rawBrandName.toLowerCase() !== 'lexmedia'
      ? rawBrandName
      : 'lexmedia.gh'

  const renderSingleImage = (url: string) => (
    <div className={cn(dims.box, 'flex items-center justify-center shrink-0')}>
      <img
        src={url}
        alt={`${displayBrandName} logo`}
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
        ? STATIC_LEXMEDIA_MARK
        : canShowLight
        ? lightLogoUrl
        : ''

      if (lightPreferred) {
        return renderSingleImage(lightPreferred)
      }

      return (
        <div
          className={cn(
            dims.fallbackBox,
            'bg-[#1D63ED] text-white flex items-center justify-center shadow-xs shrink-0'
          )}
        >
          <Layers size={dims.iconSize} strokeWidth={2.2} />
        </div>
      )
    }

    if (variant === 'dark') {
      const darkPreferred = canShowLight
        ? lightLogoUrl
        : canShowMain
        ? mainLogoUrl
        : canShowStaticMark
        ? STATIC_LEXMEDIA_MARK
        : ''

      if (darkPreferred) {
        return renderSingleImage(darkPreferred)
      }

      return (
        <div
          className={cn(
            dims.fallbackBox,
            'bg-slate-900/90 border border-slate-800 text-blue-400 flex items-center justify-center shadow-xs shrink-0'
          )}
        >
          <Layers size={dims.iconSize} strokeWidth={2.2} />
        </div>
      )
    }

    // Adaptive mode (light & dark themes)
    if (canShowMain && canShowLight && mainLogoUrl !== lightLogoUrl) {
      return (
        <div className={cn(dims.box, 'flex items-center justify-center shrink-0')}>
          <img
            src={mainLogoUrl}
            alt={`${displayBrandName} logo`}
            referrerPolicy="no-referrer"
            onError={() => markFailed(mainLogoUrl)}
            className={cn(dims.img, 'object-contain dark:hidden select-none')}
          />
          <img
            src={lightLogoUrl}
            alt={`${displayBrandName} logo`}
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
      ? STATIC_LEXMEDIA_MARK
      : ''

    if (activeSingleUrl) {
      return renderSingleImage(activeSingleUrl)
    }

    return (
      <div
        className={cn(
          dims.fallbackBox,
          'bg-gray-900 dark:bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0'
        )}
      >
        <Layers size={dims.iconSize} strokeWidth={2.2} />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center min-w-0', dims.gap, className)}>
      {renderLogoGraphic()}
      <div className="min-w-0 text-left">
        <span
          className={cn(
            'font-bold tracking-tight block leading-tight truncate',
            dims.title,
            variant === 'dark'
              ? 'text-slate-100'
              : variant === 'light'
              ? 'text-[#0F172A]'
              : 'text-gray-900 dark:text-gray-100'
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
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
