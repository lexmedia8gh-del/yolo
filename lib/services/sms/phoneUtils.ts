/**
 * Phone number validation and normalization utilities.
 * Handles Ghanaian prefixes (024, 055, 020, 027, etc.) and international E.164 formatting.
 */

/**
 * Normalizes phone numbers to standard E.164 international format (+[country_code][number]).
 * Special handling for Ghana country code (+233) and local formats:
 * - "0241234567" -> "+233241234567"
 * - "0559876543" -> "+233559876543"
 * - "241234567" -> "+233241234567"
 * - "+2330241234567" -> "+233241234567" (strips leading 0 after country code 233)
 * - "2330241234567" -> "+233241234567" (strips leading 0 after country code 233)
 * - "+233 (0) 24 123 4567" -> "+233241234567"
 * - "002330241234567" -> "+233241234567"
 * - "+1 (555) 019-2834" -> "+15550192834"
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode = '233'): string {
  if (!rawPhone || !rawPhone.trim()) return ''

  let cleaned = rawPhone.trim()

  // 1. Remove explicit "(0)" or "( 0 )" often used in formatting e.g. +233 (0) 24 123 4567
  cleaned = cleaned.replace(/\(\s*0\s*\)/g, '')

  // 2. Convert international "00" prefix to "+"
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2)
  }

  // 3. Remove all spaces, hyphens, brackets, dots, slashes
  const hasPlus = cleaned.startsWith('+')
  const digits = cleaned.replace(/\D/g, '')

  if (!digits) return ''

  // 4. Handle default country code (Ghana 233) formatting:
  // Case A: Starts with country code + leading zero, e.g. 2330241234567 or +2330241234567
  if (digits.startsWith(`${defaultCountryCode}0`)) {
    const fixedDigits = defaultCountryCode + digits.substring(defaultCountryCode.length + 1)
    return `+${fixedDigits}`
  }

  // Case B: Starts with country code 233 directly (e.g. 233241234567 or +233241234567)
  if (digits.startsWith(defaultCountryCode) && digits.length >= 11) {
    return `+${digits}`
  }

  // Case C: Ghana local format starting with 0 (e.g. 0241234567 -> 10 digits starting with 0)
  if (digits.startsWith('0')) {
    // Strip leading zero and prepend country code
    const withoutZero = digits.replace(/^0+/, '')
    return `+${defaultCountryCode}${withoutZero}`
  }

  // Case D: Ghana local format without leading 0 (e.g. 9 digits like 241234567)
  if (!hasPlus && digits.length === 9) {
    return `+${defaultCountryCode}${digits}`
  }

  // Case E: If user entered number with '+' prefix (non-Ghana or already formatted Ghana)
  if (hasPlus) {
    return `+${digits}`
  }

  // Case F: Default fallback for other international numbers missing '+' (e.g., 15550192834 or 447911123456)
  if (digits.length >= 10) {
    return `+${digits}`
  }

  return `+${defaultCountryCode}${digits}`
}

/**
 * Validates a phone number.
 */
export function validatePhoneNumber(rawPhone?: string): {
  isValid: boolean
  normalized: string
  error?: string
} {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number is missing or empty',
    }
  }

  const normalized = normalizePhoneNumber(rawPhone)
  const digits = normalized.replace(/\D/g, '')

  if (digits.length < 8) {
    return {
      isValid: false,
      normalized,
      error: `Phone number is too short (${digits.length} digits). Expected at least 8 digits.`,
    }
  }

  if (digits.length > 15) {
    return {
      isValid: false,
      normalized,
      error: `Phone number is too long (${digits.length} digits). Max international length is 15 digits.`,
    }
  }

  // Ghana specific length validation: +233 followed by exactly 9 digits = 12 digits total after +
  if (normalized.startsWith('+233')) {
    const ghanaDigits = digits.substring(3) // digits after 233
    if (ghanaDigits.length !== 9) {
      return {
        isValid: false,
        normalized,
        error: `Invalid Ghana phone number length (${ghanaDigits.length} digits after +233). Expected 9 digits e.g. +233241234567 or 0241234567.`,
      }
    }
  }

  // Must match standard E.164 pattern (+ followed by 8 to 15 digits, starting with 1-9)
  const e164Regex = /^\+[1-9]\d{7,14}$/
  if (!e164Regex.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'Phone number format is not a valid international E.164 number',
    }
  }

  return {
    isValid: true,
    normalized,
  }
}
