import type { BrandingSettings } from '@/lib/types'

/**
 * Authoritative uploaded LexMedia brand mark asset committed in public/uploads/branding/logo.
 * Used when no custom override URL has been uploaded in Branding Settings.
 */
export const AUTHORITATIVE_LEXMEDIA_LOGO = '/uploads/branding/logo/1788576626544_Untitled-1.png'

export const BRANDING_CACHE_STORAGE_KEY = 'lexmedia_branding_cache_v1'

export const COMMITTED_BRANDING_UPLOADS = new Set([
  '/uploads/branding/logo/1788575175476_dk.png',
  '/uploads/branding/logo/1788576626544_Untitled-1.png',
  '/uploads/branding/logoLight/1788575187709_wh.png',
  '/uploads/branding/logoLight/1788577475794_Asset 132_4x.png',
  '/uploads/branding/favicon/1788572036349_Asset 132_4x.png',
  '/uploads/branding/favicon/1788575199367_faj.png',
])

/**
 * Isomorphic (server + client) branding logo URL sanitizer.
 */
export function sanitizeBrandingLogoUrlIsomorphic(
  raw?: unknown,
  storagePath?: unknown
): string {
  const cleanPath =
    typeof storagePath === 'string' &&
    !storagePath.includes('..') &&
    (storagePath.trim().startsWith('invoice-branding/') ||
      storagePath.trim().startsWith('branding/'))
      ? storagePath.trim()
      : ''

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed && (!trimmed.startsWith('/uploads/') || COMMITTED_BRANDING_UPLOADS.has(trimmed))) {
      if (trimmed.includes('.supabase.co/storage/v1/object/public/')) {
        if (cleanPath) {
          return `/api/branding/image?path=${encodeURIComponent(cleanPath)}`
        }
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

/**
 * Resolves the authoritative LexMedia logo URL for dark splash/loading screens (PageLoader / TrimPathLogo).
 * Priority:
 *  1. Uploaded Light Logo (for dark backgrounds) in Branding Settings
 *  2. Uploaded Main Brand Logo in Branding Settings
 *  3. Uploaded Favicon Logo in Branding Settings
 *  4. Authoritative uploaded LexMedia logo mark (/uploads/branding/logo/1788576626544_Untitled-1.png)
 */
export function resolveAuthoritativeSplashLogoUrl(
  branding?: Partial<BrandingSettings> | null
): string {
  if (!branding) return AUTHORITATIVE_LEXMEDIA_LOGO

  const lightLogo = sanitizeBrandingLogoUrlIsomorphic(
    branding.logoLightUrl,
    branding.logoLightStoragePath
  )
  if (lightLogo) return lightLogo

  const mainLogo = sanitizeBrandingLogoUrlIsomorphic(branding.logoUrl, branding.logoStoragePath)
  if (mainLogo) return mainLogo

  const faviconLogo = sanitizeBrandingLogoUrlIsomorphic(
    branding.faviconUrl,
    branding.faviconStoragePath
  )
  if (faviconLogo) return faviconLogo

  return AUTHORITATIVE_LEXMEDIA_LOGO
}

/**
 * Resolves the authoritative display brand name from Branding Settings.
 */
export function resolveDisplayBrandName(branding?: Partial<BrandingSettings> | null): string {
  const raw = (branding?.businessName || '').trim()
  if (raw && raw.toLowerCase() !== 'lexmedia') {
    return raw
  }
  return 'lexmedia.gh'
}
