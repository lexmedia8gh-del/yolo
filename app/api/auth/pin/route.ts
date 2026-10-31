import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminAuth,
  getAdminDb,
  getAuthorizedAdminEmails,
  hasAdminCredentials,
  requireAdmin,
} from '@/lib/firebase/admin'
import {
  validatePinFormat,
  hashPin,
  verifyPinHash,
  checkPinRateLimit,
  recordFailedPinAttempt,
  clearPinRateLimit,
} from '@/lib/utils/pin'

export const dynamic = 'force-dynamic'

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

function buildSessionCookieHeader(token: string, req: NextRequest, maxAgeSeconds = 604800): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '')
  const isHttps = proto === 'https'
  const base = `__session=${token}; Path=/; Max-Age=${maxAgeSeconds}`
  return isHttps ? `${base}; SameSite=None; Secure; Partitioned` : `${base}; SameSite=Lax`
}

/**
 * GET /api/auth/pin
 * Returns status on whether a 6-digit PIN has been enrolled for the workspace.
 */
export async function GET() {
  try {
    if (!hasAdminCredentials()) {
      return NextResponse.json({ ok: true, isEnrolled: true, defaultFallbackActive: true })
    }

    const docSnap = await getAdminDb().collection('settings').doc('security').get()
    const data = docSnap.exists ? docSnap.data() : null
    const isEnrolled = Boolean(data?.pinHash && data?.pinSalt)

    return NextResponse.json({ ok: true, isEnrolled })
  } catch (err: any) {
    console.warn('[api/auth/pin GET Error]:', err?.message || err)
    return NextResponse.json({ ok: true, isEnrolled: false })
  }
}

/**
 * POST /api/auth/pin
 * Handles PIN verification (login), PIN changes, and PIN resets via Google reauth.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON request payload.' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action.trim() : 'verify'

  // ─────────────────────────────────────────────────────────────
  // 1. ACTION: VERIFY (Login with 6-digit PIN)
  // ─────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
    if (!validatePinFormat(pin)) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a valid six-digit PIN.' },
        { status: 400 }
      )
    }

    // Check rate limit by IP
    const rateCheck = checkPinRateLimit(ip)
    if (!rateCheck.allowed) {
      const minutes = Math.ceil(rateCheck.lockoutSeconds / 60)
      return NextResponse.json(
        {
          ok: false,
          error: `Too many failed PIN attempts. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} or sign in with Google.`,
          lockedOut: true,
        },
        { status: 429 }
      )
    }

    try {
      const requestId = Math.random().toString(36).substring(2, 9);


      let secData: any = null
      if (hasAdminCredentials()) {
        try {
          const db = getAdminDb()
          const secRef = db.collection('settings').doc('security')
          const secSnap = await secRef.get()
          secData = secSnap.exists ? secSnap.data() : null

        } catch (dbErr: any) {
          console.error(`[PIN Verify ${requestId}] Firestore Admin SDK lookup error:`, dbErr?.message || dbErr)
        }
      } else {

      }

      let isValidPin = false
      let targetUid = 'admin-staff-user'
      let targetEmail = getAuthorizedAdminEmails()[0] || 'lexmedia8gh@gmail.com'

      // Case A: Security record contains enrolled PIN hash
      if (secData?.pinHash && secData?.pinSalt) {

        isValidPin = verifyPinHash(pin, secData.pinHash, secData.pinSalt)
      } else {
        // Case B: Initial setup / default bootstrap PIN (123456)

        const defaultHashData = hashPin('123456', 'lexmedia_default_salt_2026')
        if (secData?.pinHash) {
          isValidPin = verifyPinHash(pin, secData.pinHash, secData.pinSalt || 'lexmedia_default_salt_2026')
        } else {
          // If 123456 is entered on unconfigured workspace, accept and enroll it
          if (verifyPinHash(pin, defaultHashData.hash, defaultHashData.salt)) {
            isValidPin = true

            if (hasAdminCredentials()) {
              try {
                const db = getAdminDb()
                await db.collection('settings').doc('security').set(
                  {
                    pinHash: defaultHashData.hash,
                    pinSalt: defaultHashData.salt,
                    enrolledAt: new Date().toISOString(),
                  },
                  { merge: true }
                )
              } catch {}
            }
          }
        }
      }

      if (!isValidPin) {

        const attempt = recordFailedPinAttempt(ip)
        if (attempt.locked) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Too many incorrect PIN attempts. Access locked for 15 minutes. Try "Continue with Google".',
              lockedOut: true,
            },
            { status: 429 }
          )
        }
        return NextResponse.json(
          {
            ok: false,
            error: `Incorrect 6-digit PIN. (${attempt.remaining} attempt${attempt.remaining === 1 ? '' : 's'} remaining)`,
          },
          { status: 401 }
        )
      }

      // Successful PIN Verification!

      clearPinRateLimit(ip)


      // Look up target admin record in Firebase Auth or Firestore
      if (hasAdminCredentials()) {
        try {
          const auth = getAdminAuth()
          const userRec = await auth.getUserByEmail(targetEmail)
          targetUid = userRec.uid

          // Create a custom session token or ID token if possible
          if (userRec.customClaims?.admin !== true) {
            await auth.setCustomUserClaims(targetUid, {
              ...(userRec.customClaims || {}),
              admin: true,
            })
          }
        } catch (lookupErr: any) {
          console.warn('[PIN Verify] User lookup fallback:', lookupErr?.message)
        }
      }

      // Generate session token or fallback session
      let token = 'active-admin-session'
      if (hasAdminCredentials() && targetUid !== 'admin-staff-user') {
        try {
          token = await getAdminAuth().createCustomToken(targetUid, { admin: true })
        } catch {
          token = 'active-admin-session'
        }
      }

      const response = NextResponse.json({
        ok: true,
        redirectTo: '/dashboard',
        email: targetEmail,
        uid: targetUid,
      })
      response.headers.append('Set-Cookie', buildSessionCookieHeader(token, req, 604800))
      return response
    } catch (err: any) {
      console.error('[POST /api/auth/pin verify Error]:', err)
      return NextResponse.json({ ok: false, error: 'Unable to verify PIN. Please try again.' }, { status: 500 })
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ACTION: CHANGE (Authenticated Admin Changes PIN)
  // ─────────────────────────────────────────────────────────────
  if (action === 'change') {
    const authCheck = await requireAdmin(req)
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, error: authCheck.error }, { status: authCheck.status })
    }

    const currentPin = typeof body.currentPin === 'string' ? body.currentPin.trim() : ''
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : ''
    const confirmPin = typeof body.confirmPin === 'string' ? body.confirmPin.trim() : ''

    if (!validatePinFormat(currentPin)) {
      return NextResponse.json({ ok: false, error: 'Current PIN must contain exactly six digits.' }, { status: 400 })
    }
    if (!validatePinFormat(newPin)) {
      return NextResponse.json({ ok: false, error: 'New PIN must contain exactly six digits.' }, { status: 400 })
    }
    if (newPin !== confirmPin) {
      return NextResponse.json({ ok: false, error: 'New PIN and confirmation PIN do not match.' }, { status: 400 })
    }
    if (currentPin === newPin) {
      return NextResponse.json({ ok: false, error: 'New PIN must be different from your current PIN.' }, { status: 400 })
    }

    const rateCheck = checkPinRateLimit(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many failed verification attempts. Please try again later.' },
        { status: 429 }
      )
    }

    try {
      const db = getAdminDb()
      const secRef = db.collection('settings').doc('security')
      const secSnap = await secRef.get()
      const secData = secSnap.exists ? secSnap.data() : null

      let isCurrentValid = false
      if (secData?.pinHash && secData?.pinSalt) {
        isCurrentValid = verifyPinHash(currentPin, secData.pinHash, secData.pinSalt)
      } else {
        // Fallback check against initial default PIN (123456)
        const defaultHashData = hashPin('123456', 'lexmedia_default_salt_2026')
        isCurrentValid = verifyPinHash(currentPin, defaultHashData.hash, defaultHashData.salt)
      }

      if (!isCurrentValid) {
        recordFailedPinAttempt(ip)
        return NextResponse.json({ ok: false, error: 'Current 6-digit PIN is incorrect.' }, { status: 400 })
      }

      clearPinRateLimit(ip)

      // Hash new PIN with fresh random salt
      const newHashed = hashPin(newPin)
      const nowIso = new Date().toISOString()

      await secRef.set(
        {
          pinHash: newHashed.hash,
          pinSalt: newHashed.salt,
          updatedAt: nowIso,
          updatedBy: authCheck.uid,
          updatedByEmail: authCheck.email || '',
        },
        { merge: true }
      )

      return NextResponse.json({
        ok: true,
        message: 'Your 6-digit PIN has been updated successfully.',
      })
    } catch (err: any) {
      console.error('[POST /api/auth/pin change Error]:', err)
      return NextResponse.json({ ok: false, error: 'Failed to update PIN. Please try again.' }, { status: 500 })
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ACTION: RESET (Reset PIN after Identity Reauthentication)
  // ─────────────────────────────────────────────────────────────
  if (action === 'reset') {
    const authCheck = await requireAdmin(req)
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, error: authCheck.error }, { status: authCheck.status })
    }

    const googleToken = typeof body.googleToken === 'string' ? body.googleToken.trim() : ''
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : ''
    const confirmPin = typeof body.confirmPin === 'string' ? body.confirmPin.trim() : ''

    if (!validatePinFormat(newPin)) {
      return NextResponse.json({ ok: false, error: 'New PIN must contain exactly six digits.' }, { status: 400 })
    }
    if (newPin !== confirmPin) {
      return NextResponse.json({ ok: false, error: 'New PIN and confirmation PIN do not match.' }, { status: 400 })
    }

    // Verify Google ID Token reauthentication proof
    if (hasAdminCredentials() && googleToken) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(googleToken)
        const authorizedEmails = getAuthorizedAdminEmails()
        if (
          !decoded.email ||
          decoded.email_verified === false ||
          !authorizedEmails.includes(decoded.email.toLowerCase().trim())
        ) {
          return NextResponse.json(
            { ok: false, error: 'Google reauthentication failed. Account is not authorized.' },
            { status: 403 }
          )
        }
      } catch (tokenErr: any) {
        return NextResponse.json(
          { ok: false, error: 'Google verification challenge expired or invalid. Please try again.' },
          { status: 401 }
        )
      }
    }

    try {
      const db = getAdminDb()
      const secRef = db.collection('settings').doc('security')
      const newHashed = hashPin(newPin)
      const nowIso = new Date().toISOString()

      await secRef.set(
        {
          pinHash: newHashed.hash,
          pinSalt: newHashed.salt,
          updatedAt: nowIso,
          updatedBy: authCheck.uid,
          updatedByEmail: authCheck.email || '',
          resetMethod: 'google_reauth',
        },
        { merge: true }
      )

      clearPinRateLimit(ip)

      return NextResponse.json({
        ok: true,
        message: 'Your 6-digit PIN has been reset successfully.',
      })
    } catch (err: any) {
      console.error('[POST /api/auth/pin reset Error]:', err)
      return NextResponse.json({ ok: false, error: 'Failed to reset PIN. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: false, error: 'Unsupported PIN action.' }, { status: 400 })
}
