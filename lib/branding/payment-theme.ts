import type { BrandingSettings } from '@/lib/types'
import {
  AUTHORITATIVE_LEXMEDIA_LOGO,
  resolveDisplayBrandName,
  sanitizeBrandingLogoUrlIsomorphic,
} from '@/lib/branding/logo-resolver'

const AUTHORITATIVE_LEXMEDIA_LIGHT_LOGO =
  '/uploads/branding/logoLight/1788577475794_Asset 132_4x.png'

const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/

export function normalizeBrandHex(raw: string | undefined | null, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (HEX_6_RE.test(trimmed)) return trimmed.toUpperCase()
  if (HEX_3_RE.test(trimmed)) {
    const r = trimmed[1]
    const g = trimmed[2]
    const b = trimmed[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return fallback.toUpperCase()
}

export function hexToRgbaString(hex: string, alpha: number): string {
  const clean = normalizeBrandHex(hex, '#0F172A').slice(1)
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getRelativeLuminance(hex: string): number {
  const clean = normalizeBrandHex(hex, '#0F172A').slice(1)
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA)
  const lumB = getRelativeLuminance(hexB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface ResolvedBrandPalette {
  businessName: string
  tagline: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  ctaBg: string
  ctaText: string
  ctaShadow: string
  accentSoftBg: string
  accentSoftBorder: string
  primarySoftBg: string
  headerGradient: string
}

const DEFAULT_BUTTON_HEXES = new Set(['#1D63ED', '#0A0A0A', '#0F172A'])
const DEFAULT_ACCENT_HEXES = new Set(['#1D63ED', '#4F46E5', '#6366F1'])
const DEFAULT_PRIMARY_HEXES = new Set(['#0F172A', '#0A0A0A', '#111827'])

export function resolveBrandPalette(
  branding?: Partial<BrandingSettings> | null
): ResolvedBrandPalette {
  const businessName = resolveDisplayBrandName(branding)
  const tagline = (branding?.tagline || '').trim()

  const primaryColor = normalizeBrandHex(branding?.primaryColor, '#0F172A')
  const secondaryColor = normalizeBrandHex(branding?.secondaryColor, '#1D63ED')
  const accentColor = normalizeBrandHex(
    branding?.accentColor || branding?.secondaryColor,
    secondaryColor
  )
  const rawButton = branding?.buttonColor ? normalizeBrandHex(branding.buttonColor, '') : ''

  let ctaBg = '#1D63ED'
  if (rawButton && !DEFAULT_BUTTON_HEXES.has(rawButton)) {
    ctaBg = rawButton
  } else if (!DEFAULT_ACCENT_HEXES.has(accentColor)) {
    ctaBg = accentColor
  } else if (!DEFAULT_ACCENT_HEXES.has(secondaryColor)) {
    ctaBg = secondaryColor
  } else if (!DEFAULT_PRIMARY_HEXES.has(primaryColor)) {
    ctaBg = primaryColor
  } else if (rawButton) {
    ctaBg = rawButton
  } else {
    ctaBg = accentColor
  }

  const candidateBtnText = branding?.buttonTextColor
    ? normalizeBrandHex(branding.buttonTextColor, '#FFFFFF')
    : '#FFFFFF'
  const ctaText =
    getContrastRatio(ctaBg, candidateBtnText) >= 4.2
      ? candidateBtnText
      : getRelativeLuminance(ctaBg) > 0.48
      ? '#0F172A'
      : '#FFFFFF'

  return {
    businessName,
    tagline,
    primaryColor,
    secondaryColor,
    accentColor,
    ctaBg,
    ctaText,
    ctaShadow: hexToRgbaString(ctaBg, 0.24),
    accentSoftBg: hexToRgbaString(accentColor, 0.08),
    accentSoftBorder: hexToRgbaString(accentColor, 0.22),
    primarySoftBg: hexToRgbaString(primaryColor, 0.06),
    headerGradient: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 50%, ${accentColor} 100%)`,
  }
}

function isDefaultLexMediaBrandName(name?: string | null): boolean {
  const cleaned = (name || '').trim().toLowerCase()
  if (!cleaned) return true
  return cleaned === 'lexmedia.gh' || cleaned === 'lexmedia' || cleaned.startsWith('lexmedia.')
}

/**
 * Resolves candidate logo URLs in priority order for light or dark surfaces.
 * Uses the actual uploaded logo from Settings -> Branding (or committed LexMedia logo mark
 * when operating as LexMedia with no custom override). Never returns generic icons.
 */
export function resolveBrandLogoCandidates(
  branding?: Partial<BrandingSettings> | null,
  surface: 'light' | 'dark' = 'light'
): string[] {
  const mainLogo = sanitizeBrandingLogoUrlIsomorphic(
    branding?.logoUrl,
    branding?.logoStoragePath
  )
  const lightLogo = sanitizeBrandingLogoUrlIsomorphic(
    branding?.logoLightUrl,
    branding?.logoLightStoragePath
  )
  const faviconLogo = sanitizeBrandingLogoUrlIsomorphic(
    branding?.faviconUrl,
    branding?.faviconStoragePath
  )

  const ordered: string[] =
    surface === 'dark'
      ? [lightLogo, mainLogo, faviconLogo]
      : [mainLogo, lightLogo, faviconLogo]

  if (isDefaultLexMediaBrandName(branding?.businessName)) {
    if (surface === 'dark') {
      ordered.push(AUTHORITATIVE_LEXMEDIA_LIGHT_LOGO, AUTHORITATIVE_LEXMEDIA_LOGO)
    } else {
      ordered.push(AUTHORITATIVE_LEXMEDIA_LOGO, AUTHORITATIVE_LEXMEDIA_LIGHT_LOGO)
    }
  }

  const deduped: string[] = []
  for (const item of ordered) {
    if (item && !deduped.includes(item)) {
      deduped.push(item)
    }
  }
  return deduped
}
