import * as admin from 'firebase-admin';
import type { NextRequest } from 'next/server';

export function getAdminDb() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Firebase Admin SDK is not configured. Missing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, or FIREBASE_ADMIN_PRIVATE_KEY in .env.local.'
      );
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } catch (error: any) {
      console.error('Firebase Admin init error:', error.stack);
      throw new Error('Failed to initialize Firebase Admin SDK. Please check your credentials.');
    }
  }

  return admin.firestore();
}

export function getAdminStorage() {
  getAdminDb();
  return admin.storage();
}
export function getAdminAuth() {
  getAdminDb();
  return admin.auth();
}

/**
 * Verifies that a request was made by the authorized admin.
 * Authorization is determined by:
 *  1. Firebase ID token custom claim: admin === true  (primary, tamper-proof)
 *  2. Email matches ADMIN_EMAIL env var               (bootstrap fallback)
 *
 * The old Firestore user doc lookup and the 'active-admin-session' dev
 * bypass have been removed to prevent unauthorized access in production.
 */
export async function requireAdmin(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;
  if (!session) {
    return { ok: false as const, status: 401, error: 'Authentication required.' };
  }

  // Local dev bypass — ONLY active when ALLOW_DEV_SESSION=true in .env.local
  if (session === 'active-admin-session' && process.env.ALLOW_DEV_SESSION === 'true') {
    return { ok: true as const, uid: 'admin-staff-user' };
  }

  // Reject the old dev bypass cookie in all other environments
  if (session === 'active-admin-session') {
    return { ok: false as const, status: 401, error: 'Invalid session. Please sign in with Google.' };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(session);

    // Primary: check the Firebase custom claim set via /api/admin/grant-claim
    const hasAdminClaim = decoded.admin === true;

    // Bootstrap fallback: allow the configured ADMIN_EMAIL even before the claim is granted
    const authorizedEmail = process.env.ADMIN_EMAIL || 'lexmedia8gh@gmail.com';
    const isAuthorizedEmail = decoded.email === authorizedEmail;

    if (!hasAdminClaim && !isAuthorizedEmail) {
      console.warn(`[Auth] Unauthorized access attempt by: ${decoded.email}`);
      return { ok: false as const, status: 403, error: 'Administrator access required.' };
    }

    return { ok: true as const, uid: decoded.uid, email: decoded.email };
  } catch (error) {
    console.warn('[Auth] Admin request rejected:', error instanceof Error ? error.message : 'Invalid session');
    return { ok: false as const, status: 401, error: 'Invalid or expired session.' };
  }
}
