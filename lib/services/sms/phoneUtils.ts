/**
 * Phone number validation and normalization utilities.
 * Handles Ghanaian prefixes (024, 055, 020, 027, etc.) and international E.164 formatting.
 */

/**
 * Normalizes phone numbers to standard E.164 international format (+[country_code][number]).
 *
 * Examples:
 * - "0244123456" -> "+233244123456"
 * - "0559876543" -> "+233559876543"
 * - "233244123456" -> "+233244123456"
 * - "+233 24 412 3456" -> "+233244123456"
 * - "00233244123456" -> "+233244123456"
 * - "+1 (555) 019-2834" -> "+15550192834"
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode = '233'): string {
  if (!rawPhone) return ''

  // Strip all whitespace, dashes, parentheses, dots
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]+/g, '')

  // Replace leading "00" with "+" (common international dialing prefix)
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2)
  }

  // If already starts with '+', remove any remaining invalid characters
  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.substring(1).replace(/\D/g, '')
    return `+${digitsOnly}`
  }

  // Strip any non-digit characters
  const digits = cleaned.replace(/\D/g, '')
  if (!digits) return ''

  // Ghana local formatting: starts with 0 and is followed by 9 digits (total 10 digits, e.g. 0244123456)
  if (digits.startsWith('0') && digits.length === 10) {
    return `+${defaultCountryCode}${digits.substring(1)}`
  }

  // Ghana local without leading 0: 9 digits starting with 2, 5, or other Ghana network digits
  if (digits.length === 9 && (digits.startsWith('2') || digits.startsWith('5'))) {
    return `+${defaultCountryCode}${digits}`
  }

  // Starts with country code 233 without '+' (e.g. 233244123456)
  if (digits.startsWith(defaultCountryCode) && digits.length >= 12) {
    return `+${digits}`
  }

  // Standard fallback: prefix with '+' if long enough to be an international number
  if (digits.length >= 10) {
    return `+${digits}`
  }

  // Default: prepend country code
  return `+${defaultCountryCode}${digits.replace(/^0+/, '')}`
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

  // Must match standard E.164 pattern
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
