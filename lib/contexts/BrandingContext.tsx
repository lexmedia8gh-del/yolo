'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToDocument, COLLECTIONS } from '@/lib/firebase/firestore'
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
  primaryColor: '#0A0A0A',
  secondaryColor: '#6366F1',
  accentColor: '#4F46E5',
  backgroundColor: '#F8F9FC',
  surfaceColor: '#FFFFFF',
  textColor: '#111827',
  mutedTextColor: '#6B7280',
  buttonColor: '#0A0A0A',
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

    // 1. Fetch from server API immediately for fast, reliable initialization
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
      .catch((err) => {
        console.warn('[Branding Context] API load warning, using defaults/listeners:', err)
        if (mounted) setLoading(false)
      })

    // 2. Real-time subscription to Firestore settings/branding and settings/business
    const unsubBranding = subscribeToDocument<BrandingSettings>(
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

    const unsubBusiness = subscribeToDocument<BusinessSettings>(
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

    return () => {
      mounted = false
      unsubBranding()
      unsubBusiness()
    }
  }, [])

  const cssVars = [
    `--brand-primary:${branding.primaryColor || '#0A0A0A'}`,
    `--brand-secondary:${branding.secondaryColor || '#6366F1'}`,
    `--brand-accent:${branding.accentColor || '#4F46E5'}`,
    `--brand-background:${branding.backgroundColor || '#F8F9FC'}`,
    `--brand-surface:${branding.surfaceColor || '#FFFFFF'}`,
    `--brand-text:${branding.textColor || '#111827'}`,
    `--brand-muted:${branding.mutedTextColor || '#6B7280'}`,
    `--brand-button:${branding.buttonColor || '#0A0A0A'}`,
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
