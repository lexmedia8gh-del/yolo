import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAIbgXrTEEma9lB6x745P2mTG68U7HoGXU',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'lexmedia-client-system.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lexmedia-client-system',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lexmedia-client-system.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '829561425796',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:829561425796:web:678f79a2abc8c0543a57d1',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Prevent multiple initialization in Next.js dev mode
const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)

// Explicitly pass the bucket URL to avoid default bucket resolution issues.
// Firebase Storage requires the correct bucket format:
//   Old format: <project-id>.appspot.com
//   New format: <project-id>.firebasestorage.app
// The storageBucket in firebaseConfig is used automatically by getStorage(app).
export const storage = getStorage(app)

export default app


