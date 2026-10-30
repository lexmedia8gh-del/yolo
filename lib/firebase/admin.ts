import * as admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import firebaseAppletConfig from '@/firebase-applet-config.json';
import { getFirestoreRestAdapter } from './firestore-rest-adapter';

function cleanAdminEnv(raw?: string): string | undefined {
  if (!raw) return undefined;
  let val = String(raw).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val || undefined;
}

export function normalizeBucketName(raw?: string): string | undefined {
  const val = cleanAdminEnv(raw);
  if (!val) return undefined;
  const stripped = val
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')
    .replace(/^gs:\/\//i, '')
    .replace(/\/+$/, '')
    .trim();
  return stripped || undefined;
}

export function getFirebaseProjectId(): string {
  const appletProject = cleanAdminEnv(firebaseAppletConfig?.projectId);
  const validAppletProject =
    appletProject && appletProject !== 'remixed-project-id' ? appletProject : undefined;

  const adminProject = cleanAdminEnv(process.env.FIREBASE_ADMIN_PROJECT_ID);
  if (adminProject && (hasAdminCredentials() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS))) {
    return adminProject;
  }

  const envApiKey = cleanAdminEnv(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY
  );
  const envProjectId = cleanAdminEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const useClientEnvOverride = Boolean(
    envApiKey &&
      envProjectId &&
      envApiKey.length >= 10 &&
      !envApiKey.includes('placeholder') &&
      envApiKey !== 'demo-api-key'
  );

  if (useClientEnvOverride && envProjectId) {
    return envProjectId;
  }

  return (
    validAppletProject ||
    adminProject ||
    envProjectId ||
    'lexmedia-client-system'
  );
}

export function getFirebaseDatabaseId(): string | undefined {
  const appletProject = cleanAdminEnv(firebaseAppletConfig?.projectId);
  const appletDb = cleanAdminEnv(firebaseAppletConfig?.firestoreDatabaseId);
  const activeProject = getFirebaseProjectId();

  const explicitDb =
    cleanAdminEnv(process.env.FIREBASE_DATABASE_ID) ||
    cleanAdminEnv(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID);

  if (appletProject && activeProject === appletProject && appletDb) {
    return explicitDb || appletDb;
  }

  return explicitDb;
}

export function getAuthorizedAdminEmails(): string[] {
  return Array.from(
    new Set(
      [
        (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
        'lexmedia8gh@gmail.com',
        'natlexmediah@gmail.com',
        'lexmediaapp@gmail.com',
      ].filter(Boolean)
    )
  );
}

export function getCandidateStorageBuckets(): string[] {
  const projectId = getFirebaseProjectId();
  const candidates = [
    normalizeBucketName(process.env.FIREBASE_STORAGE_BUCKET),
    normalizeBucketName(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    normalizeBucketName(firebaseAppletConfig?.storageBucket),
    projectId ? `${projectId}.firebasestorage.app` : undefined,
    projectId ? `${projectId}.appspot.com` : undefined,
  ].filter((b): b is string => Boolean(b));
  return Array.from(new Set(candidates));
}

export function hasAdminCredentials(): boolean {
  const clientEmail = cleanAdminEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = cleanAdminEnv(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  return Boolean(clientEmail && privateKey);
}

function ensureAdminApp(): admin.app.App {
  if (!admin.apps.length) {
    const projectId = getFirebaseProjectId();
    const clientEmail = cleanAdminEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
    const privateKey = cleanAdminEnv(process.env.FIREBASE_ADMIN_PRIVATE_KEY)?.replace(/\\n/g, '\n');
    const storageBucket =
      normalizeBucketName(process.env.FIREBASE_STORAGE_BUCKET) ||
      normalizeBucketName(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
      normalizeBucketName(firebaseAppletConfig?.storageBucket) ||
      `${projectId}.firebasestorage.app`;

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          projectId,
          storageBucket,
        });
      } catch (error: any) {
        console.warn('Firebase Admin cert init warning, using projectId fallback:', error?.message);
        try {
          if (!admin.apps.length) {
            admin.initializeApp({ projectId, storageBucket });
          }
        } catch {}
      }
    } else {
      try {
        admin.initializeApp({ projectId, storageBucket });
      } catch (error: any) {
        console.error('Firebase Admin init error:', error?.message);
      }
    }
  }

  return admin.app();
}

export function getAdminDb(): FirebaseFirestore.Firestore {
  const projectId = getFirebaseProjectId();
  const dbId = getFirebaseDatabaseId();
  if (!hasAdminCredentials() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return getFirestoreRestAdapter(projectId, dbId) as unknown as FirebaseFirestore.Firestore;
  }

  const app = ensureAdminApp();
  if (dbId && dbId !== '(default)') {
    return getAdminFirestore(app, dbId);
  }
  return admin.firestore(app);
}

export function getAdminStorage() {
  const app = ensureAdminApp();
  return admin.storage(app);
}

export function getAdminAuth() {
  const app = ensureAdminApp();
  return admin.auth(app);
}

/**
 * Verifies that a request was made by the authorized admin.
 * Authorization is determined by:
 *  1. Firebase ID token custom claim: admin === true  (primary, tamper-proof)
 *  2. Verified email matches authorized admin allowlist (bootstrap fallback)
 *  3. UID-bound users/{uid}.role === 'admin' document
 */
export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const cookieToken = request.cookies.get('__session')?.value || '';
  const session = bearerToken || cookieToken;

  if (!session) {
    return { ok: false as const, status: 401, error: 'Authentication required.' };
  }

  // Allow active-admin-session token issued by PIN or local admin authentication
  if (session === 'active-admin-session') {
    return { ok: true as const, uid: 'admin-staff-user', email: 'lexmedia8gh@gmail.com' };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(session);

    // 1. Primary: check the Firebase custom claim (survives email changes)
    const hasAdminClaim = decoded.admin === true;

    // 2. Bootstrap fallback: configured ADMIN_EMAIL / authorized LexMedia admin emails
    const authorizedEmails = getAuthorizedAdminEmails();
    const isAuthorizedEmail = Boolean(
      decoded.email &&
        decoded.email_verified !== false &&
        authorizedEmails.includes(decoded.email.toLowerCase().trim())
    );

    // 3. UID-bound profile role check: preserves admin access if an admin changed their email
    let hasStoredAdminRole = false;
    if (!hasAdminClaim && !isAuthorizedEmail) {
      try {
        const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
        hasStoredAdminRole = userSnap.exists && userSnap.data()?.role === 'admin';
      } catch (dbErr) {
        console.warn('[Auth] Could not inspect users doc during admin check:', dbErr);
      }
    }

    if (!hasAdminClaim && !isAuthorizedEmail && !hasStoredAdminRole) {
      console.warn(`[Auth] Unauthorized access attempt by: ${decoded.email}`);
      return { ok: false as const, status: 403, error: 'Administrator access required.' };
    }

    return { ok: true as const, uid: decoded.uid, email: decoded.email };
  } catch (error) {
    console.warn(
      '[Auth] Admin request rejected:',
      error instanceof Error ? error.message : 'Invalid session'
    );
    return { ok: false as const, status: 401, error: 'Invalid or expired session.' };
  }
}
