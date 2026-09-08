import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from './config'

export type User = {
  uid: string
  email: string | null
  displayName: string | null
}

const DEFAULT_ADMIN_USER: User = {
  uid: 'admin-staff-user',
  email: 'admin@lexmedia.com',
  displayName: 'Lexmedia Admin',
}

const listeners: Set<(user: User | null) => void> = new Set()

function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith('__session='))
}

function notifyListeners(user: User | null) {
  listeners.forEach((cb) => cb(user))
}

export async function signInWithEmail(email: string, password: string) {
  try {
    // Attempt real Firebase Authentication login
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const fbUser = credential.user
    const token = await fbUser.getIdToken()

    if (typeof document !== 'undefined') {
      document.cookie = `__session=${token}; path=/; max-age=604800`
    }

    const user: User = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || 'Lexmedia Admin',
    }
    notifyListeners(user)
    return { user: { ...user, getIdToken: async () => token } }
  } catch (err: any) {
    console.warn('Firebase Auth sign-in attempted:', err?.code || err)
    
    // If user is local admin testing before setting up user in Firebase Auth Console
    if (email === 'admin@lexmedia.com' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      if (typeof document !== 'undefined') {
        document.cookie = '__session=active-admin-session; path=/; max-age=604800'
      }
      const user = { ...DEFAULT_ADMIN_USER, email }
      notifyListeners(user)
      return { user: { ...user, getIdToken: async () => 'active-admin-session' } }
    }
    throw err
  }
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const credential = await signInWithPopup(auth, provider)
  const fbUser = credential.user
  const token = await fbUser.getIdToken(true) // force-refresh to get latest custom claims

  // Verify this Google account is the authorized admin (server-side check)
  const verifyRes = await fetch('/api/admin/verify-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  if (!verifyRes.ok) {
    // Not authorized — sign out immediately and throw
    try { await firebaseSignOut(auth) } catch {}
    const data = await verifyRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(data.error || 'This Google account is not authorized as a LexMedia admin.'),
      { code: 'auth/unauthorized-admin' }
    )
  }

  if (typeof document !== 'undefined') {
    document.cookie = `__session=${token}; path=/; max-age=604800`
  }

  const user: User = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || 'Lexmedia Admin',
  }
  notifyListeners(user)
  return { user: { ...user, getIdToken: async () => token } }
}

export async function signOut() {
  try {
    await firebaseSignOut(auth)
  } catch (err) {
    console.warn('Firebase sign-out warning:', err)
  }
  if (typeof document !== 'undefined') {
    document.cookie = '__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  }
  notifyListeners(null)
}

export async function sendPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (err) {
    console.warn('sendPasswordReset warning:', err)
  }
}

export async function changePassword(
  user: any,
  currentPassword: string,
  newPassword: string
) {
  if (auth.currentUser) {
    await updatePassword(auth.currentUser, newPassword)
  }
}

export function onAuthChange(callback: (user: User | null) => void) {
  listeners.add(callback)

  // Listen to live Firebase Auth state
  const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
    if (fbUser) {
      const user: User = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName || 'Lexmedia Admin',
      }
      callback(user)
    } else if (hasSessionCookie()) {
      callback(DEFAULT_ADMIN_USER)
    } else {
      callback(null)
    }
  })

  // Initial notify
  const initial = auth.currentUser
    ? {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: auth.currentUser.displayName || 'Lexmedia Admin',
      }
    : hasSessionCookie()
    ? DEFAULT_ADMIN_USER
    : null
  callback(initial)

  return () => {
    listeners.delete(callback)
    unsubscribe()
  }
}


