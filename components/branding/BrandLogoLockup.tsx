'use client'

import React, { useState } from 'react'
import { Layers } from 'lucide-react'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import { cn } from '@/lib/utils'

interface BrandLogoLockupProps {
  subtitle?: string
  variant?: 'adaptive' | 'dark'
  className?: string
}

/**
 * Shared brand identity lockup displaying the saved logo from Branding Settings
 * beside the brand name `lexmedia.gh` and optional subtitle.
 * Never renders legacy "LM" initials; falls back to a clean geometric mark if no logo is configured.
 */
export function BrandLogoLockup({
  subtitle,
  variant = 'adaptive',
  className,
}: BrandLogoLockupProps) {
  const { branding } = useBranding()
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})

  const mainLogoUrl = sanitizeBrandingLogoUrl(branding.logoUrl, branding.logoStoragePath)
  const lightLogoUrl = sanitizeBrandingLogoUrl(
    branding.logoLightUrl,
    branding.logoLightStoragePath
  )

  const canShowMain = Boolean(mainLogoUrl && !failedUrls[mainLogoUrl])
  const canShowLight = Boolean(lightLogoUrl && !failedUrls[lightLogoUrl])

  const markFailed = (url: string) => {
    if (!url) return
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }

  const renderLogoGraphic = () => {
    if (variant === 'dark') {
      const darkPreferred = canShowLight ? lightLogoUrl : canShowMain ? mainLogoUrl : ''
      if (darkPreferred) {
        return (
          <div className="h-8 min-w-[32px] max-w-[88px] flex items-center justify-center shrink-0">
            <img
              src={darkPreferred}
              alt="lexmedia.gh logo"
              referrerPolicy="no-referrer"
              onError={() => markFailed(darkPreferred)}
              className="max-h-8 w-auto max-w-[88px] object-contain"
            />
          </div>
        )
      }

      return (
        <div className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-800 text-blue-400 flex items-center justify-center shadow-xs shrink-0">
          <Layers size={16} strokeWidth={2.2} />
        </div>
      )
    }

    // Adaptive mode (light & dark themes)
    if (canShowMain && canShowLight && mainLogoUrl !== lightLogoUrl) {
      return (
        <div className="h-8 min-w-[32px] max-w-[88px] flex items-center justify-center shrink-0">
          <img
            src={mainLogoUrl}
            alt="lexmedia.gh logo"
            referrerPolicy="no-referrer"
            onError={() => markFailed(mainLogoUrl)}
            className="max-h-8 w-auto max-w-[88px] object-contain dark:hidden"
          />
          <img
            src={lightLogoUrl}
            alt="lexmedia.gh logo"
            referrerPolicy="no-referrer"
            onError={() => markFailed(lightLogoUrl)}
            className="max-h-8 w-auto max-w-[88px] object-contain hidden dark:block"
          />
        </div>
      )
    }

    const activeSingleUrl = canShowMain ? mainLogoUrl : canShowLight ? lightLogoUrl : ''
    if (activeSingleUrl) {
      return (
        <div className="h-8 min-w-[32px] max-w-[88px] flex items-center justify-center shrink-0">
          <img
            src={activeSingleUrl}
            alt="lexmedia.gh logo"
            referrerPolicy="no-referrer"
            onError={() => markFailed(activeSingleUrl)}
            className="max-h-8 w-auto max-w-[88px] object-contain"
          />
        </div>
      )
    }

    return (
      <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
        <Layers size={16} strokeWidth={2.2} />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      {renderLogoGraphic()}
      <div className="min-w-0">
        <span
          className={cn(
            'font-bold text-sm tracking-tight block leading-tight truncate',
            variant === 'dark'
              ? 'text-slate-100'
              : 'text-gray-900 dark:text-gray-100'
          )}
        >
          lexmedia.gh
        </span>
        {subtitle && (
          <span
            className={cn(
              'text-[11px] font-medium block leading-tight truncate',
              variant === 'dark'
                ? 'text-slate-400'
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
