import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

const DEFAULT_BRANDING = {
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

export async function GET() {
  try {
    const adminDb = getAdminDb()
    const docSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()

    if (docSnap.exists) {
      return NextResponse.json({
        success: true,
        branding: { ...DEFAULT_BRANDING, ...docSnap.data() },
      })
    }

    return NextResponse.json({
      success: true,
      branding: DEFAULT_BRANDING,
    })
  } catch (err) {
    console.warn('[Branding API Warning] Falling back to default branding:', err)
    return NextResponse.json({
      success: true,
      branding: DEFAULT_BRANDING,
    })
  }
}
