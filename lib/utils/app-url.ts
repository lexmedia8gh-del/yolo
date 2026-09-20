/**
 * Centralized Authoritative URL Gateway & Policy System for LexMedia / Ctrl Room
 * 
 * Supports 3 environments:
 * 1. Local Development (http://localhost:3000)
 * 2. Vercel Testing / Preview (https://[deployment].vercel.app)
 * 3. Authoritative Production (https://lexmedia.gh - only when active production domain is configured)
 * 
 * Architecture Guarantees:
 * - Automatically detects the runtime host from browser origin, request headers, or Vercel environment variables.
 * - During Vercel testing, URLs automatically use the active/deployed Vercel domain (e.g. https://lexmedia-xxxx.vercel.app).
 * - NEVER hardcodes https://lexmedia.gh during Vercel testing or local development.
 * - NEVER generates https://vercel.com platform or dashboard links.
 * - Customer links follow the structure: {APP_BASE_URL}/{LEXMEDIA_ROUTE}/{SECURE_IDENTIFIER}
 *   e.g. /payment/secure/{token}, /delivery/secure/{token}, /quick-jobs/{token}, /payment/callback
 * - Fully preserves secure token validation, Paystack payments, delivery unlock, and Brevo notifications.
 */

export const CANONICAL_PRODUCTION_DOMAIN = 'https://lexmedia.gh'
export const DEFAULT_DEV_DOMAIN = 'http://localhost:3000'

/**
 * Detects if a host or URL belongs to the Vercel platform (vercel.com),
 * as opposed to a deployment domain (*.vercel.app).
 * vercel.com is NEVER a valid LexMedia application origin.
 */
export function isVercelPlatformDomain(input: string): boolean {
  if (!input || typeof input !== 'string') return false
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return false

  // Direct platform host matches
  if (trimmed === 'vercel.com' || trimmed === 'www.vercel.com') return true

  // Fast check for protocol URLs
  if (
    trimmed.startsWith('https://vercel.com') ||
    trimmed.startsWith('http://vercel.com') ||
    trimmed.startsWith('https://www.vercel.com') ||
    trimmed.startsWith('http://www.vercel.com')
  ) {
    return true
  }

  // Parse if it looks like a URL or host
  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`
    const parsed = new URL(withProto)
    const host = parsed.hostname.toLowerCase()
    if (host === 'vercel.com' || host === 'www.vercel.com' || (host.endsWith('.vercel.com') && !host.endsWith('.vercel.app'))) {
      return true
    }
  } catch {
    if (trimmed.includes('vercel.com') && !trimmed.includes('.vercel.app')) {
      return true
    }
  }

  return false
}

/**
 * Normalizes any URL string by trimming whitespace, stripping trailing slashes,
 * and ensuring an http/https protocol prefix.
 */
export function normalizeUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') return ''
  let trimmed = urlStr.trim()
  if (!trimmed) return ''
  
  // Neutralize protocol-relative or dangerous schemes
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return ''
  }

  // Prevent accidental vercel.com platform domain
  if (isVercelPlatformDomain(trimmed)) {
    return ''
  }

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
  // Block any vercel.com platform domain
  if (clean === 'vercel.com' || (clean.endsWith('.vercel.com') && !clean.endsWith('.vercel.app'))) {
    return false
  }
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
 * Resolves the host and protocol from an incoming request or Headers object.
 */
function extractHostFromContext(context: any): string | null {
  if (!context) return null

  // If a string URL was passed
  if (typeof context === 'string') {
    const trimmed = context.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed)
        if (parsed.hostname && !isVercelPlatformDomain(parsed.hostname)) {
          return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '')
        }
      } catch {}
    }
    return null
  }

  // If a Request / NextRequest / Headers object was passed
  if (typeof context === 'object') {
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
        if (host) {
          const cleanHost = host.split(',')[0].trim()
          // Never use vercel.com platform domain
          if (isVercelPlatformDomain(cleanHost)) {
            return null
          }
          const proto =
            getHeader('x-forwarded-proto') ||
            (cleanHost.includes('localhost') || cleanHost.includes('127.0.0.1') ? 'http' : 'https')
          return `${proto}://${cleanHost}`.replace(/\/+$/, '')
        }
      }

      // If NextRequest has nextUrl
      if ('nextUrl' in context && context.nextUrl?.origin) {
        const origin = context.nextUrl.origin
        if (!isVercelPlatformDomain(origin)) {
          return origin.replace(/\/+$/, '')
        }
      }
    } catch {}
  }

  return null
}

/**
 * Authoritative Centralized Base URL Resolver.
 * Priority:
 * 1. Explicit production URL ONLY when production mode is intentionally enabled.
 * 2. Current request origin when available (headers or window origin).
 * 3. Configured APP_URL / NEXT_PUBLIC_APP_URL (rejecting vercel.com).
 * 4. Vercel runtime deployment hostname when deployed on Vercel.
 * 5. Localhost fallback (http://localhost:3000) during local development.
 */
export function getAppBaseUrl(context?: any): string {
  // Configured environment variables
  const configuredAppUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const safeConfiguredAppUrl = isVercelPlatformDomain(configuredAppUrl) ? '' : configuredAppUrl

  // Vercel deployment variables
  const rawVercelHost =
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL ||
    ''

  const cleanVercelHost = rawVercelHost
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

  const isVercelHostValid =
    cleanVercelHost &&
    !isVercelPlatformDomain(cleanVercelHost) &&
    cleanVercelHost !== 'vercel.com'

  // 1. Explicit production domain ONLY when production mode is intentionally enabled
  const isProductionExplicitlyEnabled =
    process.env.PRODUCTION_DOMAIN_CONFIGURED === 'true' ||
    process.env.FORCE_PRODUCTION_DOMAIN === 'true' ||
    (process.env.APP_ENV === 'production' && safeConfiguredAppUrl.includes('lexmedia.gh')) ||
    safeConfiguredAppUrl === CANONICAL_PRODUCTION_DOMAIN

  // If in Vercel preview or testing, do not force production domain
  const isVercelTesting =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.APP_ENV === 'testing' ||
    (safeConfiguredAppUrl && safeConfiguredAppUrl.includes('.vercel.app'))

  if (isProductionExplicitlyEnabled && !isVercelTesting) {
    return CANONICAL_PRODUCTION_DOMAIN
  }

  // 2. Current request origin when available
  // 2a. Server-side request headers
  const hostFromContext = extractHostFromContext(context)
  if (hostFromContext && !isVercelPlatformDomain(hostFromContext)) {
    return hostFromContext
  }

  // 2b. Browser context: Authoritative active origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin && !isVercelPlatformDomain(origin)) {
      return origin
    }
  }

  // 3. Safe configured APP_URL (e.g. testing URL like https://lexmedia-preview-git-main.vercel.app)
  if (safeConfiguredAppUrl) {
    const normalized = normalizeUrl(safeConfiguredAppUrl)
    if (normalized && !isVercelPlatformDomain(normalized)) {
      return normalized
    }
  }

  // 4. Vercel runtime deployment hostname when deployed on Vercel
  if (isVercelHostValid) {
    return `https://${cleanVercelHost}`
  }

  // 5. Localhost only during local development
  const isLocalDev =
    process.env.NODE_ENV === 'development' ||
    process.env.APP_ENV === 'development' ||
    process.env.APP_ENV === 'local'

  if (isLocalDev) {
    return DEFAULT_DEV_DOMAIN
  }

  return DEFAULT_DEV_DOMAIN
}

/**
 * Canonical customer-facing base URL getter (alias to getAppBaseUrl).
 * Satisfies the requirement that customers are sent to the LexMedia application
 * on the active environment, never to vercel.com platform.
 */
export function getCustomerUrl(context?: any): string {
  return getAppBaseUrl(context)
}

/**
 * Runtime application URL getter (alias to getAppBaseUrl).
 */
export function getRuntimeUrl(context?: any): string {
  return getAppBaseUrl(context)
}

/**
 * Builds an absolute application URL given a relative or sub-path.
 */
export function buildAppUrl(path = '', context?: any): string {
  const base = getAppBaseUrl(context)
  if (!path) return base
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}

/**
 * Builds a secure link with a path and token.
 */
export function buildSecureLink(path: string, token: string, context?: any): string {
  const base = getAppBaseUrl(context)
  const cleanPath = (path || '').replace(/^\/+|\/+$/g, '')
  const cleanToken = (token || '').trim()
  return `${base}/${cleanPath}/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure customer-facing payment URL.
 * Routes to the canonical /pay/{token} (with /payment/secure/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/pay/{token}
 */
export function buildPaymentUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  const base = getAppBaseUrl(context)
  return `${base}/pay/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure customer-facing payment URL using the /payment/secure/{token} path.
 */
export function buildSecurePaymentUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  const base = getAppBaseUrl(context)
  return `${base}/payment/secure/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure customer-facing delivery portal URL.
 * Routes to canonical /delivery/{token} (with /delivery/secure/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/delivery/{token}
 */
export function buildDeliveryUrl(accessToken: string, context?: any): string {
  const cleanToken = (accessToken || '').trim()
  const base = getAppBaseUrl(context)
  return `${base}/delivery/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure customer-facing delivery portal URL using /delivery/secure/{token}.
 */
export function buildSecureDeliveryUrl(accessToken: string, context?: any): string {
  const cleanToken = (accessToken || '').trim()
  const base = getAppBaseUrl(context)
  return `${base}/delivery/secure/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure Quick Job customer link.
 * Routes to canonical /quick-jobs/{token}.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/quick-jobs/{token}
 */
export function buildQuickJobUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || '').trim()
  const base = getAppBaseUrl(context)
  return `${base}/quick-jobs/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds the centralized Paystack callback URL.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/payment/callback?reference={ref}&token={token}
 */
export function buildPaymentCallbackUrl(reference?: string, token?: string, context?: any): string {
  const base = getAppBaseUrl(context)
  const params = new URLSearchParams()
  if (reference) params.set('reference', reference)
  if (token) params.set('token', token)
  const query = params.toString() ? `?${params.toString()}` : ''
  return `${base}/payment/callback${query}`
}

/**
 * Builds a customer-facing invoice URL.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/invoices/{invoiceNumber}
 */
export function buildInvoiceUrl(invoiceNumber: string, context?: any): string {
  const clean = (invoiceNumber || '').trim()
  const base = getAppBaseUrl(context)
  return `${base}/invoices/${encodeURIComponent(clean)}`
}

/**
 * Alias for Quick Job delivery link (uses buildDeliveryUrl).
 */
export function buildQuickJobDeliveryUrl(accessToken: string, context?: any): string {
  return buildDeliveryUrl(accessToken, context)
}

/**
 * Backwards compatibility aliases for existing imports across the codebase.
 */
export const getAppUrl = getAppBaseUrl
export const getPaymentLink = buildPaymentUrl
export const getDeliveryLink = buildDeliveryUrl
export const appUrl = buildAppUrl

export interface AppUrlValidationResult {
  isValid: boolean
  sanitizedUrl: string
  reason?: string
}

/**
 * Validates that an application URL is safe and points to the deployed application
 * rather than the Vercel platform (vercel.com) or an untrusted external host.
 *
 * Rejects:
 * - https://vercel.com
 * - https://vercel.com/dashboard
 * - https://vercel.com/projects/...
 * - https://vercel.com/new/...
 * - https://*.vercel.com
 *
 * Allows:
 * - https://<project-name>.vercel.app (and subpaths)
 * - https://lexmedia.gh (production domain)
 * - http://localhost:3000 (local development)
 */
export function validateAppUrl(urlStr: string, context?: any): AppUrlValidationResult {
  const safeBase = getAppBaseUrl(context)

  if (!urlStr || typeof urlStr !== 'string') {
    return { isValid: false, sanitizedUrl: safeBase, reason: 'Empty or invalid URL' }
  }

  const trimmed = urlStr.trim()

  // 1. Block dangerous schemes
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return {
      isValid: false,
      sanitizedUrl: safeBase,
      reason: 'Blocked dangerous URI scheme or protocol-relative attack',
    }
  }

  // 2. Reject vercel.com platform URLs
  if (isVercelPlatformDomain(trimmed)) {
    try {
      const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`
      const parsed = new URL(withProto)

      // If someone passed https://vercel.com/<project>.vercel.app/pay/xyz
      const vercelAppMatch = parsed.pathname.match(/\/([a-zA-Z0-9\-_]+\.vercel\.app)(\/.*)?$/)
      if (vercelAppMatch) {
        return {
          isValid: false,
          sanitizedUrl: `https://${vercelAppMatch[1]}${vercelAppMatch[2] || ''}${parsed.search}${parsed.hash}`,
          reason: 'Corrected malformed vercel.com prefix on vercel.app deployment URL',
        }
      }

      // Check if it's a known application route under vercel.com
      const path = parsed.pathname
      if (
        path.startsWith('/pay') ||
        path.startsWith('/payment') ||
        path.startsWith('/delivery') ||
        path.startsWith('/invoices') ||
        path.startsWith('/quick-jobs') ||
        path.startsWith('/dashboard') ||
        path.startsWith('/p/') ||
        path.startsWith('/d/')
      ) {
        return {
          isValid: false,
          sanitizedUrl: `${safeBase}${path}${parsed.search}${parsed.hash}`,
          reason: 'Blocked vercel.com platform URL; redirected to application origin',
        }
      }

      return {
        isValid: false,
        sanitizedUrl: safeBase,
        reason: 'Blocked vercel.com platform URL; sanitized to application base',
      }
    } catch {
      return {
        isValid: false,
        sanitizedUrl: safeBase,
        reason: 'Blocked vercel.com platform URL; sanitized to application base',
      }
    }
  }

  // 3. Allow safe relative paths
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { isValid: true, sanitizedUrl: `${safeBase}${trimmed}` }
  }

  // 4. Parse full URL
  try {
    const parsed = new URL(trimmed)
    const hostname = parsed.hostname.toLowerCase()

    if (hostname === 'vercel.com' || (hostname.endsWith('.vercel.com') && !hostname.endsWith('.vercel.app'))) {
      return {
        isValid: false,
        sanitizedUrl: `${safeBase}${parsed.pathname}${parsed.search}${parsed.hash}`,
        reason: 'Blocked vercel.com platform host; sanitized to application base',
      }
    }

    // Allow trusted third-party payment gateways
    if (hostname.endsWith('paystack.com') || hostname.endsWith('hubtel.com')) {
      return { isValid: true, sanitizedUrl: trimmed }
    }

    if (isTrustedHost(hostname)) {
      // In production or testing mode, ensure localhost URLs are upgraded to safe base
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
      const baseIsLocalhost = safeBase.includes('localhost') || safeBase.includes('127.0.0.1')
      if (isLocalhost && !baseIsLocalhost) {
        return {
          isValid: true,
          sanitizedUrl: `${safeBase}${parsed.pathname}${parsed.search}${parsed.hash}`,
        }
      }
      return { isValid: true, sanitizedUrl: trimmed }
    }

    // Untrusted external domain -> sanitize to application base preserving path
    return {
      isValid: false,
      sanitizedUrl: `${safeBase}${parsed.pathname}${parsed.search}${parsed.hash}`,
      reason: `Untrusted external domain ${hostname} sanitized to ${safeBase}`,
    }
  } catch {
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    return { isValid: true, sanitizedUrl: `${safeBase}${cleanPath}` }
  }
}

/**
 * Centralized URL Security Validator (alias to validateAppUrl).
 */
export const validateUrlSecurity = validateAppUrl

/**
 * Environment-aware customer URL sanitizer for customer-facing links (Brevo emails, SMS, client portals).
 * Resolves relative paths, bare tokens, and ensures links use the appropriate active domain.
 */
export function getProductionUrl(urlStr: string, context?: any): string {
  const base = getAppBaseUrl(context)
  if (!urlStr || typeof urlStr !== 'string') return base
  const trimmed = urlStr.trim()
  if (!trimmed) return base

  // 1. Bare token -> treat as payment token
  if (!trimmed.startsWith('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return buildPaymentUrl(trimmed, context)
  }

  // 2. Validate and sanitize
  const validation = validateAppUrl(trimmed, context)
  return validation.sanitizedUrl
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

  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return defaultUrl
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    const baseHost = new URL(getAppBaseUrl(context)).hostname

    if (isTrustedHost(parsed.hostname) || parsed.hostname === baseHost) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {}

  return defaultUrl
}

