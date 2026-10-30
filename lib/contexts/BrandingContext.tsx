'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import { onAuthChange } from '@/lib/firebase/auth'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import {
  BRANDING_CACHE_STORAGE_KEY,
  resolveAuthoritativeSplashLogoUrl,
} from '@/lib/branding/logo-resolver'
import type { BrandingSettings, BusinessSettings } from '@/lib/types'

export const DEFAULT_BRANDING: BrandingSettings = {
  businessName: 'lexmedia.gh',
  shortName: 'lex',
  tagline: 'Professional Digital Services',
  logoUrl: '',
  logoStoragePath: '',
  logoLightUrl: '',
  logoLightStoragePath: '',
  faviconUrl: '',
  faviconStoragePath: '',
  primaryColor: '#0F172A',
  secondaryColor: '#1D63ED',
  accentColor: '#1D63ED',
  backgroundColor: '#F8FAFC',
  surfaceColor: '#FFFFFF',
  textColor: '#0F172A',
  mutedTextColor: '#64748B',
  buttonColor: '#1D63ED',
  buttonTextColor: '#FFFFFF',
}

interface BrandingContextValue {
  branding: BrandingSettings
  loading: boolean
  isReady: boolean
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: false,
  isReady: true,
})

function sanitizeBrandingFields(
  raw: Partial<BrandingSettings>,
  fallbackLogoUrl?: string,
  fallbackLogoStoragePath?: string
): Partial<BrandingSettings> {
  const cleaned: Partial<BrandingSettings> = { ...raw }
  const primaryLogo = sanitizeBrandingLogoUrl(raw.logoUrl, raw.logoStoragePath)
  const secondaryLogo = sanitizeBrandingLogoUrl(fallbackLogoUrl, fallbackLogoStoragePath)

  if ('logoUrl' in raw || 'logoStoragePath' in raw || fallbackLogoUrl || fallbackLogoStoragePath) {
    cleaned.logoUrl = primaryLogo || secondaryLogo
    cleaned.logoStoragePath = primaryLogo
      ? raw.logoStoragePath || ''
      : fallbackLogoStoragePath || raw.logoStoragePath || ''
  }
  if ('logoLightUrl' in raw || 'logoLightStoragePath' in raw) {
    cleaned.logoLightUrl = sanitizeBrandingLogoUrl(raw.logoLightUrl, raw.logoLightStoragePath)
  }
  if ('faviconUrl' in raw || 'faviconStoragePath' in raw) {
    cleaned.faviconUrl = sanitizeBrandingLogoUrl(raw.faviconUrl, raw.faviconStoragePath)
  }
  return cleaned
}

function persistBrandingCache(branding: BrandingSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(BRANDING_CACHE_STORAGE_KEY, JSON.stringify(branding))
  } catch {}
}

function readClientCachedBranding(): Partial<BrandingSettings> | null {
  if (typeof window === 'undefined') return null
  try {
    const fsBrandRaw = localStorage.getItem('lexmedia_fs_doc_settings__branding')
    const fsBizRaw = localStorage.getItem('lexmedia_fs_doc_settings__business')
    if (fsBrandRaw || fsBizRaw) {
      const fsBrand = fsBrandRaw ? JSON.parse(fsBrandRaw) : {}
      const fsBiz = fsBizRaw ? JSON.parse(fsBizRaw) : {}
      return sanitizeBrandingFields(fsBrand, fsBiz?.logoURL, fsBiz?.logoStoragePath)
    }

    const cachedRaw = localStorage.getItem(BRANDING_CACHE_STORAGE_KEY)
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw)
      if (parsed && typeof parsed === 'object') {
        return sanitizeBrandingFields(parsed)
      }
    }
  } catch {}
  return null
}

function preloadLogoImage(url: string): void {
  if (typeof window === 'undefined' || !url) return
  try {
    const img = new window.Image()
    img.decoding = 'async'
    img.src = url
  } catch {}
}

export function BrandingProvider({
  children,
  initialBranding,
}: {
  children: React.ReactNode
  initialBranding?: BrandingSettings
}) {
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    const base = initialBranding ? { ...DEFAULT_BRANDING, ...initialBranding } : DEFAULT_BRANDING
    return base
  })
  const [loading, setLoading] = useState(!initialBranding)
  const [isReady, setIsReady] = useState(Boolean(initialBranding))

  useEffect(() => {
    let mounted = true
    let unsubBranding: (() => void) | null = null
    let unsubBusiness: (() => void) | null = null

    // Synchronously hydrate from local client branding cache if SSR had no custom logo yet
    // and client storage holds an uploaded branding setting
    const localCached = readClientCachedBranding()
    if (localCached) {
      setBranding((prev) => {
        const next = {
          ...prev,
          ...localCached,
          logoUrl: prev.logoUrl || localCached.logoUrl || '',
          logoStoragePath: prev.logoStoragePath || localCached.logoStoragePath || '',
          logoLightUrl: prev.logoLightUrl || localCached.logoLightUrl || '',
          logoLightStoragePath:
            prev.logoLightStoragePath || localCached.logoLightStoragePath || '',
          faviconUrl: prev.logoUrl ? prev.faviconUrl : localCached.faviconUrl || prev.faviconUrl,
        }
        preloadLogoImage(resolveAuthoritativeSplashLogoUrl(next))
        if (next.logoUrl) preloadLogoImage(next.logoUrl)
        return next
      })
    } else {
      preloadLogoImage(resolveAuthoritativeSplashLogoUrl(branding))
    }

    const clearDocListeners = () => {
      if (unsubBranding) {
        unsubBranding()
        unsubBranding = null
      }
      if (unsubBusiness) {
        unsubBusiness()
        unsubBusiness = null
      }
    }

    // 1. Confirm latest server branding state
    fetch('/api/branding', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.success && data?.branding) {
          const sanitized = sanitizeBrandingFields(
            data.branding,
            data?.business?.logoURL,
            data?.business?.logoStoragePath
          )
          setBranding((prev) => {
            const next = { ...prev, ...sanitized }
            persistBrandingCache(next)
            preloadLogoImage(resolveAuthoritativeSplashLogoUrl(next))
            if (next.logoUrl) preloadLogoImage(next.logoUrl)
            return next
          })
          setLoading(false)
          setIsReady(true)
        } else if (mounted) {
          setLoading(false)
          setIsReady(true)
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false)
          setIsReady(true)
        }
      })

    // 2. Attach Firestore real-time listeners once an authenticated session is active
    const unsubAuth = onAuthChange((activeUser) => {
      clearDocListeners()
      if (!mounted || !activeUser) return

      unsubBranding = subscribeToDocument<BrandingSettings>(
        COLLECTIONS.SETTINGS,
        'branding',
        (data) => {
          if (mounted && data) {
            setBranding((prev) => {
              const sanitized = sanitizeBrandingFields(data, prev.logoUrl, prev.logoStoragePath)
              const next = { ...prev, ...sanitized }
              persistBrandingCache(next)
              preloadLogoImage(resolveAuthoritativeSplashLogoUrl(next))
              if (next.logoUrl) preloadLogoImage(next.logoUrl)
              return next
            })
            setLoading(false)
            setIsReady(true)
          }
        }
      )

      unsubBusiness = subscribeToDocument<BusinessSettings>(
        COLLECTIONS.SETTINGS,
        'business',
        (bizData) => {
          if (mounted && bizData) {
            const bizLogo = sanitizeBrandingLogoUrl(bizData.logoURL, bizData.logoStoragePath)
            if (bizLogo) {
              setBranding((prev) => {
                if (prev.logoUrl) return prev
                const next = {
                  ...prev,
                  logoUrl: bizLogo,
                  logoStoragePath: bizData.logoStoragePath || prev.logoStoragePath || '',
                }
                persistBrandingCache(next)
                preloadLogoImage(resolveAuthoritativeSplashLogoUrl(next))
                return next
              })
            }
            setLoading(false)
            setIsReady(true)
          }
        }
      )
    })

    return () => {
      mounted = false
      unsubAuth()
      clearDocListeners()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cssVars = [
    `--brand-primary:${branding.primaryColor || '#0F172A'}`,
    `--brand-secondary:${branding.secondaryColor || '#1D63ED'}`,
    `--brand-accent:${branding.accentColor || '#1D63ED'}`,
    `--brand-background:${branding.backgroundColor || '#F8FAFC'}`,
    `--brand-surface:${branding.surfaceColor || '#FFFFFF'}`,
    `--brand-text:${branding.textColor || '#0F172A'}`,
    `--brand-muted:${branding.mutedTextColor || '#64748B'}`,
    `--brand-button:${branding.buttonColor || '#1D63ED'}`,
    `--brand-button-text:${branding.buttonTextColor || '#FFFFFF'}`,
  ].join(';')

  return (
    <BrandingContext.Provider value={{ branding, loading, isReady }}>
      <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
