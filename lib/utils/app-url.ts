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
 * Detects whether a hostname or URL points to a local/loopback development address
 * (localhost, 127.x.x.x, 0.0.0.0, [::1], .local, or common dev ports on local hosts).
 */
export function isLocalhostUrl(input?: string | null): boolean {
  if (!input || typeof input !== 'string') return false
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return false

  const checkHostAndPort = (hostname: string, port: string): boolean => {
    const cleanHost = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (
      cleanHost === 'localhost' ||
      cleanHost.endsWith('.localhost') ||
      cleanHost.endsWith('.local') ||
      cleanHost === '0.0.0.0' ||
      cleanHost === '::1' ||
      cleanHost === '0:0:0:0:0:0:0:1' ||
      /^127(?:\.\d{1,3}){3}$/.test(cleanHost)
    ) {
      return true
    }
    if (port && ['3000', '3001', '5173', '8080', '4173'].includes(port)) {
      return true
    }
    return false
  }

  try {
    const withProto =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `http://${trimmed}`
    const parsed = new URL(withProto)
    return checkHostAndPort(parsed.hostname, parsed.port)
  } catch {
    return (
      trimmed.includes('localhost') ||
      trimmed.includes('127.0.0.1') ||
      trimmed.includes('0.0.0.0') ||
      trimmed.includes('[::1]')
    )
  }
}

/**
 * Authoritative Centralized Base URL Resolver.
 * Priority:
 * 1. Explicit canonical production URL ONLY when production mode is intentionally enabled.
 * 2. Configured non-localhost APP_URL / NEXT_PUBLIC_APP_URL (never overridden by internal localhost headers).
 * 3. Non-localhost request origin (x-forwarded-host / host) or browser origin.
 * 4. Vercel runtime deployment hostname when deployed on Vercel.
 * 5. Local request/browser origin or DEFAULT_DEV_DOMAIN ONLY during local UI browsing.
 */
export function getAppBaseUrl(context?: any): string {
  // Configured environment variables
  const configuredAppUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const safeConfiguredAppUrl = isVercelPlatformDomain(configuredAppUrl) ? '' : configuredAppUrl
  const normalizedConfiguredUrl = safeConfiguredAppUrl ? normalizeUrl(safeConfiguredAppUrl) : ''
  const hasNonLocalConfiguredUrl =
    Boolean(normalizedConfiguredUrl) &&
    !isVercelPlatformDomain(normalizedConfiguredUrl) &&
    !isLocalhostUrl(normalizedConfiguredUrl)

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
    Boolean(cleanVercelHost) &&
    !isVercelPlatformDomain(cleanVercelHost) &&
    cleanVercelHost !== 'vercel.com' &&
    !isLocalhostUrl(cleanVercelHost)

  // 1. Explicit production domain ONLY when production mode is intentionally enabled
  const isProductionExplicitlyEnabled =
    process.env.PRODUCTION_DOMAIN_CONFIGURED === 'true' ||
    process.env.FORCE_PRODUCTION_DOMAIN === 'true' ||
    (process.env.APP_ENV === 'production' && safeConfiguredAppUrl.includes('lexmedia.gh')) ||
    safeConfiguredAppUrl === CANONICAL_PRODUCTION_DOMAIN

  const isVercelTesting =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.APP_ENV === 'testing' ||
    Boolean(safeConfiguredAppUrl && safeConfiguredAppUrl.includes('.vercel.app'))

  if (isProductionExplicitlyEnabled && !isVercelTesting) {
    return CANONICAL_PRODUCTION_DOMAIN
  }

  // 2. Configured non-localhost production/deployment APP_URL takes priority over loopback headers
  if (hasNonLocalConfiguredUrl) {
    return normalizedConfiguredUrl
  }

  // 3a. Non-localhost server-side request headers (e.g. Cloud Run / Vercel / custom domain)
  const hostFromContext = extractHostFromContext(context)
  if (
    hostFromContext &&
    !isVercelPlatformDomain(hostFromContext) &&
    !isLocalhostUrl(hostFromContext)
  ) {
    return hostFromContext
  }

  // 3b. Non-localhost browser origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin && !isVercelPlatformDomain(origin) && !isLocalhostUrl(origin)) {
      return origin
    }
  }

  // 4. Vercel runtime deployment hostname when deployed on Vercel
  if (isVercelHostValid) {
    return `https://${cleanVercelHost}`
  }

  // 5. Fallback for local UI navigation ONLY (never permitted for outgoing dispatch emails)
  if (hostFromContext && !isVercelPlatformDomain(hostFromContext)) {
    return hostFromContext
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin && !isVercelPlatformDomain(origin)) {
      return origin
    }
  }

  if (normalizedConfiguredUrl && !isVercelPlatformDomain(normalizedConfiguredUrl)) {
    return normalizedConfiguredUrl
  }

  return DEFAULT_DEV_DOMAIN
}

/**
 * Strictly resolves the public production base URL for outgoing client communications
 * (Brevo emails, SMS, WhatsApp links, portal links, and email logo URLs).
 * NEVER falls back to localhost, 127.0.0.1, 0.0.0.0, or local development ports.
 */
export function resolveStrictProductionBaseUrl(context?: any): {
  ok: boolean
  baseUrl: string
  error?: string
} {
  const configuredAppUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()

  // If APP_URL was explicitly set to localhost/loopback, surface a clear configuration error
  // unless a non-localhost public deployment host is available.
  const safeConfigured =
    configuredAppUrl && !isVercelPlatformDomain(configuredAppUrl)
      ? normalizeUrl(configuredAppUrl)
      : ''

  if (safeConfigured && !isLocalhostUrl(safeConfigured)) {
    const httpsBase = safeConfigured.replace(/^http:\/\//i, 'https://')
    return { ok: true, baseUrl: httpsBase }
  }

  const isProductionExplicitlyEnabled =
    process.env.PRODUCTION_DOMAIN_CONFIGURED === 'true' ||
    process.env.FORCE_PRODUCTION_DOMAIN === 'true'
  if (isProductionExplicitlyEnabled) {
    return { ok: true, baseUrl: CANONICAL_PRODUCTION_DOMAIN }
  }

  const hostFromContext = extractHostFromContext(context)
  if (
    hostFromContext &&
    !isVercelPlatformDomain(hostFromContext) &&
    !isLocalhostUrl(hostFromContext)
  ) {
    return { ok: true, baseUrl: hostFromContext.replace(/^http:\/\//i, 'https://') }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '')
    if (origin && !isVercelPlatformDomain(origin) && !isLocalhostUrl(origin)) {
      return { ok: true, baseUrl: origin.replace(/^http:\/\//i, 'https://') }
    }
  }

  const rawVercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL ||
    ''
  const cleanVercelHost = rawVercelHost.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (
    cleanVercelHost &&
    !isVercelPlatformDomain(cleanVercelHost) &&
    !isLocalhostUrl(cleanVercelHost)
  ) {
    return { ok: true, baseUrl: `https://${cleanVercelHost}` }
  }

  return {
    ok: false,
    baseUrl: '',
    error:
      'Production base URL (APP_URL) is missing or points to localhost/127.0.0.1. Configure APP_URL with your public HTTPS domain before dispatching client emails or portal links.',
  }
}

/**
 * Validates that NO outgoing dispatch URL, logo URL, portal CTA, or message link
 * contains localhost, 127.0.0.1, 0.0.0.0, [::1], or a local development port.
 */
export function validateOutgoingDispatchUrls(input: {
  baseUrl?: string
  portalUrl?: string
  logoUrl?: string
  htmlContent?: string
  textContent?: string
}): { valid: boolean; offendingUrls: string[]; error?: string } {
  const offending = new Set<string>()

  const inspectUrl = (candidate?: string) => {
    if (!candidate || typeof candidate !== 'string') return
    const trimmed = candidate.trim()
    if (!trimmed) return
    if (isLocalhostUrl(trimmed) || isVercelPlatformDomain(trimmed)) {
      offending.add(trimmed)
    }
  }

  if (!input.baseUrl || isLocalhostUrl(input.baseUrl)) {
    offending.add(input.baseUrl || '(missing APP_URL)')
  }

  inspectUrl(input.portalUrl)
  inspectUrl(input.logoUrl)

  const urlAttrRegex = /(?:href|src)=["']([^"']+)["']/gi
  if (input.htmlContent) {
    let m: RegExpExecArray | null
    while ((m = urlAttrRegex.exec(input.htmlContent)) !== null) {
      const val = m[1].trim()
      if (!val.startsWith('mailto:') && !val.startsWith('tel:') && !val.startsWith('#')) {
        inspectUrl(val)
        if (val.startsWith('/')) {
          offending.add(`relative-url:${val}`)
        }
      }
    }
  }

  const rawHttpRegex = /https?:\/\/[^\s"'<>]+/gi
  for (const source of [input.htmlContent || '', input.textContent || '']) {
    if (!source) continue
    let m: RegExpExecArray | null
    while ((m = rawHttpRegex.exec(source)) !== null) {
      inspectUrl(m[0])
    }
  }

  if (offending.size > 0) {
    const list = Array.from(offending)
    return {
      valid: false,
      offendingUrls: list,
      error: `Blocked invalid or local development URL(s) in outgoing dispatch: ${list.slice(0, 3).join(', ')}. Ensure APP_URL is configured to your production HTTPS domain.`,
    }
  }

  return { valid: true, offendingUrls: [] }
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
 * Retrieves optional Vercel Protection Bypass secret token if configured in the environment.
 * Allows client-facing links on Vercel preview deployments to bypass Vercel Authentication / SSO.
 */
export function getProtectionBypassSecret(): string {
  const bypass =
    process.env.VERCEL_PROTECTION_BYPASS ||
    process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    ''
  return bypass.trim()
}

/**
 * Attaches Vercel Protection Bypass query parameter if configured and targeting a *.vercel.app host.
 */
export function attachVercelBypassIfAvailable(url: string): string {
  const bypass = getProtectionBypassSecret()
  if (!bypass) return url
  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith('.vercel.app') && !parsed.searchParams.has('x-vercel-protection-bypass')) {
      parsed.searchParams.set('x-vercel-protection-bypass', bypass)
      return parsed.toString()
    }
  } catch {}
  return url
}

/**
 * Builds a secure customer-facing payment URL.
 * Routes to the canonical /pay/{token} (with /payment/secure/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/pay/{token}
 */
export function buildPaymentUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  const base = getAppBaseUrl(context)

  // If cleanToken is already a full URL, extract the payment token/path
  if (cleanToken.startsWith('http://') || cleanToken.startsWith('https://')) {
    try {
      const parsed = new URL(cleanToken)
      const sectionMatch = parsed.pathname.match(/\/(pay|payment(?:\/secure)?)\/([^/?#]+)/i)
      if (sectionMatch && sectionMatch[2]) {
        return attachVercelBypassIfAvailable(`${base}/pay/${encodeURIComponent(sectionMatch[2])}${parsed.search}${parsed.hash}`)
      }
    } catch {}
  }

  // If cleanToken starts with /pay/ or /payment/secure/
  const stripped = cleanToken.replace(/^\/?(pay|payment(?:\/secure)?)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/pay/${encodeURIComponent(stripped)}`)
}

/**
 * Builds a secure customer-facing payment URL using the /payment/secure/{token} path.
 */
export function buildSecurePaymentUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || 'sample').trim()
  const base = getAppBaseUrl(context)
  const stripped = cleanToken.replace(/^\/?(pay|payment(?:\/secure)?)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/payment/secure/${encodeURIComponent(stripped)}`)
}

/**
 * Builds a secure customer-facing delivery portal URL.
 * Routes to canonical /delivery/{token} (with /delivery/secure/{token} alias supported).
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/delivery/{token}
 */
export function buildDeliveryUrl(accessToken: string, context?: any): string {
  const cleanToken = (accessToken || '').trim()
  const base = getAppBaseUrl(context)

  // If cleanToken is already a full URL, extract the delivery token
  if (cleanToken.startsWith('http://') || cleanToken.startsWith('https://')) {
    try {
      const parsed = new URL(cleanToken)
      const sectionMatch = parsed.pathname.match(/\/(delivery(?:\/secure)?)\/([^/?#]+)/i)
      if (sectionMatch && sectionMatch[2]) {
        return attachVercelBypassIfAvailable(`${base}/delivery/${encodeURIComponent(sectionMatch[2])}${parsed.search}${parsed.hash}`)
      }
    } catch {}
  }

  const stripped = cleanToken.replace(/^\/?(delivery(?:\/secure)?)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/delivery/${encodeURIComponent(stripped)}`)
}

/**
 * Builds a secure customer-facing client preview portal URL.
 * Routes to canonical /client-preview/{token}.
 * Example: https://YOUR-APP.com/client-preview/{token}
 */
export function buildClientPreviewUrl(token: string, context?: any): string {
  const cleanToken = (token || '').trim()
  const base = getAppBaseUrl(context)
  const stripped = cleanToken.replace(/^\/?(client-preview|preview)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/client-preview/${encodeURIComponent(stripped)}`)
}

export const getClientPreviewLink = buildClientPreviewUrl

/**
 * Builds a secure customer-facing delivery portal URL using /delivery/secure/{token}.
 */
export function buildSecureDeliveryUrl(accessToken: string, context?: any): string {
  const cleanToken = (accessToken || '').trim()
  const base = getAppBaseUrl(context)
  const stripped = cleanToken.replace(/^\/?(delivery(?:\/secure)?)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/delivery/secure/${encodeURIComponent(stripped)}`)
}

/**
 * Builds a secure Quick Job customer link.
 * Routes to canonical /quick-jobs/{token}.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/quick-jobs/{token}
 */
export function buildQuickJobUrl(tokenOrId: string, context?: any): string {
  const cleanToken = (tokenOrId || '').trim()
  const base = getAppBaseUrl(context)

  if (cleanToken.startsWith('http://') || cleanToken.startsWith('https://')) {
    try {
      const parsed = new URL(cleanToken)
      const sectionMatch = parsed.pathname.match(/\/quick-jobs\/([^/?#]+)/i)
      if (sectionMatch && sectionMatch[1]) {
        return attachVercelBypassIfAvailable(`${base}/quick-jobs/${encodeURIComponent(sectionMatch[1])}${parsed.search}${parsed.hash}`)
      }
    } catch {}
  }

  const stripped = cleanToken.replace(/^\/?quick-jobs\//i, '')
  return attachVercelBypassIfAvailable(`${base}/quick-jobs/${encodeURIComponent(stripped)}`)
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
  return attachVercelBypassIfAvailable(`${base}/payment/callback${query}`)
}

/**
 * Builds a customer-facing invoice URL.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/invoices/{invoiceNumber}
 */
export function buildInvoiceUrl(invoiceNumber: string, context?: any): string {
  const clean = (invoiceNumber || '').trim()
  const base = getAppBaseUrl(context)
  return attachVercelBypassIfAvailable(`${base}/invoices/${encodeURIComponent(clean)}`)
}

/**
 * Builds a canonical Quick Job delivery portal link.
 * Example: https://YOUR-VERCEL-DEPLOYMENT.vercel.app/quick-jobs/delivery/{token}
 */
export function buildQuickJobDeliveryUrl(tokenOrAccessToken: string, context?: any): string {
  const cleanToken = (tokenOrAccessToken || '').trim()
  const base = getAppBaseUrl(context)
  const stripped = cleanToken.replace(/^\/?(quick-jobs\/delivery|quick-jobs|delivery)\//i, '')
  return attachVercelBypassIfAvailable(`${base}/quick-jobs/delivery/${encodeURIComponent(stripped)}`)
}

/**
 * Standardized conceptual URL helpers & aliases.
 */
export const getRuntimeOrigin = getAppBaseUrl
export const buildVerificationUrl = buildPaymentCallbackUrl

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

      // Check if an application section is present anywhere in the pathname
      // (e.g. /pay/xyz, /team/proj/pay/xyz, /delivery/abc, /quick-jobs/123, /invoices/456)
      const sectionMatch = parsed.pathname.match(/\/(pay|payment(?:\/secure)?|delivery(?:\/secure)?|quick-jobs|invoices)(?:\/([^/?#]+))?/i)
      if (sectionMatch) {
        const rawPrefix = sectionMatch[1].toLowerCase()
        const section = rawPrefix.startsWith('payment') ? 'pay' : rawPrefix
        const tokenSegment = sectionMatch[2] ? `/${sectionMatch[2]}` : ''
        return {
          isValid: false,
          sanitizedUrl: `${safeBase}/${section}${tokenSegment}${parsed.search}${parsed.hash}`,
          reason: 'Blocked vercel.com platform URL; redirected to application section',
        }
      }

      // Check query parameters for token hints
      const queryToken = parsed.searchParams.get('token') || parsed.searchParams.get('t')
      if (queryToken) {
        if (queryToken.startsWith('del_') || queryToken.startsWith('d_')) {
          return {
            isValid: false,
            sanitizedUrl: `${safeBase}/delivery/${encodeURIComponent(queryToken)}`,
            reason: 'Extracted delivery token from vercel.com link',
          }
        }
        if (queryToken.startsWith('qj_')) {
          return {
            isValid: false,
            sanitizedUrl: attachVercelBypassIfAvailable(`${safeBase}/pay/${encodeURIComponent(queryToken)}`),
            reason: 'Extracted quick job payment token from vercel.com link',
          }
        }
        return {
          isValid: false,
          sanitizedUrl: `${safeBase}/pay/${encodeURIComponent(queryToken)}`,
          reason: 'Extracted payment token from vercel.com link',
        }
      }

      // Check context for token fallback
      if (context && typeof context === 'object' && context.token) {
        return {
          isValid: false,
          sanitizedUrl: `${safeBase}/pay/${encodeURIComponent(context.token)}`,
          reason: 'Fallback to context payment token from vercel.com link',
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
      const sectionMatch = parsed.pathname.match(/\/(pay|payment(?:\/secure)?|delivery(?:\/secure)?|quick-jobs|invoices)(?:\/([^/?#]+))?/i)
      if (sectionMatch) {
        const rawPrefix = sectionMatch[1].toLowerCase()
        const section = rawPrefix.startsWith('payment') ? 'pay' : rawPrefix
        const tokenSegment = sectionMatch[2] ? `/${sectionMatch[2]}` : ''
        return {
          isValid: false,
          sanitizedUrl: `${safeBase}/${section}${tokenSegment}${parsed.search}${parsed.hash}`,
          reason: 'Blocked vercel.com platform host; redirected to application section',
        }
      }

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
      // Always upgrade localhost/loopback URLs to safeBase whenever safeBase is non-localhost
      const isLocalhost = isLocalhostUrl(trimmed)
      const baseIsLocalhost = isLocalhostUrl(safeBase)
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
  if (!urlStr || typeof urlStr !== 'string') {
    if (context && typeof context === 'object' && context.token) {
      return buildPaymentUrl(context.token, context)
    }
    return base
  }
  const trimmed = urlStr.trim()
  if (!trimmed) {
    if (context && typeof context === 'object' && context.token) {
      return buildPaymentUrl(context.token, context)
    }
    return base
  }

  // 1. Bare token -> treat as specific section token
  if (!trimmed.startsWith('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    if (trimmed.startsWith('del_') || trimmed.startsWith('d_')) {
      return buildDeliveryUrl(trimmed, context)
    }
    if (trimmed.startsWith('qj_')) {
      if (context?.type === 'delivery' || context?.section === 'delivery') {
        return buildQuickJobDeliveryUrl(trimmed, context)
      }
      return buildPaymentUrl(trimmed, context)
    }
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

