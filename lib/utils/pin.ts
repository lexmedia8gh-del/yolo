import crypto from 'crypto'

/**
 * Validates that a string contains exactly six numeric digits (000000 - 999999).
 */
export function validatePinFormat(pin: unknown): boolean {
  if (typeof pin !== 'string') return false
  const clean = pin.trim()
  return /^[0-9]{6}$/.test(clean)
}

/**
 * Generates a salted PBKDF2 (SHA-512) hash for a 6-digit PIN.
 */
export function hashPin(pin: string, existingSalt?: string): { hash: string; salt: string } {
  const cleanPin = pin.trim()
  const salt = existingSalt || crypto.randomBytes(16).toString('hex')
  const hashBuffer = crypto.pbkdf2Sync(cleanPin, salt, 100000, 64, 'sha512')
  return {
    hash: hashBuffer.toString('hex'),
    salt,
  }
}

/**
 * Timing-safe PIN verification against stored hash and salt.
 */
export function verifyPinHash(pin: string, storedHash: string, storedSalt: string): boolean {
  if (!validatePinFormat(pin) || !storedHash || !storedSalt) return false
  try {
    const { hash } = hashPin(pin, storedSalt)
    const computedBuf = Buffer.from(hash, 'hex')
    const storedBuf = Buffer.from(storedHash, 'hex')
    if (computedBuf.length !== storedBuf.length) return false
    return crypto.timingSafeEqual(computedBuf, storedBuf)
  } catch {
    return false
  }
}

// In-memory rate limiting map for PIN attempts (keyed by IP / Identifier)
interface AttemptRecord {
  count: number
  firstAttemptAt: number
  lockedUntil: number
}

const attemptStore = new Map<string, AttemptRecord>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes window
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes lockout

export function checkPinRateLimit(key: string): { allowed: boolean; remaining: number; lockoutSeconds: number } {
  const now = Date.now()
  const record = attemptStore.get(key)

  if (!record) {
    return { allowed: true, remaining: MAX_ATTEMPTS, lockoutSeconds: 0 }
  }

  if (record.lockedUntil > now) {
    const lockoutSeconds = Math.ceil((record.lockedUntil - now) / 1000)
    return { allowed: false, remaining: 0, lockoutSeconds }
  }

  // Reset counter if time window expired
  if (now - record.firstAttemptAt > WINDOW_MS) {
    attemptStore.delete(key)
    return { allowed: true, remaining: MAX_ATTEMPTS, lockoutSeconds: 0 }
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS
    const lockoutSeconds = Math.ceil(LOCKOUT_MS / 1000)
    return { allowed: false, remaining: 0, lockoutSeconds }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count, lockoutSeconds: 0 }
}

export function recordFailedPinAttempt(key: string): { remaining: number; locked: boolean; lockoutSeconds: number } {
  const now = Date.now()
  let record = attemptStore.get(key)

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    record = { count: 1, firstAttemptAt: now, lockedUntil: 0 }
  } else {
    record.count += 1
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS
    attemptStore.set(key, record)
    return { remaining: 0, locked: true, lockoutSeconds: Math.ceil(LOCKOUT_MS / 1000) }
  }

  attemptStore.set(key, record)
  return { remaining: MAX_ATTEMPTS - record.count, locked: false, lockoutSeconds: 0 }
}

export function clearPinRateLimit(key: string) {
  attemptStore.delete(key)
}
