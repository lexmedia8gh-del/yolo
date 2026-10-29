import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, hasAdminCredentials, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

const DEFAULT_BRANDING = {
  businessName: 'LEXMEDIA.GH',
  shortName: 'LM',
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

function sanitizeStoredLogoUrl(url?: unknown, storagePath?: unknown): string {
  const cleanPath =
    typeof storagePath === 'string' &&
    !storagePath.includes('..') &&
    (storagePath.trim().startsWith('invoice-branding/') ||
      storagePath.trim().startsWith('branding/'))
      ? storagePath.trim()
      : ''

  if (typeof url === 'string') {
    const trimmed = url.trim()
    if (trimmed && !trimmed.startsWith('/uploads/')) {
      if (trimmed.includes('.supabase.co/storage/v1/object/public/') && cleanPath) {
        return `/api/branding/image?path=${encodeURIComponent(cleanPath)}`
      }
      return trimmed
    }
  }

  if (cleanPath) {
    return `/api/branding/image?path=${encodeURIComponent(cleanPath)}`
  }
  return ''
}

export async function GET() {
  if (!hasAdminCredentials() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return NextResponse.json({
      success: true,
      branding: DEFAULT_BRANDING,
    })
  }

  try {
    const adminDb = getAdminDb()
    const [brandSnap, bizSnap] = await Promise.all([
      adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get(),
      adminDb.collection(COLLECTIONS.SETTINGS).doc('business').get(),
    ])

    const brandData = brandSnap.exists ? brandSnap.data() || {} : {}
    const bizData = bizSnap.exists ? bizSnap.data() || {} : {}

    const resolvedLogoUrl =
      sanitizeStoredLogoUrl(brandData.logoUrl, brandData.logoStoragePath) ||
      sanitizeStoredLogoUrl(bizData.logoURL, bizData.logoStoragePath)
    const resolvedLogoStoragePath =
      (resolvedLogoUrl && (brandData.logoStoragePath || bizData.logoStoragePath)) || ''

    return NextResponse.json({
      success: true,
      branding: {
        ...DEFAULT_BRANDING,
        ...brandData,
        businessName: brandData.businessName || bizData.businessName || DEFAULT_BRANDING.businessName,
        tagline: brandData.tagline || bizData.tagline || DEFAULT_BRANDING.tagline,
        logoUrl: resolvedLogoUrl,
        logoStoragePath: resolvedLogoStoragePath,
        logoLightUrl: sanitizeStoredLogoUrl(brandData.logoLightUrl, brandData.logoLightStoragePath),
        faviconUrl: sanitizeStoredLogoUrl(brandData.faviconUrl, brandData.faviconStoragePath),
      },
      business: bizSnap.exists
        ? {
            ...bizData,
            logoURL:
              sanitizeStoredLogoUrl(bizData.logoURL, bizData.logoStoragePath) || resolvedLogoUrl,
            logoStoragePath: bizData.logoStoragePath || resolvedLogoStoragePath,
          }
        : null,
    })
  } catch (err) {
    console.warn('[Branding API Warning] Falling back to default branding:', err)
    return NextResponse.json({
      success: true,
      branding: DEFAULT_BRANDING,
    })
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  if (!hasAdminCredentials() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return NextResponse.json(
      { error: 'Firebase Admin credentials are not configured on server.', code: 'ADMIN_UNCONFIGURED' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const adminDb = getAdminDb()
    const nowIso = new Date().toISOString()

    const writes: Promise<unknown>[] = []

    if (body?.branding && typeof body.branding === 'object') {
      writes.push(
        adminDb
          .collection(COLLECTIONS.SETTINGS)
          .doc('branding')
          .set({ ...body.branding, updatedAt: nowIso, updatedBy: authResult.uid }, { merge: true })
      )
    }

    if (body?.business && typeof body.business === 'object') {
      writes.push(
        adminDb
          .collection(COLLECTIONS.SETTINGS)
          .doc('business')
          .set({ ...body.business, updatedAt: nowIso, updatedBy: authResult.uid }, { merge: true })
      )
    }

    await Promise.all(writes)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Branding API PATCH Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to update branding settings.' },
      { status: 500 }
    )
  }
}
