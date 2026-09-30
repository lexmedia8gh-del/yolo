'use client'

import React, { useState, useEffect } from 'react'
import { getDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BrandingSettings } from '@/lib/types'

interface TrimPathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  animated?: boolean
}

const sizeDimensions = {
  sm: 'w-[70px] h-[70px] sm:w-[90px] sm:h-[90px]',
  md: 'w-[80px] h-[80px] sm:w-[110px] sm:h-[110px]',
  lg: 'w-[90px] h-[90px] sm:w-[120px] sm:h-[120px]', // Exact match: 90px mobile, 120px desktop
  xl: 'w-[110px] h-[110px] sm:w-[140px] sm:h-[140px]',
}

export function TrimPathLogo({
  size = 'lg',
  className = '',
  animated = true,
}: TrimPathLogoProps) {
  const [branding, setBranding] = useState<BrandingSettings | null>(null)

  useEffect(() => {
    async function loadBranding() {
      try {
        const doc = await getDocument<BrandingSettings>(COLLECTIONS.SETTINGS, 'branding')
        if (doc) {
          setBranding(doc)
        }
      } catch (err) {
        console.warn('Failed to load branding in logo loader:', err)
      }
    }
    loadBranding()
  }, [])

  // Exact fallback logo path found in public uploads
  const defaultLogo = '/uploads/branding/logo/1788576626544_Untitled-1.png'
  const finalLogoUrl = branding?.logoLightUrl || branding?.logoUrl || defaultLogo

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <style jsx>{`
        @keyframes floatUpDown {
          0% {
            transform: translateY(0px);
          }
          22% {
            transform: translateY(-10px);
          }
          28% {
            transform: translateY(-10px);
          }
          50% {
            transform: translateY(0px);
          }
          72% {
            transform: translateY(10px);
          }
          78% {
            transform: translateY(10px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        .brand-logo-img {
          animation: ${animated ? 'floatUpDown 3s cubic-bezier(0.445, 0.05, 0.55, 0.95) infinite' : 'none'};
          user-select: none;
          pointer-events: none;
          display: block;
        }

        @media (prefers-reduced-motion: reduce) {
          .brand-logo-img {
            animation: none !important;
          }
        }
      `}</style>

      {/* PIXEL-IDENTICAL LOGO ASSET */}
      <img
        src={finalLogoUrl}
        alt="LexMedia Logo"
        className={`${sizeDimensions[size]} object-contain brand-logo-img`}
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
