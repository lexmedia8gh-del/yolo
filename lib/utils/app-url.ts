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
  if (trimmed.includes('vercel.com') && !trimmed.includes('.vercel.app')) {
    trimmed = trimmed.replace(/https?:\/\/([a-zA-Z0-9\-_]+\.)?vercel\.com[^\s]*/gi, '')
    if (!trimmed) return ''
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
        if (parsed.hostname && !parsed.hostname.includes('vercel.com')) {
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
          if (cleanHost === 'vercel.com' || cleanHost.endsWith('.vercel.com')) {
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
        if (!origin.includes('vercel.com')) {
          return origin.replace(/\/+$/, '')
        }
      }
    } catch {}
  }

  return null
}

/**
 * Authoritative Centralized Base URL Resolver.
 * Determines the application's base URL with strict environment awareness:
 * 
 * 1. Runtime request headers (x-forwarded-host) or browser origin (window.location.origin)
 * 2. Vercel deployment variables (VERCEL_URL, NEXT_PUBLIC_VERCEL_URL, etc.)
 * 3. Configured environment variables (APP_URL, NEXT_PUBLIC_APP_URL)
 * 4. Localhost fallback (http://localhost:3000) during local development
 * 5. Production domain (https://lexmedia.gh) ONLY when explicitly configured as the active production domain.
 */
export function getAppBaseUrl(context?: any): string {
  // 1. Browser context: Authoritative active origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin && !origin.includes('vercel.com')) {
      return origin
    }
  }

  // 2. Request context (Server-side dynamic host detection)
  const hostFromContext = extractHostFromContext(context)
  if (hostFromContext) {
    return hostFromContext
  }

  // 3. Vercel deployment environment variables
  // Vercel sets VERCEL_URL (e.g. project-git-branch.vercel.app or project.vercel.app)
  const vercelHost =
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL

  if (vercelHost && typeof vercelHost === 'string') {
    const cleanVercel = vercelHost.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    // Must be a .vercel.app domain and not vercel.com platform
    if (cleanVercel && !cleanVercel.includes('vercel.com') && cleanVercel.includes('.vercel.app')) {
      return `https://${cleanVercel}`
    }
  }

  // 4. Configured APP_URL / NEXT_PUBLIC_APP_URL environment variable
  const configuredAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configuredAppUrl && typeof configuredAppUrl === 'string') {
    const normalized = normalizeUrl(configuredAppUrl)
    // Avoid returning vercel.com platform domain
    if (normalized && !normalized.includes('vercel.com')) {
      return normalized
    }
  }

  // 5. Check if production domain is strictly configured as active
  const isProductionDomainConfigured =
    process.env.PRODUCTION_DOMAIN_CONFIGURED === 'true' ||
    process.env.FORCE_PRODUCTION_DOMAIN === 'true' ||
    Boolean(configuredAppUrl && configuredAppUrl.includes('lexmedia.gh'))

  const isVercelTesting = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || vercelHost)

  if (isProductionDomainConfigured && !isVercelTesting) {
    return CANONICAL_PRODUCTION_DOMAIN
  }

  // 6. Local development or container fallback
  const isLocalDev =
    process.env.NODE_ENV === 'development' ||
    process.env.APP_ENV === 'development' ||
    process.env.APP_ENV === 'local'

  if (isLocalDev) {
    return DEFAULT_DEV_DOMAIN
  }

  // 7. If on Vercel without domain, construct from project name or fallback
  if (vercelHost) {
    const clean = vercelHost.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (clean && !clean.includes('vercel.com')) {
      return `https://${clean}`
    }
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
 * Routes through the standardized /payment/secure/{token} (with /pay/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/payment/secure/{token}
 */
export function buildPaymentUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  const base = getAppBaseUrl(context)
  return `${base}/payment/secure/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure customer-facing delivery portal URL.
 * Routes through the standardized /delivery/secure/{token} (with /delivery/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/delivery/secure/{token}
 */
export function buildDeliveryUrl(accessToken: string, context?: any): string {
  const cleanToken = (accessToken || '').trim()
  const base = getAppBaseUrl(context)
  return `${base}/delivery/secure/${encodeURIComponent(cleanToken)}`
}

/**
 * Builds a secure Quick Job customer link.
 * Routes through the standardized /quick-jobs/{token} (with /client/quick-job/{token} alias supported).
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

/**
 * Centralized URL Security Validator.
 * Neutralizes open redirects, malicious domains, and prevents leaking to vercel.com platform.
 */
export function validateUrlSecurity(
  urlStr: string,
  mode: 'runtime' | 'customer' = 'customer',
  context?: any
): { isValid: boolean; sanitizedUrl: string; reason?: string } {
  const safeBase = getAppBaseUrl(context)

  if (!urlStr || typeof urlStr !== 'string') {
    return { isValid: false, sanitizedUrl: safeBase, reason: 'Empty or invalid URL' }
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
    return {
      isValid: false,
      sanitizedUrl: safeBase,
      reason: 'Blocked dangerous protocol or protocol-relative URI',
    }
  }

  // Reject accidental vercel.com platform URLs
  if (trimmed.includes('vercel.com') && !trimmed.includes('.vercel.app')) {
    return {
      isValid: false,
      sanitizedUrl: safeBase,
      reason: 'Blocked vercel.com platform URL; sanitized to application base',
    }
  }

  // Allow safe relative paths
  if (trimmed.startsWith('/')) {
    return { isValid: true, sanitizedUrl: `${safeBase}${trimmed}` }
  }

  try {
    const parsed = new URL(trimmed)

    // Allow third-party payment gateways (Paystack, Hubtel)
    if (parsed.hostname.includes('paystack.com') || parsed.hostname.includes('hubtel.com')) {
      return { isValid: true, sanitizedUrl: trimmed }
    }

    // Check if domain is a trusted host
    if (isTrustedHost(parsed.hostname)) {
      return { isValid: true, sanitizedUrl: trimmed }
    }

    // Untrusted external domain -> sanitize to active base preserving path
    const sanitized = `${safeBase}${parsed.pathname}${parsed.search}${parsed.hash}`
    return {
      isValid: false,
      sanitizedUrl: sanitized,
      reason: `Untrusted domain ${parsed.hostname} sanitized to ${safeBase}`,
    }
  } catch {
    // If not a valid URL, treat as relative path or token
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    return { isValid: true, sanitizedUrl: `${safeBase}${cleanPath}` }
  }
}

/**
 * Environment-aware customer URL sanitizer for customer-facing links (Brevo emails, SMS, client portals).
 * Resolves relative paths, bare tokens, and ensures links use the appropriate active domain.
 */
export function getProductionUrl(urlStr: string, context?: any): string {
  const base = getAppBaseUrl(context)
  if (!urlStr || typeof urlStr !== 'string') return base
  const trimmed = urlStr.trim()
  if (!trimmed) return base

  // Block vercel.com platform URLs
  if (trimmed.includes('vercel.com') && !trimmed.includes('.vercel.app')) {
    return base
  }

  // 1. Bare token -> treat as payment token
  let targetPath = trimmed
  if (!targetPath.startsWith('/') && !targetPath.startsWith('http://') && !targetPath.startsWith('https://')) {
    return buildPaymentUrl(targetPath, context)
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

  // 3. Relative path -> prepend base
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

