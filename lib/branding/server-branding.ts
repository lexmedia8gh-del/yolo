import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { sanitizeBrandingLogoUrlIsomorphic } from '@/lib/branding/logo-resolver'
import type { BrandingSettings } from '@/lib/types'

export const SERVER_DEFAULT_BRANDING: BrandingSettings = {
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

/**
 * Resolves authoritative Branding Settings on the server during RootLayout SSR
 * so the exact configured LexMedia logo is known on Frame 0 without client fetch races.
 */
export async function getServerInitialBranding(): Promise<BrandingSettings> {
  try {
    const adminDb = getAdminDb()

    const fetchPromise = Promise.all([
      adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get(),
      adminDb.collection(COLLECTIONS.SETTINGS).doc('business').get(),
    ])

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1200)
    })

    const result = await Promise.race([fetchPromise, timeoutPromise])
    if (!result) {
      return SERVER_DEFAULT_BRANDING
    }

    const [brandSnap, bizSnap] = result
    const brandData = brandSnap?.exists ? brandSnap.data() || {} : {}
    const bizData = bizSnap?.exists ? bizSnap.data() || {} : {}

    const resolvedLogoUrl =
      sanitizeBrandingLogoUrlIsomorphic(brandData.logoUrl, brandData.logoStoragePath) ||
      sanitizeBrandingLogoUrlIsomorphic(bizData.logoURL, bizData.logoStoragePath)

    const resolvedLogoStoragePath =
      (resolvedLogoUrl && (brandData.logoStoragePath || bizData.logoStoragePath)) || ''

    const resolvedLightUrl = sanitizeBrandingLogoUrlIsomorphic(
      brandData.logoLightUrl,
      brandData.logoLightStoragePath
    )
    const resolvedFaviconUrl = sanitizeBrandingLogoUrlIsomorphic(
      brandData.faviconUrl,
      brandData.faviconStoragePath
    )

    return {
      ...SERVER_DEFAULT_BRANDING,
      ...brandData,
      businessName:
        brandData.businessName || bizData.businessName || SERVER_DEFAULT_BRANDING.businessName,
      tagline: brandData.tagline || bizData.tagline || SERVER_DEFAULT_BRANDING.tagline,
      logoUrl: resolvedLogoUrl,
      logoStoragePath: resolvedLogoStoragePath,
      logoLightUrl: resolvedLightUrl,
      logoLightStoragePath: resolvedLightUrl ? brandData.logoLightStoragePath || '' : '',
      faviconUrl: resolvedFaviconUrl,
      faviconStoragePath: resolvedFaviconUrl ? brandData.faviconStoragePath || '' : '',
    }
  } catch {
    return SERVER_DEFAULT_BRANDING
  }
}
