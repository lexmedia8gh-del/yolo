'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import { onAuthChange } from '@/lib/firebase/auth'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
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
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: true,
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

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let unsubBranding: (() => void) | null = null
    let unsubBusiness: (() => void) | null = null

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

    // 1. Fetch from server API immediately for fast, safe initialization on both public (/login) and admin routes
    fetch('/api/branding', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.success && data?.branding) {
          const sanitized = sanitizeBrandingFields(
            data.branding,
            data?.business?.logoURL,
            data?.business?.logoStoragePath
          )
          setBranding((prev) => ({ ...prev, ...sanitized }))
          setLoading(false)
        } else if (mounted) {
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })

    // 2. Only attach Firestore real-time listeners once an authenticated session is active
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
              return { ...prev, ...sanitized }
            })
            setLoading(false)
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
                return {
                  ...prev,
                  logoUrl: bizLogo,
                  logoStoragePath: bizData.logoStoragePath || prev.logoStoragePath || '',
                }
              })
            }
            setLoading(false)
          }
        }
      )
    })

    return () => {
      mounted = false
      unsubAuth()
      clearDocListeners()
    }
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
    <BrandingContext.Provider value={{ branding, loading }}>
      <style dangerouslySetInnerHTML={{ __html: `:root{${cssVars}}` }} />
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
