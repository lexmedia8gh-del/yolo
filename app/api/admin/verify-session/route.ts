import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminAuth,
  getAdminDb,
  getAuthorizedAdminEmails,
  hasAdminCredentials,
} from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

function buildSessionCookieHeader(token: string, req: NextRequest, maxAgeSeconds = 604800): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  const isHttps = proto === 'https'
  const base = `__session=${token}; Path=/; Max-Age=${maxAgeSeconds}`
  return isHttps ? `${base}; SameSite=None; Secure; Partitioned` : `${base}; SameSite=Lax`
}

/**
 * POST /api/admin/verify-session
 * Called client-side after Google or Email sign-in to confirm the user is an authorized admin
 * and persist the __session cookie reliably (including inside cross-origin preview iframes).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const maxAgeSeconds =
      typeof body?.maxAgeSeconds === 'number' && body.maxAgeSeconds > 0
        ? Math.min(body.maxAgeSeconds, 2592000)
        : 604800

    if (!token) {
      return NextResponse.json({ ok: false, error: 'No token provided' }, { status: 400 })
    }

    const auth = getAdminAuth()
    const decoded = await auth.verifyIdToken(token)

    const authorizedEmails = getAuthorizedAdminEmails()
    const hasAdminClaim = decoded.admin === true
    const isAuthorizedEmail = Boolean(
      decoded.email &&
        decoded.email_verified !== false &&
        authorizedEmails.includes(decoded.email.toLowerCase().trim())
    )

    let hasStoredAdminRole = false
    if (!hasAdminClaim && !isAuthorizedEmail && hasAdminCredentials()) {
      try {
        const snap = await getAdminDb().collection('users').doc(decoded.uid).get()
        hasStoredAdminRole = snap.exists && snap.data()?.role === 'admin'
      } catch {}
    }

    if (!hasAdminClaim && !isAuthorizedEmail && !hasStoredAdminRole) {
      return NextResponse.json(
        {
          ok: false,
          error: `Access denied. "${decoded.email || 'This account'}" is not authorized as a LexMedia workspace administrator.`,
        },
        { status: 403 }
      )
    }

    let claimUpdated = false
    if (!hasAdminClaim && hasAdminCredentials()) {
      try {
        const userRecord = await auth.getUser(decoded.uid)
        await auth.setCustomUserClaims(decoded.uid, {
          ...(userRecord.customClaims || {}),
          admin: true,
        })
        claimUpdated = true
      } catch {}
    }

    const response = NextResponse.json({
      ok: true,
      email: decoded.email,
      uid: decoded.uid,
      claimUpdated,
    })
    response.headers.append('Set-Cookie', buildSessionCookieHeader(token, req, maxAgeSeconds))
    return response
  } catch (error: any) {
    console.error('[verify-session] Error:', error?.message || error)
    return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 })
  }
}
