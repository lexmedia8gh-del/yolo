import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { getAuth, type Auth } from 'firebase/auth'
import firebaseAppletConfig from '@/firebase-applet-config.json'

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

const envApiKey = cleanFirebaseEnv(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY
)
const envProjectId = cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
const useEnvOverride = Boolean(
  envApiKey &&
    envProjectId &&
    envApiKey.length >= 10 &&
    !envApiKey.includes('placeholder') &&
    envApiKey !== 'demo-api-key'
)

const appletProjectId = cleanFirebaseEnv(firebaseAppletConfig?.projectId)
const appletDatabaseId = cleanFirebaseEnv(firebaseAppletConfig?.firestoreDatabaseId)

const firebaseConfig = useEnvOverride
  ? {
      apiKey: envApiKey,
      authDomain:
        cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ||
        `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket:
        cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
        `${envProjectId}.firebasestorage.app`,
      messagingSenderId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
      appId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
      measurementId: cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID),
    }
  : {
      apiKey: cleanFirebaseEnv(firebaseAppletConfig?.apiKey),
      authDomain: cleanFirebaseEnv(firebaseAppletConfig?.authDomain),
      projectId: appletProjectId,
      storageBucket: cleanFirebaseEnv(firebaseAppletConfig?.storageBucket),
      messagingSenderId: cleanFirebaseEnv(firebaseAppletConfig?.messagingSenderId),
      appId: cleanFirebaseEnv(firebaseAppletConfig?.appId),
      measurementId: cleanFirebaseEnv(firebaseAppletConfig?.measurementId),
    }

export const resolvedFirestoreDatabaseId =
  cleanFirebaseEnv(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID) ||
  (firebaseConfig.projectId === appletProjectId ? appletDatabaseId : undefined)

const hasValidConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'remixed-project-id' &&
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
      if (typeof window !== 'undefined') {
        try {
          dbInstance = resolvedFirestoreDatabaseId
            ? initializeFirestore(
                app,
                { experimentalAutoDetectLongPolling: true },
                resolvedFirestoreDatabaseId
              )
            : initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
        } catch {
          dbInstance = resolvedFirestoreDatabaseId
            ? getFirestore(app, resolvedFirestoreDatabaseId)
            : getFirestore(app)
        }
      } else {
        dbInstance = resolvedFirestoreDatabaseId
          ? getFirestore(app, resolvedFirestoreDatabaseId)
          : getFirestore(app)
      }
    } catch (err) {
      console.warn('[Firebase] Firestore initialization skipped:', err)
      dbInstance = null
    }

    // Initialize Firebase Client Auth & verify Firestore reachability in browser context
    if (typeof window !== 'undefined') {
      try {
        authInstance = getAuth(app)
      } catch (err) {
        console.warn('[Firebase] Auth initialization skipped:', err)
        authInstance = null
      }

      if (dbInstance) {
        const activeDb = dbInstance
        getDocFromServer(doc(activeDb, 'test', 'connection')).catch((error: unknown) => {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error('Please check your Firebase configuration.')
          }
        })
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
