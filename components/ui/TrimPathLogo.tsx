'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useBranding } from '@/lib/contexts/BrandingContext'
import {
  resolveAuthoritativeSplashLogoUrl,
  resolveDisplayBrandName,
} from '@/lib/branding/logo-resolver'

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
  const { branding, isReady } = useBranding()
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [showNeutralWaitSpinner, setShowNeutralWaitSpinner] = useState(false)

  const activeLogoUrl = resolveAuthoritativeSplashLogoUrl(branding)
  const displayBrandName = resolveDisplayBrandName(branding)
  const hasLoadFailed = Boolean(activeLogoUrl && failedUrl === activeLogoUrl)
  const isLogoDecoded = Boolean(activeLogoUrl && loadedUrl === activeLogoUrl)

  useEffect(() => {
    if (!activeLogoUrl || hasLoadFailed) return

    // Check immediately if browser already preloaded / cached the image
    const currentEl = imgRef.current
    if (currentEl && currentEl.complete && currentEl.naturalWidth > 0) {
      setLoadedUrl(activeLogoUrl)
      setShowNeutralWaitSpinner(false)
      return
    }

    let cancelled = false
    const waitTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowNeutralWaitSpinner(true)
      }
    }, 180)

    const preloader = new window.Image()
    preloader.decoding = 'sync'
    preloader.onload = () => {
      if (!cancelled) {
        window.clearTimeout(waitTimer)
        setLoadedUrl(activeLogoUrl)
        setShowNeutralWaitSpinner(false)
      }
    }
    preloader.onerror = () => {
      if (!cancelled) {
        window.clearTimeout(waitTimer)
        setFailedUrl(activeLogoUrl)
        setShowNeutralWaitSpinner(false)
      }
    }
    preloader.src = activeLogoUrl

    if (preloader.complete && preloader.naturalWidth > 0) {
      window.clearTimeout(waitTimer)
      setLoadedUrl(activeLogoUrl)
      setShowNeutralWaitSpinner(false)
    }

    return () => {
      cancelled = true
      window.clearTimeout(waitTimer)
    }
  }, [activeLogoUrl, hasLoadFailed])

  // If branding or image failed to load, render a strictly neutral loading indicator (never a mockup icon)
  if (!isReady || hasLoadFailed || !activeLogoUrl) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center gap-3 ${className}`}
        role="status"
        aria-label="Loading application"
      >
        <div className="w-9 h-9 rounded-full border-[2.5px] border-slate-700 border-t-slate-300 animate-spin" />
        <span className="text-xs font-medium tracking-wide text-slate-400">Loading...</span>
      </div>
    )
  }

  return (
    <div className={`relative flex flex-col items-center justify-center gap-3 ${className}`}>
      {/* Preloaded authoritative LexMedia logo with intended bounce animation */}
      <div
        className={`${
          animated && isLogoDecoded ? 'animate-bounce motion-reduce:animate-none' : ''
        } flex items-center justify-center`}
      >
        <img
          ref={imgRef}
          src={activeLogoUrl}
          alt={`${displayBrandName} logo`}
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLoadedUrl(activeLogoUrl)
            setShowNeutralWaitSpinner(false)
          }}
          onError={() => {
            setFailedUrl(activeLogoUrl)
            setShowNeutralWaitSpinner(false)
          }}
          className={`${sizeDimensions[size]} object-contain select-none pointer-events-none transition-opacity duration-150 ${
            isLogoDecoded ? 'opacity-100' : 'opacity-0 absolute'
          }`}
        />
        {!isLogoDecoded && showNeutralWaitSpinner && (
          <div
            className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-slate-300 animate-spin"
            aria-hidden="true"
          />
        )}
      </div>
      <span
        className={`text-sm font-bold tracking-tight text-slate-300 transition-opacity duration-150 ${
          isLogoDecoded ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {displayBrandName}
      </span>
    </div>
  )
}
