import { NextRequest, NextResponse } from 'next/server'
import { isFirebaseConfigured } from '@/lib/firebase/config'
import {
  getAdminDb,
  getFirebaseDatabaseId,
  getFirebaseProjectId,
  requireAdmin,
} from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const result: Record<string, any> = {
    projectId: getFirebaseProjectId(),
    databaseId: getFirebaseDatabaseId() || '(default)',
    apiKeyConfigured: isFirebaseConfigured,
  }

  try {
    const adminDb = getAdminDb()
    const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
    result.readSuccess = true
    result.brandingConfigured = brandingSnap.exists

    return NextResponse.json({
      status: 'success',
      message: 'Firestore server adapter is connected and operational.',
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        errorCode: err?.code || 'unknown',
        errorMessage: err?.message || 'Connection test failed',
        ...result,
      },
      { status: 500 }
    )
  }
}
