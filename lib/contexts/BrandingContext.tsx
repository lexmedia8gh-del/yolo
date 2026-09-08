'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { subscribeToDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BrandingSettings } from '@/lib/types'

export const DEFAULT_BRANDING: BrandingSettings = {
  businessName: 'LexMedia',
  shortName: 'Lex',
  tagline: 'Professional Digital Services',
  logoUrl: '',
  logoLightUrl: '',
  faviconUrl: '',
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

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToDocument<BrandingSettings>(
      COLLECTIONS.SETTINGS,
      'branding',
      (data) => {
        if (data) {
          setBranding((prev) => ({ ...prev, ...data }))
        }
        setLoading(false)
      }
    )
    return () => unsubscribe()
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
