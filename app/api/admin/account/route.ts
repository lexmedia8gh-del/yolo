import * as admin from 'firebase-admin'
import { NextRequest, NextResponse } from 'next/server'
import {
  getAdminAuth,
  getAdminDb,
  hasAdminCredentials,
  requireAdmin,
} from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateName(rawName: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'Full name must be a valid text string.' }
  }
  const trimmed = rawName.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return { ok: false, error: 'Full name cannot be empty.' }
  }
  if (trimmed.length < 2) {
    return { ok: false, error: 'Full name must be at least 2 characters.' }
  }
  if (trimmed.length > 120) {
    return { ok: false, error: 'Full name must be 120 characters or fewer.' }
  }
  return { ok: true, value: trimmed }
}

function validateEmail(rawEmail: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof rawEmail !== 'string') {
    return { ok: false, error: 'Email address is required.' }
  }
  const trimmed = rawEmail.trim().toLowerCase()
  if (!trimmed) {
    return { ok: false, error: 'Email address cannot be empty.' }
  }
  if (trimmed.length > 254 || !EMAIL_FORMAT_REGEX.test(trimmed)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  return { ok: true, value: trimmed }
}

/**
 * GET /api/admin/account
 * Returns authoritative profile information for the currently authenticated administrator.
 */
export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (!authCheck.ok) {
    return NextResponse.json(
      { ok: false, error: authCheck.error },
      { status: authCheck.status }
    )
  }

  if (!hasAdminCredentials() || authCheck.uid === 'admin-staff-user') {
    return NextResponse.json({
      ok: true,
      adminSdkActive: false,
      uid: authCheck.uid,
      email: authCheck.email || null,
    })
  }

  try {
    const [userRecord, userSnap] = await Promise.all([
      getAdminAuth().getUser(authCheck.uid),
      getAdminDb().collection('users').doc(authCheck.uid).get(),
    ])
    const docData = userSnap.exists ? userSnap.data() : null

    return NextResponse.json({
      ok: true,
      adminSdkActive: true,
      profile: {
        uid: authCheck.uid,
        email: userRecord.email || docData?.email || '',
        emailVerified: userRecord.emailVerified,
        name:
          docData?.name?.trim() ||
          docData?.displayName?.trim() ||
          userRecord.displayName?.trim() ||
          'Lexmedia Admin',
        pendingEmail:
          docData?.pendingEmail &&
          docData.pendingEmail.toLowerCase() !== (userRecord.email || '').toLowerCase()
            ? docData.pendingEmail
            : null,
        role: docData?.role || 'admin',
      },
    })
  } catch (error: any) {
    console.error('[api/admin/account GET] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to retrieve account profile.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/account
 * Pre-flight check & admin-claim safeguard before initiating a Firebase Auth email change.
 * - Rejects cross-user UID tampering (403)
 * - Checks whether target email is already registered to another user (409 auth/email-already-in-use)
 * - Ensures { admin: true } custom claim and users/{uid}.role === 'admin' are persisted on UID
 *   so changing the login email never revokes administrator access.
 */
export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (!authCheck.ok) {
    return NextResponse.json(
      { ok: false, code: 'auth/unauthorized', error: authCheck.error },
      { status: authCheck.status }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON request payload.' },
      { status: 400 }
    )
  }

  // Strictly forbid changing another user's profile via client-supplied uid
  if (typeof body.uid === 'string' && body.uid.trim() && body.uid.trim() !== authCheck.uid) {
    return NextResponse.json(
      { ok: false, code: 'permission-denied', error: 'Cannot modify another administrator profile.' },
      { status: 403 }
    )
  }

  if (body.action !== 'prepare-email-change') {
    return NextResponse.json(
      { ok: false, error: 'Unsupported account action.' },
      { status: 400 }
    )
  }

  const emailValidation = validateEmail(body.newEmail)
  if (!emailValidation.ok) {
    return NextResponse.json(
      { ok: false, code: 'auth/invalid-email', error: emailValidation.error },
      { status: 400 }
    )
  }
  const targetEmail = emailValidation.value

  if (!hasAdminCredentials() || authCheck.uid === 'admin-staff-user') {
    return NextResponse.json({
      ok: true,
      adminSdkActive: false,
      uid: authCheck.uid,
    })
  }

  try {
    const adminAuth = getAdminAuth()

    // 1. Check if target email is already registered to a different Firebase Auth user
    try {
      const existingByEmail = await adminAuth.getUserByEmail(targetEmail)
      if (existingByEmail && existingByEmail.uid !== authCheck.uid) {
        return NextResponse.json(
          {
            ok: false,
            code: 'auth/email-already-in-use',
            error: 'This email address is already registered to another account.',
          },
          { status: 409 }
        )
      }
    } catch (lookupErr: any) {
      if (lookupErr?.code !== 'auth/user-not-found') {
        throw lookupErr
      }
    }

    // 2. Ensure immutable UID carries { admin: true } custom claim and users/{uid}.role === 'admin'
    const currentRecord = await adminAuth.getUser(authCheck.uid)
    if (currentRecord.customClaims?.admin !== true) {
      await adminAuth.setCustomUserClaims(authCheck.uid, {
        ...(currentRecord.customClaims || {}),
        admin: true,
      })
    }

    const userRef = getAdminDb().collection('users').doc(authCheck.uid)
    const userSnap = await userRef.get()
    const existingData = userSnap.exists ? userSnap.data() : undefined

    await userRef.set(
      {
        uid: authCheck.uid,
        email: currentRecord.email || existingData?.email || authCheck.email || '',
        role: existingData?.role || 'admin',
        ...(existingData ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      adminSdkActive: true,
      uid: authCheck.uid,
    })
  } catch (error: any) {
    console.error('[api/admin/account POST] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        code: error?.code || 'internal-error',
        error: 'Unable to validate email change right now. Please try again.',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/account
 * Synchronizes authenticated administrator profile fields (Full Name, pending verification state,
 * and authoritative Firebase Auth email) into Firestore users/{uid} without touching unrelated fields.
 */
export async function PATCH(req: NextRequest) {
  const authCheck = await requireAdmin(req)
  if (!authCheck.ok) {
    return NextResponse.json(
      { ok: false, code: 'auth/unauthorized', error: authCheck.error },
      { status: authCheck.status }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON request payload.' },
      { status: 400 }
    )
  }

  // Strictly forbid changing another user's profile via client-supplied uid
  if (typeof body.uid === 'string' && body.uid.trim() && body.uid.trim() !== authCheck.uid) {
    return NextResponse.json(
      { ok: false, code: 'permission-denied', error: 'Cannot modify another administrator profile.' },
      { status: 403 }
    )
  }

  let validatedName: string | undefined
  if (body.name !== undefined) {
    const nameCheck = validateName(body.name)
    if (!nameCheck.ok) {
      return NextResponse.json(
        { ok: false, field: 'name', error: nameCheck.error },
        { status: 400 }
      )
    }
    validatedName = nameCheck.value
  }

  let validatedPendingEmail: string | null | undefined = undefined
  if (body.pendingEmail === null) {
    validatedPendingEmail = null
  } else if (body.pendingEmail !== undefined) {
    const pendingCheck = validateEmail(body.pendingEmail)
    if (!pendingCheck.ok) {
      return NextResponse.json(
        { ok: false, field: 'email', code: 'auth/invalid-email', error: pendingCheck.error },
        { status: 400 }
      )
    }
    validatedPendingEmail = pendingCheck.value
  }

  if (!hasAdminCredentials() || authCheck.uid === 'admin-staff-user') {
    return NextResponse.json({
      ok: true,
      adminSdkActive: false,
      uid: authCheck.uid,
      name: validatedName,
      pendingEmail: validatedPendingEmail,
    })
  }

  try {
    const adminAuth = getAdminAuth()
    const adminDb = getAdminDb()

    // Update displayName in Firebase Authentication if name changed
    if (validatedName !== undefined) {
      await adminAuth.updateUser(authCheck.uid, { displayName: validatedName })
    }

    // Fetch authoritative Firebase Auth user record so we never store an unverified email as active
    const authoritativeUser = await adminAuth.getUser(authCheck.uid)
    if (authoritativeUser.customClaims?.admin !== true) {
      await adminAuth.setCustomUserClaims(authCheck.uid, {
        ...(authoritativeUser.customClaims || {}),
        admin: true,
      })
    }

    const userRef = adminDb.collection('users').doc(authCheck.uid)
    const existingSnap = await userRef.get()
    const existingData = existingSnap.exists ? existingSnap.data() : undefined

    const authoritativeEmail =
      authoritativeUser.email || existingData?.email || authCheck.email || ''

    const updatePayload: Record<string, unknown> = {
      uid: authCheck.uid,
      email: authoritativeEmail,
      role: existingData?.role || 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    if (!existingSnap.exists) {
      updatePayload.createdAt = admin.firestore.FieldValue.serverTimestamp()
    }

    if (validatedName !== undefined) {
      updatePayload.name = validatedName
      updatePayload.displayName = validatedName
    }

    // Reconcile pendingEmail with authoritative Firebase Auth email
    if (
      authoritativeEmail &&
      existingData?.pendingEmail &&
      existingData.pendingEmail.toLowerCase() === authoritativeEmail.toLowerCase()
    ) {
      updatePayload.pendingEmail = null
      updatePayload.pendingEmailRequestedAt = null
    } else if (validatedPendingEmail === null) {
      updatePayload.pendingEmail = null
      updatePayload.pendingEmailRequestedAt = null
    } else if (typeof validatedPendingEmail === 'string') {
      if (validatedPendingEmail.toLowerCase() === authoritativeEmail.toLowerCase()) {
        updatePayload.pendingEmail = null
        updatePayload.pendingEmailRequestedAt = null
      } else {
        updatePayload.pendingEmail = validatedPendingEmail
        updatePayload.pendingEmailRequestedAt = new Date().toISOString()
      }
    }

    await userRef.set(updatePayload, { merge: true })

    return NextResponse.json({
      ok: true,
      adminSdkActive: true,
      profile: {
        uid: authCheck.uid,
        email: authoritativeEmail,
        emailVerified: authoritativeUser.emailVerified,
        name:
          validatedName ??
          existingData?.name ??
          authoritativeUser.displayName ??
          'Lexmedia Admin',
        pendingEmail:
          updatePayload.pendingEmail !== undefined
            ? updatePayload.pendingEmail
            : existingData?.pendingEmail ?? null,
        role: existingData?.role || 'admin',
      },
    })
  } catch (error: any) {
    console.error('[api/admin/account PATCH] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        code: error?.code || 'internal-error',
        error: 'Failed to save account changes on the server.',
      },
      { status: 500 }
    )
  }
}
