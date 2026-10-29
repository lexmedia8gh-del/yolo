'use client'

import React, { useState } from 'react'
import { Layers } from 'lucide-react'
import { useBranding } from '@/lib/contexts/BrandingContext'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'

interface TrimPathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  animated?: boolean
}

const sizeDimensions = {
  sm: 'w-[70px] h-[70px] sm:w-[90px] sm:h-[90px]',
  md: 'w-[80px] h-[80px] sm:w-[110px] sm:h-[110px]',
  lg: 'w-[90px] h-[90px] sm:w-[120px] sm:h-[120px]',
  xl: 'w-[110px] h-[110px] sm:w-[140px] sm:h-[140px]',
}

export function TrimPathLogo({
  size = 'lg',
  className = '',
  animated = true,
}: TrimPathLogoProps) {
  const { branding } = useBranding()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const lightLogo = sanitizeBrandingLogoUrl(branding.logoLightUrl, branding.logoLightStoragePath)
  const mainLogo = sanitizeBrandingLogoUrl(branding.logoUrl, branding.logoStoragePath)
  const activeLogoUrl = lightLogo || mainLogo
  const showImage = Boolean(activeLogoUrl && failedUrl !== activeLogoUrl)

  return (
    <div className={`relative flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className={animated ? 'animate-bounce motion-reduce:animate-none' : ''}>
        {showImage ? (
          <img
            src={activeLogoUrl}
            alt="lexmedia.gh logo"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(activeLogoUrl)}
            className={`${sizeDimensions[size]} object-contain select-none pointer-events-none`}
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 text-blue-400 flex items-center justify-center shadow-lg">
            <Layers size={30} strokeWidth={2.2} />
          </div>
        )}
      </div>
      <span className="text-sm font-bold tracking-tight text-slate-300">lexmedia.gh</span>
    </div>
  )
}
