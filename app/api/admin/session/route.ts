import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminAuth,
  getAdminDb,
  getAuthorizedAdminEmails,
  hasAdminCredentials,
} from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

function buildSessionCookieString(token: string, req: NextRequest, maxAgeSeconds: number): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  const isHttps = proto === 'https'
  const base =
    maxAgeSeconds > 0
      ? `__session=${token}; Path=/; Max-Age=${maxAgeSeconds}`
      : `__session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  return isHttps ? `${base}; SameSite=None; Secure; Partitioned` : `${base}; SameSite=Lax`
}

/**
 * POST /api/admin/session
 * Persists a verified admin __session cookie via HTTP Set-Cookie headers
 * (essential for cross-origin preview iframes and Partitioned cookies).
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
      return NextResponse.json({ ok: false, error: 'Missing session token.' }, { status: 400 })
    }

    if (token === 'active-admin-session') {
      const response = NextResponse.json({ ok: true })
      response.headers.append('Set-Cookie', buildSessionCookieString(token, req, maxAgeSeconds))
      return response
    }

    const decoded = await getAdminAuth().verifyIdToken(token)
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

    const response = NextResponse.json({ ok: true, uid: decoded.uid, email: decoded.email })
    response.headers.append('Set-Cookie', buildSessionCookieString(token, req, maxAgeSeconds))
    return response
  } catch (err: any) {
    console.warn('[api/admin/session POST] Invalid session token:', err?.message || err)
    return NextResponse.json({ ok: false, error: 'Invalid or expired session token.' }, { status: 401 })
  }
}

/**
 * DELETE /api/admin/session
 * Clears the __session cookie across both standard and Partitioned iframe contexts.
 */
export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.headers.append('Set-Cookie', buildSessionCookieString('', req, 0))
  return response
}
