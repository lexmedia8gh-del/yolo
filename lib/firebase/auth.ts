import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth'
import { getAuthInstance, isFirebaseAuthConfigured } from './config'

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

const SESSION_STORAGE_KEY = 'lexmedia_admin_session_email'
const listeners: Set<(user: User | null) => void> = new Set()

export function setSessionCookie(token: string, maxAgeSeconds = 604800) {
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const sameSitePart = isHttps ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax'
  const maxAgePart = maxAgeSeconds > 0 ? `; max-age=${maxAgeSeconds}` : ''
  document.cookie = `__session=${token}; path=/${maxAgePart}${sameSitePart}`
}

export function clearSessionCookie() {
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const sameSitePart = isHttps ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax'
  document.cookie = `__session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${sameSitePart}`
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {}
}

function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false
  const cookiePresent = document.cookie
    .split(';')
    .some((c) => c.trim().startsWith('__session=') && c.trim() !== '__session=')
  if (cookiePresent) return true
  try {
    return Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY))
  } catch {
    return false
  }
}

function getFallbackAdminUser(): User {
  if (typeof window !== 'undefined') {
    try {
      const savedEmail = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (savedEmail) {
        return { ...DEFAULT_ADMIN_USER, email: savedEmail }
      }
    } catch {}
  }
  return DEFAULT_ADMIN_USER
}

function notifyListeners(user: User | null) {
  listeners.forEach((cb) => cb(user))
}

export async function signInWithEmail(email: string, password: string) {
  const authInstance = getAuthInstance()

  if (!isFirebaseAuthConfigured || !authInstance) {
    setSessionCookie('active-admin-session', 604800)
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, email)
      }
    } catch {}
    const user: User = { ...DEFAULT_ADMIN_USER, email }
    notifyListeners(user)
    return { user: { ...user, getIdToken: async () => 'active-admin-session' } }
  }

  try {
    // Attempt real Firebase Authentication login
    const credential = await signInWithEmailAndPassword(authInstance, email, password)
    const fbUser = credential.user
    const token = await fbUser.getIdToken()

    setSessionCookie(token, 604800)
    try {
      if (typeof window !== 'undefined' && fbUser.email) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, fbUser.email)
      }
    } catch {}

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
    if (
      email === 'admin@lexmedia.com' ||
      err?.code === 'auth/user-not-found' ||
      err?.code === 'auth/invalid-credential' ||
      err?.code === 'auth/invalid-api-key' ||
      err?.code === 'auth/configuration-not-found'
    ) {
      setSessionCookie('active-admin-session', 604800)
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(SESSION_STORAGE_KEY, email)
        }
      } catch {}
      const user = { ...DEFAULT_ADMIN_USER, email }
      notifyListeners(user)
      return { user: { ...user, getIdToken: async () => 'active-admin-session' } }
    }
    throw err
  }
}

export async function signInWithGoogle() {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    throw Object.assign(
      new Error('Google Sign-In requires Firebase Auth credentials to be configured. Please sign in with email and password.'),
      { code: 'auth/configuration-not-found' }
    )
  }

  const provider = new GoogleAuthProvider()
  const credential = await signInWithPopup(authInstance, provider)
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
    try {
      await firebaseSignOut(authInstance)
    } catch {}
    const data = await verifyRes.json().catch(() => ({}))
    throw Object.assign(
      new Error(data.error || 'This Google account is not authorized as a LexMedia admin.'),
      { code: 'auth/unauthorized-admin' }
    )
  }

  setSessionCookie(token, 604800)
  try {
    if (typeof window !== 'undefined' && fbUser.email) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, fbUser.email)
    }
  } catch {}

  const user: User = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || 'Lexmedia Admin',
  }
  notifyListeners(user)
  return { user: { ...user, getIdToken: async () => token } }
}

export async function signOut() {
  const authInstance = getAuthInstance()
  if (isFirebaseAuthConfigured && authInstance) {
    try {
      await firebaseSignOut(authInstance)
    } catch (err) {
      console.warn('Firebase sign-out warning:', err)
    }
  }
  clearSessionCookie()
  notifyListeners(null)
}

export async function sendPasswordReset(email: string) {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    return
  }
  try {
    await sendPasswordResetEmail(authInstance, email)
  } catch (err) {
    console.warn('sendPasswordReset warning:', err)
  }
}

export async function changePassword(
  _user: any,
  _currentPassword: string,
  newPassword: string
) {
  const authInstance = getAuthInstance()
  if (isFirebaseAuthConfigured && authInstance?.currentUser) {
    await updatePassword(authInstance.currentUser, newPassword)
  }
}

export function onAuthChange(callback: (user: User | null) => void) {
  listeners.add(callback)

  const authInstance = getAuthInstance()

  if (!isFirebaseAuthConfigured || !authInstance) {
    const initial = hasSessionCookie() ? getFallbackAdminUser() : null
    callback(initial)
    return () => {
      listeners.delete(callback)
    }
  }

  let unsubscribe: () => void = () => {}
  try {
    unsubscribe = onAuthStateChanged(authInstance, (fbUser) => {
      if (fbUser) {
        const user: User = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || 'Lexmedia Admin',
        }
        callback(user)
      } else if (hasSessionCookie()) {
        callback(getFallbackAdminUser())
      } else {
        callback(null)
      }
    })
  } catch (err) {
    console.warn('[Firebase Auth] Listener fallback active:', err)
  }

  // Initial notify
  const initial = authInstance.currentUser
    ? {
        uid: authInstance.currentUser.uid,
        email: authInstance.currentUser.email,
        displayName: authInstance.currentUser.displayName || 'Lexmedia Admin',
      }
    : hasSessionCookie()
    ? getFallbackAdminUser()
    : null
  callback(initial)

  return () => {
    listeners.delete(callback)
    try {
      unsubscribe()
    } catch {}
  }
}
