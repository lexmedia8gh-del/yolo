'use client'

import { useState, useEffect, useMemo } from 'react'
import { COLLECTIONS, subscribeToDocument } from '@/lib/firebase/firestore'
import type { BrandingSettings, BusinessSettings } from '@/lib/types'
import { getCustomerUrl } from '@/lib/utils'

export const DEFAULT_INVOICE_BRANDING: BrandingSettings = {
  businessName: 'LEXMEDIA.GH',
  shortName: 'LM',
  tagline: 'Professional Digital Services',
  logoUrl: '',
  logoStoragePath: '',
  logoLightUrl: '',
  logoLightStoragePath: '',
  faviconUrl: '',
  faviconStoragePath: '',
  primaryColor: '#0F172A',
  secondaryColor: '#4F46E5',
  accentColor: '#4F46E5',
  backgroundColor: '#F8FAFC',
  surfaceColor: '#FFFFFF',
  textColor: '#0F172A',
  mutedTextColor: '#64748B',
  buttonColor: '#0F172A',
  buttonTextColor: '#FFFFFF',
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

export function sanitizeBrandingLogoUrl(raw?: string | null, storagePath?: string | null): string {
  const cleanPath =
    storagePath &&
    typeof storagePath === 'string' &&
    !storagePath.includes('..') &&
    (storagePath.trim().startsWith('invoice-branding/') ||
      storagePath.trim().startsWith('branding/'))
      ? storagePath.trim()
      : ''

  if (raw && typeof raw === 'string') {
    const trimmed = raw.trim()
    // Reject broken legacy local filesystem paths (/uploads/...) from read-only FS deployments
    if (trimmed && !trimmed.startsWith('/uploads/')) {
      // Normalize raw Supabase public URLs on private 'Delivery files' bucket to our permanent server stream route
      if (trimmed.includes('.supabase.co/storage/v1/object/public/')) {
        const parts = trimmed.split(/\/storage\/v1\/object\/public\/[^/]+\//i)
        if (parts.length > 1) {
          const extracted = decodeURIComponent(parts[1].split('?')[0])
          if (extracted.startsWith('invoice-branding/') || extracted.startsWith('branding/')) {
            return `/api/branding/image?path=${encodeURIComponent(extracted)}`
          }
        }
      }
      return trimmed
    }
  }

  if (cleanPath) {
    return `/api/branding/image?path=${encodeURIComponent(cleanPath)}`
  }

  return ''
}

export function normalizeHexColor(raw: string | undefined, fallback: string): string {
  if (raw && HEX_COLOR_RE.test(raw.trim())) {
    return raw.trim()
  }
  return fallback
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = normalizeHexColor(hex, '#0F172A').slice(1)
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function useInvoiceBranding() {
  const [brandingDoc, setBrandingDoc] = useState<Partial<BrandingSettings> | null>(null)
  const [businessDoc, setBusinessDoc] = useState<Partial<BusinessSettings> | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true

    const unsubBranding = subscribeToDocument<BrandingSettings>(
      COLLECTIONS.SETTINGS,
      'branding',
      (data) => {
        if (!active) return
        if (data) setBrandingDoc(data)
        setLoaded(true)
      }
    )

    const unsubBusiness = subscribeToDocument<BusinessSettings>(
      COLLECTIONS.SETTINGS,
      'business',
      (data) => {
        if (!active) return
        if (data) setBusinessDoc(data)
        setLoaded(true)
      }
    )

    // Server fallback so unauthenticated/initial views still receive saved Firebase branding
    fetch('/api/branding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!active || !payload?.success) return
        if (payload.branding) {
          setBrandingDoc((prev) => prev || payload.branding)
        }
        if (payload.business) {
          setBusinessDoc((prev) => prev || payload.business)
        }
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })

    return () => {
      active = false
      unsubBranding()
      unsubBusiness()
    }
  }, [])

  return useMemo(() => {
    const mergedBranding: BrandingSettings = {
      ...DEFAULT_INVOICE_BRANDING,
      ...(brandingDoc || {}),
    }

    const logoFromBranding = sanitizeBrandingLogoUrl(
      brandingDoc?.logoUrl,
      brandingDoc?.logoStoragePath
    )
    const logoFromBusiness = sanitizeBrandingLogoUrl(
      businessDoc?.logoURL,
      businessDoc?.logoStoragePath
    )
    const resolvedLogoUrl = logoFromBranding || logoFromBusiness || ''
    const resolvedLogoStoragePath =
      (logoFromBranding ? brandingDoc?.logoStoragePath : businessDoc?.logoStoragePath) ||
      brandingDoc?.logoStoragePath ||
      businessDoc?.logoStoragePath ||
      ''

    const primaryColor = normalizeHexColor(mergedBranding.primaryColor, '#0F172A')
    const accentColor = normalizeHexColor(
      mergedBranding.accentColor || mergedBranding.secondaryColor,
      '#4F46E5'
    )
    const secondaryColor = normalizeHexColor(mergedBranding.secondaryColor, accentColor)

    const businessDefaults = {
      name:
        businessDoc?.businessName ||
        brandingDoc?.businessName ||
        DEFAULT_INVOICE_BRANDING.businessName,
      shortName: mergedBranding.shortName || 'LM',
      tagline: businessDoc?.tagline || brandingDoc?.tagline || '',
      logo: resolvedLogoUrl,
      logoStoragePath: resolvedLogoStoragePath,
      email: businessDoc?.email || 'contact@lexmedia.com',
      phone: businessDoc?.phone || '',
      whatsapp: businessDoc?.whatsapp || '',
      address: businessDoc?.address || 'Accra, Ghana',
      website: businessDoc?.website || getCustomerUrl(),
      currency: businessDoc?.currency || 'GHS',
      currencySymbol: businessDoc?.currencySymbol || 'GH₵',
      invoicePrefix: businessDoc?.invoicePrefix || 'LXM-INV',
      defaultTaxRate: Number(businessDoc?.defaultTaxRate) || 0,
      defaultPaymentTerms: businessDoc?.defaultPaymentTerms || 'Due on Receipt',
      defaultTermsAndConditions: businessDoc?.defaultTermsAndConditions || '',
      defaultNotes: businessDoc?.defaultNotes || '',
      defaultPaymentInstructions: businessDoc?.defaultPaymentInstructions || '',
      defaultThankYouMessage: businessDoc?.defaultThankYouMessage || '',
    }

    return {
      loaded,
      branding: {
        ...mergedBranding,
        logoUrl: resolvedLogoUrl,
        logoStoragePath: resolvedLogoStoragePath,
        primaryColor,
        secondaryColor,
        accentColor,
      },
      businessDefaults,
      resolvedLogoUrl,
      resolvedLogoStoragePath,
    }
  }, [brandingDoc, businessDoc, loaded])
}
