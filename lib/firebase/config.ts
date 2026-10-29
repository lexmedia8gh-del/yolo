import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { getAuth, type Auth } from 'firebase/auth'

function cleanFirebaseEnv(raw?: string): string | undefined {
  if (!raw) return undefined
  let val = String(raw).trim()
  // Strip accidental KEY= prefix if pasted into environment variables
  val = val.replace(/^[A-Z0-9_]+\s*=\s*/i, '').trim()
  // Strip surrounding quotes
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim()
  }
  return val || undefined
}

const firebaseConfig = {
  apiKey: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY),
  authDomain: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID),
}

const hasValidConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey.length >= 10 &&
    !firebaseConfig.apiKey.includes('placeholder') &&
    firebaseConfig.apiKey !== 'demo-api-key'
)

let app: FirebaseApp | null = null
let dbInstance: Firestore | null = null
let authInstance: Auth | null = null
let storageInstance: FirebaseStorage | null = null

if (hasValidConfig) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  } catch (err) {
    console.warn('[Firebase] App initialization skipped:', err)
    app = null
  }

  if (app) {
    try {
      dbInstance = getFirestore(app)
    } catch (err) {
      console.warn('[Firebase] Firestore initialization skipped:', err)
      dbInstance = null
    }

    // Only initialize Firebase Client Auth in browser context to prevent SSR/build auth/invalid-api-key errors
    if (typeof window !== 'undefined') {
      try {
        authInstance = getAuth(app)
      } catch (err) {
        console.warn('[Firebase] Auth initialization skipped:', err)
        authInstance = null
      }
    }

    try {
      storageInstance = getStorage(app)
    } catch (err) {
      console.warn('[Firebase] Storage initialization skipped:', err)
      storageInstance = null
    }
  }
}

export const isFirebaseConfigured = Boolean(app && dbInstance)
export const isFirebaseAuthConfigured = Boolean(app && authInstance)
export const isFirebaseStorageConfigured = Boolean(app && storageInstance)

export const db: Firestore = (dbInstance ?? ({} as unknown)) as Firestore
export const auth: Auth = (authInstance ?? ({} as unknown)) as Auth
export const storage: FirebaseStorage = (storageInstance ?? ({} as unknown)) as FirebaseStorage
export const getAuthInstance = (): Auth | null => authInstance

export default app
