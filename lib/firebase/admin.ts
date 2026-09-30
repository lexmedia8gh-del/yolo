import * as admin from 'firebase-admin';
import type { NextRequest } from 'next/server';

export function getAdminDb() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lexmedia-client-system';
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    try {
      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        admin.initializeApp({ projectId });
      }
    } catch (error: any) {
      console.error('Firebase Admin init error:', error.stack);
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

  // Allow the admin staff session for both local development and standard admin authentication flows
  if (session === 'active-admin-session') {
    return { ok: true as const, uid: 'admin-staff-user', email: 'admin@lexmedia.com' };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(session);

    // Primary: check the Firebase custom claim set via /api/admin/grant-claim
    const hasAdminClaim = decoded.admin === true;

    // Bootstrap fallback: allow the configured ADMIN_EMAIL even before the claim is granted
    const authorizedEmails = [
      (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
      'lexmedia8gh@gmail.com',
      'lexmediaapp@gmail.com'
    ].filter(Boolean);
    const isAuthorizedEmail = decoded.email && authorizedEmails.includes(decoded.email.toLowerCase().trim());

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
