import { NextResponse } from 'next/server'
import { getAdminDb, hasAdminCredentials } from '@/lib/firebase/admin'

export async function GET() {
  try {
    const db = getAdminDb()
    const secSnap = await db.collection('settings').doc('security').get()
    const data = secSnap.data()
    return NextResponse.json({
        pinHash: data?.pinHash,
        pinSalt: data?.pinSalt,
        hasAdminCreds: hasAdminCredentials(),
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ? 'set' : 'not set',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
