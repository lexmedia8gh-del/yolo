import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  updateEmail,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, getAuthInstance, isFirebaseAuthConfigured, isFirebaseConfigured } from './config'

export type User = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL?: string | null
  emailVerified?: boolean
  providerIds?: string[]
}

export type EmailChangeResult =
  | {
      status: 'updated'
      activeEmail: string
    }
  | {
      status: 'verification_sent'
      activeEmail: string
      pendingEmail: string
    }

interface LocalAdminAuthRecord {
  uid: string
  email: string
  displayName: string
  password?: string
  lastAuthenticatedAt: number
}

const DEFAULT_ADMIN_USER: User = {
  uid: 'admin-staff-user',
  email: 'lexmedia8gh@gmail.com',
  displayName: 'Lexmedia Admin',
  emailVerified: true,
  providerIds: ['password'],
}

const LOCAL_ALLOWED_ADMIN_EMAILS = new Set([
  'natlexmediah@gmail.com',
  'lexmedia8gh@gmail.com',
  'lexmediaapp@gmail.com',
  'admin@lexmedia.com',
  'admin@lexmedia.gh',
])

const SESSION_STORAGE_KEY = 'lexmedia_admin_session_email'
const LOCAL_AUTH_STORAGE_KEY = 'lexmedia_local_admin_auth'
const PIN_SESSION_STORAGE_KEY = 'lexmedia_pin_session_active'
const ACTIVE_TOKEN_STORAGE_KEY = 'lexmedia_active_id_token'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

let inMemoryActiveToken = ''

const listeners: Set<(user: User | null) => void> = new Set()

function createAuthError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function mapFirebaseUser(fbUser: FirebaseUser): User {
  const providerIds = (fbUser.providerData || [])
    .map((p) => p?.providerId)
    .filter((id): id is string => Boolean(id))

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || null,
    photoURL: fbUser.photoURL || null,
    emailVerified: fbUser.emailVerified,
    providerIds: providerIds.length > 0 ? providerIds : ['password'],
  }
}

function readLocalAuthRecord(): LocalAdminAuthRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.email === 'string') {
      return parsed as LocalAdminAuthRecord
    }
  } catch {}
  return null
}

function writeLocalAuthRecord(record: LocalAdminAuthRecord) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(record))
    sessionStorage.setItem(SESSION_STORAGE_KEY, record.email)
  } catch {}
}

export function setSessionCookie(token: string, maxAgeSeconds = 604800) {
  if (token) {
    inMemoryActiveToken = token
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(ACTIVE_TOKEN_STORAGE_KEY, token)
      } catch {}
    }
  }
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const sameSitePart = isHttps ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax'
  const maxAgePart = maxAgeSeconds > 0 ? `; max-age=${maxAgeSeconds}` : ''
  document.cookie = `__session=${token}; path=/${maxAgePart}${sameSitePart}`
}

let lastSyncedServerToken = ''

export async function syncServerSessionCookie(token: string, maxAgeSeconds = 604800): Promise<void> {
  if (typeof window === 'undefined' || !token) return
  if (lastSyncedServerToken === token) return
  lastSyncedServerToken = token
  try {
    await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, maxAgeSeconds }),
    })
  } catch {
    lastSyncedServerToken = ''
  }
}

export async function clearServerSessionCookie(): Promise<void> {
  lastSyncedServerToken = ''
  if (typeof window === 'undefined') return
  try {
    await fetch('/api/admin/session', { method: 'DELETE' })
  } catch {}
}

export function clearSessionCookie() {
  inMemoryActiveToken = ''
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY)
      sessionStorage.removeItem(ACTIVE_TOKEN_STORAGE_KEY)
    } catch {}
    try {
      localStorage.removeItem(PIN_SESSION_STORAGE_KEY)
    } catch {}
  }
  if (typeof document === 'undefined') return
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const sameSitePart = isHttps ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax'
  document.cookie = `__session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${sameSitePart}`
  document.cookie = `__session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function getSessionCookieValue(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__session='))
  return match ? match.slice('__session='.length).trim() : ''
}

function hasSessionCookie(): boolean {
  if (getSessionCookieValue()) return true
  if (inMemoryActiveToken) return true
  if (typeof window !== 'undefined') {
    try {
      if (sessionStorage.getItem(SESSION_STORAGE_KEY)) return true
      if (sessionStorage.getItem(PIN_SESSION_STORAGE_KEY) === 'true') return true
      if (sessionStorage.getItem(ACTIVE_TOKEN_STORAGE_KEY)) return true
    } catch {}
    try {
      if (localStorage.getItem(PIN_SESSION_STORAGE_KEY) === 'true') return true
    } catch {}
  }
  return false
}

function hasLocalAdminSessionCookie(): boolean {
  if (getSessionCookieValue() === 'active-admin-session') return true
  if (inMemoryActiveToken === 'active-admin-session') return true
  if (typeof window !== 'undefined') {
    try {
      if (sessionStorage.getItem(PIN_SESSION_STORAGE_KEY) === 'true') return true
    } catch {}
    try {
      if (localStorage.getItem(PIN_SESSION_STORAGE_KEY) === 'true') return true
    } catch {}
  }
  return false
}

function getFallbackAdminUser(): User {
  if (typeof window !== 'undefined') {
    const storedRecord = readLocalAuthRecord()
    if (storedRecord) {
      return {
        uid: storedRecord.uid || DEFAULT_ADMIN_USER.uid,
        email: storedRecord.email,
        displayName: storedRecord.displayName || DEFAULT_ADMIN_USER.displayName,
        emailVerified: true,
        providerIds: ['password'],
      }
    }
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

async function ensureAdminFirestoreProfile(fbUser: FirebaseUser): Promise<void> {
  if (!isFirebaseConfigured || !fbUser?.uid) return
  try {
    const userRef = doc(db, 'users', fbUser.uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) {
      const defaultName = fbUser.displayName?.trim() || 'LexMedia Admin'
      await setDoc(
        userRef,
        {
          uid: fbUser.uid,
          email: fbUser.email || '',
          name: defaultName,
          displayName: defaultName,
          photoURL: fbUser.photoURL || null,
          role: 'admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } else if (fbUser.photoURL && !snap.data()?.photoURL) {
      await setDoc(
        userRef,
        {
          photoURL: fbUser.photoURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    }
  } catch (err) {
    console.warn('[Auth] Admin profile bootstrap skipped:', err)
  }
}

export function hasActiveFirebaseUser(): boolean {
  const authInstance = getAuthInstance()
  return Boolean(isFirebaseAuthConfigured && authInstance?.currentUser)
}

export async function getActiveIdToken(forceRefresh = false): Promise<string | null> {
  const authInstance = getAuthInstance()
  if (isFirebaseAuthConfigured && authInstance) {
    if (!authInstance.currentUser && typeof (authInstance as any).authStateReady === 'function') {
      try {
        await Promise.race([
          (authInstance as any).authStateReady(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ])
      } catch {}
    }

    if (authInstance.currentUser) {
      const token = await authInstance.currentUser.getIdToken(forceRefresh)
      if (token) {
        setSessionCookie(token, 604800)
      }
      return token
    }
  }

  if (hasLocalAdminSessionCookie()) {
    return 'active-admin-session'
  }

  const cookieToken = getSessionCookieValue()
  if (cookieToken) return cookieToken
  if (inMemoryActiveToken) return inMemoryActiveToken

  if (typeof window !== 'undefined') {
    try {
      const savedToken = sessionStorage.getItem(ACTIVE_TOKEN_STORAGE_KEY)
      if (savedToken) return savedToken
    } catch {}
  }

  if (hasSessionCookie()) {
    return 'active-admin-session'
  }
  return null
}

export async function getAdminAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const token = await getActiveIdToken(forceRefresh)
    if (token) {
      return { Authorization: `Bearer ${token}` }
    }
  } catch (err) {
    console.warn('[Auth] Token refresh warning, checking fallback session:', err)
    if (hasLocalAdminSessionCookie() || hasSessionCookie()) {
      return { Authorization: 'Bearer active-admin-session' }
    }
  }
  return {}
}

export async function signInWithPin(pin: string): Promise<{ user: User }> {
  const cleanPin = pin.trim()
  if (!/^[0-9]{6}$/.test(cleanPin)) {
    throw createAuthError('auth/invalid-pin', 'Please enter a valid six-digit PIN.')
  }

  const res = await fetch('/api/auth/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', pin: cleanPin }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw createAuthError(
      data.code || (res.status === 429 ? 'auth/too-many-requests' : 'auth/invalid-pin'),
      data.error || 'Incorrect 6-digit PIN. Please try again.'
    )
  }

  const user = getFallbackAdminUser()
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(PIN_SESSION_STORAGE_KEY, 'true')
      sessionStorage.setItem(SESSION_STORAGE_KEY, user.email || DEFAULT_ADMIN_USER.email || 'lexmedia8gh@gmail.com')
    } catch {}
    try {
      localStorage.setItem(PIN_SESSION_STORAGE_KEY, 'true')
    } catch {}
  }
  setSessionCookie('active-admin-session', 604800)
  await syncServerSessionCookie('active-admin-session', 604800)
  notifyListeners(user)
  return { user }
}

export async function changePin(currentPin: string, newPin: string, confirmPin: string): Promise<void> {
  const token = await getActiveIdToken()
  if (!token) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }

  const res = await fetch('/api/auth/pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'change',
      currentPin,
      newPin,
      confirmPin,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw createAuthError(
      data.code || 'auth/invalid-pin-change',
      data.error || 'Failed to update 6-digit PIN.'
    )
  }
}

export async function resetPinWithGoogle(newPin: string, confirmPin: string): Promise<void> {
  const authInstance = getAuthInstance()
  let googleToken = ''

  if (isFirebaseAuthConfigured && authInstance) {
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const credential = await signInWithPopup(authInstance, provider)
      googleToken = await credential.user.getIdToken(true)
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        throw createAuthError('auth/popup-closed-by-user', 'Google verification window was closed.')
      }
      throw err
    }
  }

  const sessionToken = await getActiveIdToken()
  const res = await fetch('/api/auth/pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({
      action: 'reset',
      googleToken,
      newPin,
      confirmPin,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    throw createAuthError(
      data.code || 'auth/invalid-pin-reset',
      data.error || 'Failed to reset 6-digit PIN.'
    )
  }
}

export async function signInWithEmail(email: string, password: string, rememberMe = true) {
  const normalizedEmail = email.trim().toLowerCase()
  const cookieMaxAge = rememberMe ? 604800 : 86400
  const authInstance = getAuthInstance()

  if (!isFirebaseAuthConfigured || !authInstance) {
    const existing = readLocalAuthRecord()
    if (existing) {
      const sameStoredEmail = existing.email.toLowerCase() === normalizedEmail
      if (!sameStoredEmail && !LOCAL_ALLOWED_ADMIN_EMAILS.has(normalizedEmail)) {
        throw createAuthError('auth/user-not-found', 'No account found with this email.')
      }
      if (sameStoredEmail && existing.password && existing.password !== password) {
        throw createAuthError('auth/invalid-credential', 'Incorrect password or invalid credentials.')
      }
    }

    const updatedRecord: LocalAdminAuthRecord = {
      uid: existing?.uid || DEFAULT_ADMIN_USER.uid,
      email: normalizedEmail,
      displayName: existing?.displayName || DEFAULT_ADMIN_USER.displayName || 'Lexmedia Admin',
      password,
      lastAuthenticatedAt: Date.now(),
    }
    writeLocalAuthRecord(updatedRecord)
    setSessionCookie('active-admin-session', cookieMaxAge)
    await syncServerSessionCookie('active-admin-session', cookieMaxAge)

    const user: User = {
      uid: updatedRecord.uid,
      email: updatedRecord.email,
      displayName: updatedRecord.displayName,
      emailVerified: true,
      providerIds: ['password'],
    }
    notifyListeners(user)
    return { user: { ...user, getIdToken: async () => 'active-admin-session' } }
  }

  try {
    try {
      await setPersistence(
        authInstance,
        rememberMe ? browserLocalPersistence : browserSessionPersistence
      )
    } catch {
      // Ignore storage persistence restrictions in restricted iframes / private browsing
    }

    const credential = await signInWithEmailAndPassword(authInstance, normalizedEmail, password)
    const fbUser = credential.user
    const token = await fbUser.getIdToken(true)

    const verifyRes = await fetch('/api/admin/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, maxAgeSeconds: cookieMaxAge }),
    })

    if (!verifyRes.ok) {
      try {
        await firebaseSignOut(authInstance)
      } catch {}
      const data = await verifyRes.json().catch(() => ({}))
      throw createAuthError(
        'auth/unauthorized-admin',
        data.error || 'This account is not authorized as a LexMedia workspace administrator.'
      )
    }

    const verifyData = await verifyRes.json().catch(() => ({}))
    const activeToken = verifyData?.claimUpdated ? await fbUser.getIdToken(true) : token

    setSessionCookie(activeToken, cookieMaxAge)
    await syncServerSessionCookie(activeToken, cookieMaxAge)

    try {
      if (typeof window !== 'undefined' && fbUser.email) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, fbUser.email)
      }
    } catch {}

    await ensureAdminFirestoreProfile(fbUser)

    const user = mapFirebaseUser(fbUser)
    notifyListeners(user)
    return { user: { ...user, getIdToken: async () => activeToken } }
  } catch (err: any) {
    console.warn('Firebase Auth sign-in attempted:', err?.code || err)

    // Only fall back to local session if Firebase Auth API keys themselves are invalid/missing
    if (
      err?.code === 'auth/invalid-api-key' ||
      err?.code === 'auth/configuration-not-found'
    ) {
      const updatedRecord: LocalAdminAuthRecord = {
        uid: DEFAULT_ADMIN_USER.uid,
        email: normalizedEmail,
        displayName: DEFAULT_ADMIN_USER.displayName || 'Lexmedia Admin',
        password,
        lastAuthenticatedAt: Date.now(),
      }
      writeLocalAuthRecord(updatedRecord)
      setSessionCookie('active-admin-session', cookieMaxAge)
      await syncServerSessionCookie('active-admin-session', cookieMaxAge)
      const user: User = {
        uid: updatedRecord.uid,
        email: updatedRecord.email,
        displayName: updatedRecord.displayName,
        emailVerified: true,
        providerIds: ['password'],
      }
      notifyListeners(user)
      return { user: { ...user, getIdToken: async () => 'active-admin-session' } }
    }

    throw err
  }
}

export async function signInWithGoogle() {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    throw createAuthError(
      'auth/configuration-not-found',
      'Google Sign-In requires Firebase Auth credentials to be configured.'
    )
  }

  const provider = new GoogleAuthProvider()
  provider.addScope('email')
  provider.addScope('profile')
  provider.setCustomParameters({ prompt: 'select_account' })

  // IMPORTANT: signInWithPopup MUST be the first awaited call so browser popup blockers
  // preserve the transient user-activation gesture inside iframes and mobile browsers.
  const credential = await signInWithPopup(authInstance, provider)
  const fbUser = credential.user
  const token = await fbUser.getIdToken(true)

  const verifyRes = await fetch('/api/admin/verify-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, maxAgeSeconds: 604800 }),
  })

  if (!verifyRes.ok) {
    try {
      await firebaseSignOut(authInstance)
    } catch {}
    clearSessionCookie()
    await clearServerSessionCookie()
    const data = await verifyRes.json().catch(() => ({}))
    throw createAuthError(
      'auth/unauthorized-admin',
      data.error || 'This Google account is not authorized as a LexMedia workspace administrator.'
    )
  }

  const verifyData = await verifyRes.json().catch(() => ({}))
  const finalToken = verifyData?.claimUpdated ? await fbUser.getIdToken(true) : token

  setSessionCookie(finalToken, 604800)
  await syncServerSessionCookie(finalToken, 604800)

  try {
    if (typeof window !== 'undefined' && fbUser.email) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, fbUser.email)
    }
  } catch {}

  await ensureAdminFirestoreProfile(fbUser)

  const user = mapFirebaseUser(fbUser)
  notifyListeners(user)
  return { user: { ...user, getIdToken: async () => finalToken } }
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
  await clearServerSessionCookie()
  notifyListeners(null)
}

export async function sendPasswordReset(email: string) {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    return
  }
  await sendPasswordResetEmail(authInstance, email.trim())
}

export async function reauthenticateAdminWithPassword(currentPassword: string): Promise<void> {
  if (!currentPassword) {
    throw createAuthError('auth/wrong-password', 'Current password is required to verify your identity.')
  }

  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    if (!hasSessionCookie()) {
      throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
    }
    const existing = readLocalAuthRecord()
    if (existing?.password && existing.password !== currentPassword) {
      throw createAuthError('auth/wrong-password', 'Current password is incorrect.')
    }
    writeLocalAuthRecord({
      uid: existing?.uid || DEFAULT_ADMIN_USER.uid,
      email: existing?.email || DEFAULT_ADMIN_USER.email || 'admin@lexmedia.com',
      displayName: existing?.displayName || DEFAULT_ADMIN_USER.displayName || 'Lexmedia Admin',
      password: existing?.password || currentPassword,
      lastAuthenticatedAt: Date.now(),
    })
    return
  }

  const fbUser = authInstance.currentUser
  if (!fbUser) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }
  if (!fbUser.email) {
    throw createAuthError('auth/operation-not-allowed', 'No email address is associated with this session.')
  }

  const credential = EmailAuthProvider.credential(fbUser.email, currentPassword)
  await reauthenticateWithCredential(fbUser, credential)
  const freshToken = await fbUser.getIdToken(true)
  setSessionCookie(freshToken, 604800)
}

export async function reauthenticateAdminWithGoogle(): Promise<void> {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    throw createAuthError(
      'auth/configuration-not-found',
      'Google reauthentication requires Firebase Auth credentials.'
    )
  }

  const fbUser = authInstance.currentUser
  if (!fbUser) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }

  await reauthenticateWithPopup(fbUser, new GoogleAuthProvider())
  const freshToken = await fbUser.getIdToken(true)
  setSessionCookie(freshToken, 604800)
}

export async function changePassword(
  _user: unknown,
  currentPassword: string,
  newPassword: string
) {
  if (!currentPassword) {
    throw createAuthError('auth/wrong-password', 'Current password is required.')
  }
  if (!newPassword || newPassword.length < 6) {
    throw createAuthError('auth/weak-password', 'Password must be at least 6 characters.')
  }

  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    await reauthenticateAdminWithPassword(currentPassword)
    const existing = readLocalAuthRecord()
    if (existing) {
      writeLocalAuthRecord({
        ...existing,
        password: newPassword,
        lastAuthenticatedAt: Date.now(),
      })
    }
    return
  }

  const fbUser = authInstance.currentUser
  if (!fbUser) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }

  await reauthenticateAdminWithPassword(currentPassword)
  await updatePassword(fbUser, newPassword)
  const freshToken = await fbUser.getIdToken(true)
  setSessionCookie(freshToken, 604800)
}

export async function updateAdminDisplayName(newDisplayName: string): Promise<User> {
  const trimmed = newDisplayName.trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length < 2) {
    throw createAuthError('validation/invalid-name', 'Full name must be at least 2 characters.')
  }
  if (trimmed.length > 120) {
    throw createAuthError('validation/invalid-name', 'Full name must be 120 characters or fewer.')
  }

  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    if (!hasSessionCookie()) {
      throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
    }
    const currentFallback = getFallbackAdminUser()
    const existing = readLocalAuthRecord()
    writeLocalAuthRecord({
      uid: existing?.uid || currentFallback.uid,
      email: existing?.email || currentFallback.email || 'admin@lexmedia.com',
      displayName: trimmed,
      password: existing?.password,
      lastAuthenticatedAt: existing?.lastAuthenticatedAt || Date.now(),
    })
    const updatedUser: User = {
      ...currentFallback,
      displayName: trimmed,
    }
    notifyListeners(updatedUser)
    return updatedUser
  }

  const fbUser = authInstance.currentUser
  if (!fbUser) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }

  await updateProfile(fbUser, { displayName: trimmed })
  try {
    await fbUser.reload()
  } catch {}
  const updatedUser = mapFirebaseUser(authInstance.currentUser || fbUser)
  notifyListeners(updatedUser)
  return updatedUser
}

async function runBackendPrepareEmailChange(targetEmail: string, token: string): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/admin/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'prepare-email-change',
        newEmail: targetEmail,
      }),
    })
  } catch {
    throw createAuthError(
      'auth/network-request-failed',
      'Network error while validating email change. Please check your connection and try again.'
    )
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    const code =
      payload?.code ||
      (response.status === 401
        ? 'auth/user-token-expired'
        : response.status === 409
        ? 'auth/email-already-in-use'
        : 'backend-error')
    throw createAuthError(
      code,
      payload?.error || 'Unable to verify email change request.'
    )
  }
}

export async function initiateAdminEmailChange(
  newEmail: string,
  options?: { currentPassword?: string }
): Promise<EmailChangeResult> {
  const normalizedEmail = newEmail.trim().toLowerCase()
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw createAuthError('auth/invalid-email', 'Please enter a valid email address.')
  }

  const authInstance = getAuthInstance()

  // Local preview fallback when Firebase Auth environment keys are not configured
  if (!isFirebaseAuthConfigured || !authInstance) {
    if (!hasSessionCookie()) {
      throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
    }

    const currentFallback = getFallbackAdminUser()
    if ((currentFallback.email || '').trim().toLowerCase() === normalizedEmail) {
      return { status: 'updated', activeEmail: normalizedEmail }
    }

    const existingRecord = readLocalAuthRecord()
    if (options?.currentPassword !== undefined) {
      await reauthenticateAdminWithPassword(options.currentPassword)
    } else if (
      existingRecord?.lastAuthenticatedAt &&
      Date.now() - existingRecord.lastAuthenticatedAt > 5 * 60 * 1000
    ) {
      throw createAuthError(
        'auth/requires-recent-login',
        'For your security, please enter your current password to confirm this email change.'
      )
    }

    // Check local users collection for duplicate email registrations
    if (typeof window !== 'undefined') {
      try {
        const localUsersRaw = localStorage.getItem('lexmedia_users')
        const localUsers = localUsersRaw ? JSON.parse(localUsersRaw) : []
        if (
          Array.isArray(localUsers) &&
          localUsers.some(
            (u: any) =>
              u &&
              u.id !== currentFallback.uid &&
              u.uid !== currentFallback.uid &&
              typeof u.email === 'string' &&
              u.email.trim().toLowerCase() === normalizedEmail
          )
        ) {
          throw createAuthError(
            'auth/email-already-in-use',
            'This email address is already registered to another account.'
          )
        }
      } catch (err: any) {
        if (err?.code === 'auth/email-already-in-use') throw err
      }
    }

    await runBackendPrepareEmailChange(normalizedEmail, 'active-admin-session')

    writeLocalAuthRecord({
      uid: existingRecord?.uid || currentFallback.uid,
      email: normalizedEmail,
      displayName:
        existingRecord?.displayName || currentFallback.displayName || 'Lexmedia Admin',
      password: existingRecord?.password || options?.currentPassword,
      lastAuthenticatedAt: Date.now(),
    })

    const updatedUser: User = {
      ...currentFallback,
      email: normalizedEmail,
      emailVerified: true,
    }
    notifyListeners(updatedUser)
    return { status: 'updated', activeEmail: normalizedEmail }
  }

  // Real Firebase Authentication flow
  const fbUser = authInstance.currentUser
  if (!fbUser) {
    throw createAuthError('auth/user-token-expired', 'Your session has expired. Please sign in again.')
  }

  const currentEmail = (fbUser.email || '').trim().toLowerCase()
  if (currentEmail === normalizedEmail) {
    return { status: 'updated', activeEmail: fbUser.email || normalizedEmail }
  }

  // Reauthenticate upfront when password is supplied
  if (options?.currentPassword) {
    await reauthenticateAdminWithPassword(options.currentPassword)
  }

  const token = await fbUser.getIdToken()
  await runBackendPrepareEmailChange(normalizedEmail, token)

  // Refresh token so any newly stamped { admin: true } custom claim is active immediately
  const claimRefreshedToken = await fbUser.getIdToken(true)
  setSessionCookie(claimRefreshedToken, 604800)

  try {
    await updateEmail(fbUser, normalizedEmail)
    await fbUser.reload()
    const freshToken = await fbUser.getIdToken(true)
    setSessionCookie(freshToken, 604800)
    try {
      if (typeof window !== 'undefined' && fbUser.email) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, fbUser.email)
      }
    } catch {}
    const updatedUser = mapFirebaseUser(authInstance.currentUser || fbUser)
    notifyListeners(updatedUser)
    return {
      status: 'updated',
      activeEmail: updatedUser.email || normalizedEmail,
    }
  } catch (err: any) {
    // Firebase projects with Email Enumeration Protection require verifyBeforeUpdateEmail
    if (err?.code === 'auth/operation-not-allowed') {
      const actionCodeSettings =
        typeof window !== 'undefined'
          ? {
              url: `${window.location.origin}/settings?tab=account`,
              handleCodeInApp: false,
            }
          : undefined

      await verifyBeforeUpdateEmail(fbUser, normalizedEmail, actionCodeSettings)
      return {
        status: 'verification_sent',
        activeEmail: fbUser.email || currentEmail,
        pendingEmail: normalizedEmail,
      }
    }

    throw err
  }
}

export async function reloadAndSyncAdminAuthUser(): Promise<User | null> {
  const authInstance = getAuthInstance()
  if (!isFirebaseAuthConfigured || !authInstance) {
    const user = hasSessionCookie() ? getFallbackAdminUser() : null
    notifyListeners(user)
    return user
  }

  const fbUser = authInstance.currentUser
  if (!fbUser) {
    return null
  }

  await fbUser.reload()
  const freshUser = authInstance.currentUser || fbUser
  const freshToken = await freshUser.getIdToken(true)
  setSessionCookie(freshToken, 604800)
  try {
    if (typeof window !== 'undefined' && freshUser.email) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, freshUser.email)
    }
  } catch {}

  const mapped = mapFirebaseUser(freshUser)
  notifyListeners(mapped)
  return mapped
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

  if (authInstance.currentUser) {
    callback(mapFirebaseUser(authInstance.currentUser))
  }

  let unsubscribe: () => void = () => {}
  try {
    unsubscribe = onIdTokenChanged(authInstance, (fbUser) => {
      if (fbUser) {
        fbUser
          .getIdToken()
          .then((token) => {
            setSessionCookie(token, 604800)
            void syncServerSessionCookie(token, 604800)
          })
          .catch(() => {})
        callback(mapFirebaseUser(fbUser))
      } else if (hasLocalAdminSessionCookie()) {
        callback(getFallbackAdminUser())
      } else {
        if (getSessionCookieValue()) {
          clearSessionCookie()
          void clearServerSessionCookie()
        }
        callback(null)
      }
    })
  } catch (err) {
    console.warn('[Firebase Auth] Listener fallback active:', err)
    callback(hasLocalAdminSessionCookie() ? getFallbackAdminUser() : null)
  }

  return () => {
    listeners.delete(callback)
    try {
      unsubscribe()
    } catch {}
  }
}
