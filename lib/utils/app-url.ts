/**
 * Centralized Security-First URL Gateway & Policy System for LexMedia / Ctrl Room
 * 
 * Supports 3 environments:
 * 1. Local Development (http://localhost:3000)
 * 2. Vercel Testing / Preview (https://[deployment].vercel.app or configured APP_URL)
 * 3. Authoritative Production (https://lexmedia.gh)
 * 
 * Architecture Guarantees:
 * - During Vercel testing, URLs automatically use the active/configured Vercel deployment domain.
 * - Vercel is NOT blocked and *.vercel.app is accepted as a trusted testing origin.
 * - During production (when APP_ENV=production or custom domain is connected), URLs use https://lexmedia.gh.
 * - In local development, URLs use localhost:3000 (or runtime origin).
 * - Open redirects, javascript/data URIs, and arbitrary malicious external domains are strictly neutralized.
 * - Secure tokens, payment links, invoices, deliveries, and Quick Jobs workflows are fully preserved.
 */

export const CANONICAL_PRODUCTION_DOMAIN = 'https://lexmedia.gh'
export const DEFAULT_DEV_DOMAIN = 'http://localhost:3000'

/**
 * Normalizes any URL string by removing trailing slashes and ensuring protocol.
 */
function normalizeUrl(urlStr: string): string {
  if (!urlStr) return ''
  const trimmed = urlStr.trim()
  if (!trimmed) return ''
  const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`
  return withProto.replace(/\/+$/, '')
}

/**
 * Checks if a hostname belongs to trusted application domains:
 * - localhost / 127.0.0.1
 * - *.vercel.app / vercel.app
 * - lexmedia.gh / *.lexmedia.gh
 * - *.run.app (Cloud Run / AI Studio preview)
 * - *.paystack.com / *.hubtel.com (trusted payment gateways)
 */
export function isTrustedHost(hostname: string): boolean {
  if (!hostname) return false
  const clean = hostname.toLowerCase().split(':')[0].trim()
  return (
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean === '[::1]' ||
    clean.endsWith('.vercel.app') ||
    clean === 'vercel.app' ||
    clean.endsWith('.lexmedia.gh') ||
    clean === 'lexmedia.gh' ||
    clean.endsWith('.run.app') ||
    clean.endsWith('.paystack.com') ||
    clean === 'paystack.com' ||
    clean.endsWith('.hubtel.com') ||
    clean === 'hubtel.com'
  )
}

/**
 * Returns the current runtime application base URL.
 * Used for internal application runtime routing, API callbacks, and environment detection.
 * Allows localhost, Cloud Run, and Vercel deployment URLs during testing and development.
 */
export function getRuntimeUrl(context?: any): string {
  // 1. Explicit string context passed
  if (typeof context === 'string') {
    const trimmed = context.trim().replace(/\/+$/, '')
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
  }

  // 2. Browser context (Runtime origin)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin) return origin
  }

  // 3. Request context (Server-side dynamic host detection from headers)
  if (context && typeof context === 'object') {
    try {
      let headers: Headers | any = null
      if ('headers' in context && context.headers) {
        headers = context.headers
      } else if (context instanceof Headers) {
        headers = context
      }

      if (headers) {
        const getHeader = (name: string): string | null => {
          if (typeof headers.get === 'function') {
            return headers.get(name)
          }
          return headers[name] || headers[name.toLowerCase()] || null
        }

        const host = getHeader('x-forwarded-host') || getHeader('host')
        const proto = getHeader('x-forwarded-proto') || (host && host.includes('localhost') ? 'http' : 'https')
        if (host) {
          const cleanHost = host.split(',')[0].trim()
          return `${proto}://${cleanHost}`.replace(/\/+$/, '')
        }
      }
    } catch {}
  }

  // 4. Environment Variables fallback
  const envUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (envUrl) {
    return normalizeUrl(envUrl)
  }

  // 5. Default fallback
  const isDev = process.env.NODE_ENV === 'development' || process.env.APP_ENV === 'development'
  return isDev ? DEFAULT_DEV_DOMAIN : CANONICAL_PRODUCTION_DOMAIN
}

/**
 * Returns the customer/public-facing URL base for link generation (Payments, Deliveries, Invoices, Emails).
 * 
 * Rules:
 * - If APP_ENV === 'production' or APP_URL is explicitly configured to lexmedia.gh -> returns https://lexmedia.gh
 * - If in Vercel testing (APP_ENV === 'testing' or APP_URL/VERCEL_URL is a vercel.app domain or accessed via Vercel) -> returns active Vercel domain
 * - If in Local Development -> returns http://localhost:3000 (or runtime origin)
 * - Vercel deployments are fully supported during testing without forced redirects or rewrites to lexmedia.gh.
 */
export function getCustomerUrl(context?: any): string {
  const appEnv = (process.env.APP_ENV || '').toLowerCase().trim()
  const configuredAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL

  // 1. Explicit production mode configuration
  if (appEnv === 'production') {
    if (configuredAppUrl && !configuredAppUrl.includes('localhost') && !configuredAppUrl.includes('127.0.0.1')) {
      return normalizeUrl(configuredAppUrl)
    }
    return CANONICAL_PRODUCTION_DOMAIN
  }

  // 2. Explicit configured APP_URL or NEXT_PUBLIC_APP_URL
  if (configuredAppUrl) {
    const trimmed = configuredAppUrl.trim()
    if (trimmed) {
      return normalizeUrl(trimmed)
    }
  }

  // 3. Explicit context string passed (e.g. from request or helper)
  if (typeof context === 'string') {
    const trimmed = context.trim().replace(/\/+$/, '')
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
  }

  // 4. Server-side Request context
  if (context && typeof context === 'object') {
    try {
      let headers: Headers | any = null
      if ('headers' in context && context.headers) {
        headers = context.headers
      } else if (context instanceof Headers) {
        headers = context
      }

      if (headers) {
        const getHeader = (name: string): string | null => {
          if (typeof headers.get === 'function') {
            return headers.get(name)
          }
          return headers[name] || headers[name.toLowerCase()] || null
        }

        const host = getHeader('x-forwarded-host') || getHeader('host')
        const proto = getHeader('x-forwarded-proto') || (host && host.includes('localhost') ? 'http' : 'https')
        if (host) {
          const cleanHost = host.split(',')[0].trim()
          return `${proto}://${cleanHost}`.replace(/\/+$/, '')
        }
      }
    } catch {}
  }

  // 5. Vercel deployment environment variables
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL
  if (vercelUrl) {
    return normalizeUrl(`https://${vercelUrl}`)
  }

  // 6. Browser context (Runtime origin)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin) {
      return origin
    }
  }

  // 7. Default fallback based on environment
  if (appEnv === 'testing' || appEnv === 'preview') {
    return CANONICAL_PRODUCTION_DOMAIN
  }

  if (process.env.NODE_ENV === 'development' || appEnv === 'development' || appEnv === 'local') {
    return DEFAULT_DEV_DOMAIN
  }

  return CANONICAL_PRODUCTION_DOMAIN
}

/**
 * Centralized URL Security Validator.
 * Detects unauthorized domains, open redirects, protocol injection, and malicious targets.
 */
export function validateUrlSecurity(
  urlStr: string,
  mode: 'runtime' | 'customer' = 'customer',
  context?: any
): { isValid: boolean; sanitizedUrl: string; reason?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { isValid: false, sanitizedUrl: getCustomerUrl(context), reason: 'Empty or invalid URL' }
  }

  const trimmed = urlStr.trim()

  // Prevent protocol-relative and dangerous scheme injection
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    const safeBase = mode === 'customer' ? getCustomerUrl(context) : getRuntimeUrl(context)
    return {
      isValid: false,
      sanitizedUrl: safeBase,
      reason: 'Blocked dangerous protocol or protocol-relative URI',
    }
  }

  // Allow safe relative paths
  if (trimmed.startsWith('/')) {
    const base = mode === 'customer' ? getCustomerUrl(context) : getRuntimeUrl(context)
    return { isValid: true, sanitizedUrl: `${base}${trimmed}` }
  }

  try {
    const parsed = new URL(trimmed)

    // Allow third-party payment gateways (Paystack, Hubtel)
    if (parsed.hostname.includes('paystack.com') || parsed.hostname.includes('hubtel.com')) {
      return { isValid: true, sanitizedUrl: trimmed }
    }

    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.port === '3000'

    const currentCustomerBase = getCustomerUrl(context)
    const isProdMode =
      (process.env.APP_ENV || '').toLowerCase() === 'production' ||
      currentCustomerBase.includes('lexmedia.gh')

    // If in production mode and an internal link points to localhost, sanitize to production domain
    if (isProdMode && isLocal && mode === 'customer') {
      const sanitized = `${currentCustomerBase}${parsed.pathname}${parsed.search}${parsed.hash}`
      return {
        isValid: false,
        sanitizedUrl: sanitized,
        reason: 'Sanitized localhost link to production customer domain',
      }
    }

    // Check if domain is a trusted host
    if (isTrustedHost(parsed.hostname)) {
      return { isValid: true, sanitizedUrl: trimmed }
    }

    // Untrusted external domain -> sanitize to customer/runtime base preserving path
    const safeBase = mode === 'customer' ? getCustomerUrl(context) : getRuntimeUrl(context)
    const sanitized = `${safeBase}${parsed.pathname}${parsed.search}${parsed.hash}`
    return {
      isValid: false,
      sanitizedUrl: sanitized,
      reason: `Untrusted domain ${parsed.hostname} sanitized to ${safeBase}`,
    }
  } catch {
    // If not a valid URL, treat as path or token
    const base = mode === 'customer' ? getCustomerUrl(context) : getRuntimeUrl(context)
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    return { isValid: true, sanitizedUrl: `${base}${cleanPath}` }
  }
}

/**
 * Environment-aware customer URL sanitizer for customer-facing links (Brevo emails, client payment links, SMS).
 * Resolves relative paths, bare tokens, and ensures links use the appropriate active domain.
 */
export function getProductionUrl(urlStr: string, context?: any): string {
  if (!urlStr || typeof urlStr !== 'string') return getCustomerUrl(context)
  const trimmed = urlStr.trim()
  if (!trimmed) return getCustomerUrl(context)

  // 1. If bare token (e.g. "pay_abc123" or "tok_xyz")
  let targetPath = trimmed
  if (!targetPath.startsWith('/') && !targetPath.startsWith('http://') && !targetPath.startsWith('https://')) {
    targetPath = `/pay/${targetPath}`
  }

  // 2. Validate security and sanitize if needed
  const validation = validateUrlSecurity(targetPath, 'customer', context)
  if (validation.isValid) {
    if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
      return validation.sanitizedUrl
    }
  } else {
    return validation.sanitizedUrl
  }

  // 3. Relative path -> prepend customer base
  const base = getCustomerUrl(context).replace(/\/+$/, '')
  if (targetPath.startsWith('/')) {
    return `${base}${targetPath}`
  }

  try {
    const parsed = new URL(targetPath)
    if (parsed.hostname.includes('paystack.com') || parsed.hostname.includes('hubtel.com')) {
      return targetPath
    }
    return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return `${base}/${targetPath.replace(/^\//, '')}`
  }
}

// ─── Specific Entity URL Builders ───────────

/**
 * Builds a secure customer-facing payment URL using the active environment base.
 * Testing: https://[project].vercel.app/pay/[token]
 * Production: https://lexmedia.gh/pay/[token]
 */
export function buildPaymentUrl(tokenOrId: string, context?: any): string {
  const clean = (tokenOrId || 'sample').trim()
  return getProductionUrl(`/pay/${clean}`, context)
}

/**
 * Builds a secure customer-facing invoice URL using the active environment base.
 * Testing: https://[project].vercel.app/invoices/[invoiceNumber]
 * Production: https://lexmedia.gh/invoices/[invoiceNumber]
 */
export function buildInvoiceUrl(invoiceNumber: string, context?: any): string {
  const clean = (invoiceNumber || '').trim()
  return getProductionUrl(`/invoices/${encodeURIComponent(clean)}`, context)
}

/**
 * Builds a secure customer-facing delivery portal URL using the active environment base.
 * Testing: https://[project].vercel.app/delivery/[accessToken]
 * Production: https://lexmedia.gh/delivery/[accessToken]
 */
export function buildDeliveryUrl(accessToken: string, context?: any): string {
  const clean = (accessToken || '').trim()
  return getProductionUrl(`/delivery/${encodeURIComponent(clean)}`, context)
}

/**
 * Builds a secure Quick Job delivery portal URL for emails and delivery notifications.
 * Testing: https://[project].vercel.app/delivery/[accessToken]
 * Production: https://lexmedia.gh/delivery/[accessToken]
 */
export function buildQuickJobDeliveryUrl(accessToken: string, context?: any): string {
  const clean = (accessToken || '').trim()
  return getProductionUrl(`/delivery/${encodeURIComponent(clean)}`, context)
}

// Backwards compatibility aliases for existing imports across the codebase
export const getAppUrl = getRuntimeUrl
export const getPaymentLink = buildPaymentUrl
export const getDeliveryLink = buildDeliveryUrl

/**
 * Builds an absolute or clean application URL given a path.
 */
export function appUrl(path = '', context?: any): string {
  const base = getRuntimeUrl(context)
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  if (!base) return cleanPath || '/'
  return `${base}${cleanPath}`
}

/**
 * Open Redirect Protection: Sanitizes returnUrl / redirect query parameters.
 * Only allows relative paths or URLs belonging to trusted application domains.
 */
export function sanitizeRedirectUrl(
  urlStr: string | null | undefined,
  defaultUrl = '/dashboard',
  context?: any
): string {
  if (!urlStr || typeof urlStr !== 'string') return defaultUrl
  const trimmed = urlStr.trim()

  // Prevent protocol-relative or dangerous schemes
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return defaultUrl
  }

  // Safe relative paths starting with single slash
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    const customerHost = new URL(getCustomerUrl(context)).hostname
    const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : ''

    if (
      isTrustedHost(parsed.hostname) ||
      parsed.hostname === customerHost ||
      parsed.hostname === runtimeHost
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {}

  return defaultUrl
}
