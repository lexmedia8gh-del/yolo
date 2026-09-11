import {
  getCustomerUrl,
  getRuntimeUrl,
  getProductionUrl,
  buildPaymentUrl,
  buildInvoiceUrl,
  buildDeliveryUrl,
  buildQuickJobDeliveryUrl,
  sanitizeRedirectUrl,
  validateUrlSecurity,
  isTrustedHost,
  CANONICAL_PRODUCTION_DOMAIN,
} from './lib/utils/app-url'

console.log('=== RUNNING ENVIRONMENT-AWARE URL SECURITY & GATEWAY TESTS ===\n')

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('❌ ASSERTION FAILED:', message)
    process.exit(1)
  } else {
    console.log('✅', message)
  }
}

// ─── TEST SUITE 1: VERCEL TESTING ENVIRONMENT ──────────────────────────────────
console.log('--- TEST SUITE 1: VERCEL TESTING ENVIRONMENT ---')
const originalEnv = { ...process.env }

// Simulate Vercel Testing Environment
process.env.APP_ENV = 'testing'
process.env.APP_URL = 'https://lexmedia-preview-git-main.vercel.app'
delete process.env.NEXT_PUBLIC_APP_URL

const vercelCustomerUrl = getCustomerUrl()
console.log('1. getCustomerUrl() in Vercel testing:', vercelCustomerUrl)
assert(
  vercelCustomerUrl === 'https://lexmedia-preview-git-main.vercel.app',
  'Customer URL in Vercel testing must use the Vercel deployment URL'
)

const vercelPaymentUrl = buildPaymentUrl('pay_sec_token_999')
console.log('2. buildPaymentUrl() in Vercel testing:', vercelPaymentUrl)
assert(
  vercelPaymentUrl === 'https://lexmedia-preview-git-main.vercel.app/pay/pay_sec_token_999',
  'Payment URL in testing must use Vercel URL and preserve secure token'
)

const vercelInvoiceUrl = buildInvoiceUrl('LXMF-2026-0042')
console.log('3. buildInvoiceUrl() in Vercel testing:', vercelInvoiceUrl)
assert(
  vercelInvoiceUrl === 'https://lexmedia-preview-git-main.vercel.app/invoices/LXMF-2026-0042',
  'Invoice URL in testing must use Vercel URL'
)

const vercelDeliveryUrl = buildDeliveryUrl('del_access_tok_xyz123')
console.log('4. buildDeliveryUrl() in Vercel testing:', vercelDeliveryUrl)
assert(
  vercelDeliveryUrl === 'https://lexmedia-preview-git-main.vercel.app/delivery/del_access_tok_xyz123',
  'Delivery URL in testing must use Vercel URL and preserve access token'
)

const vercelQjDeliveryUrl = buildQuickJobDeliveryUrl('qj_tok_abc456')
console.log('5. buildQuickJobDeliveryUrl() in Vercel testing:', vercelQjDeliveryUrl)
assert(
  vercelQjDeliveryUrl === 'https://lexmedia-preview-git-main.vercel.app/delivery/qj_tok_abc456',
  'Quick Job delivery URL in testing must use Vercel URL'
)

const vercelTrusted = isTrustedHost('lexmedia-preview-git-main.vercel.app')
console.log('6. isTrustedHost for *.vercel.app:', vercelTrusted)
assert(vercelTrusted === true, 'Vercel domain must be recognized as a trusted application host')

// ─── TEST SUITE 2: FUTURE PRODUCTION ENVIRONMENT ──────────────────────────────
console.log('\n--- TEST SUITE 2: FUTURE PRODUCTION ENVIRONMENT ---')
process.env.APP_ENV = 'production'
process.env.APP_URL = 'https://lexmedia.gh'

const prodCustomerUrl = getCustomerUrl()
console.log('7. getCustomerUrl() in production:', prodCustomerUrl)
assert(
  prodCustomerUrl === 'https://lexmedia.gh',
  'Customer URL in production mode must return https://lexmedia.gh'
)

const prodPaymentUrl = buildPaymentUrl('pay_live_tok_111')
console.log('8. buildPaymentUrl() in production:', prodPaymentUrl)
assert(
  prodPaymentUrl === 'https://lexmedia.gh/pay/pay_live_tok_111',
  'Payment URL in production must use https://lexmedia.gh'
)

const prodInvoiceUrl = buildInvoiceUrl('INV-2026-999')
console.log('9. buildInvoiceUrl() in production:', prodInvoiceUrl)
assert(
  prodInvoiceUrl === 'https://lexmedia.gh/invoices/INV-2026-999',
  'Invoice URL in production must use https://lexmedia.gh'
)

const prodDeliveryUrl = buildDeliveryUrl('prod_access_tok_777')
console.log('10. buildDeliveryUrl() in production:', prodDeliveryUrl)
assert(
  prodDeliveryUrl === 'https://lexmedia.gh/delivery/prod_access_tok_777',
  'Delivery URL in production must use https://lexmedia.gh'
)

// In production mode, sanitize legacy localhost link
const sanitizedLocal = getProductionUrl('http://localhost:3000/pay/legacy_tok')
console.log('11. Sanitize localhost in production:', sanitizedLocal)
assert(
  sanitizedLocal === 'https://lexmedia.gh/pay/legacy_tok',
  'Localhost URL in production mode must be sanitized to https://lexmedia.gh'
)

// ─── TEST SUITE 3: LOCAL DEVELOPMENT ENVIRONMENT ──────────────────────────────
console.log('\n--- TEST SUITE 3: LOCAL DEVELOPMENT ENVIRONMENT ---')
process.env.APP_ENV = 'development'
process.env.APP_URL = 'http://localhost:3000'

const devCustomerUrl = getCustomerUrl()
console.log('12. getCustomerUrl() in local development:', devCustomerUrl)
assert(
  devCustomerUrl === 'http://localhost:3000',
  'Customer URL in development mode must return http://localhost:3000'
)

const devPaymentUrl = buildPaymentUrl('dev_token_123')
console.log('13. buildPaymentUrl() in development:', devPaymentUrl)
assert(
  devPaymentUrl === 'http://localhost:3000/pay/dev_token_123',
  'Payment URL in development must use localhost:3000'
)

// ─── TEST SUITE 4: SECURITY & OPEN REDIRECT PROTECTION ─────────────────────────
console.log('\n--- TEST SUITE 4: SECURITY & OPEN REDIRECT PROTECTION ---')
// Reset to testing mode
process.env.APP_ENV = 'testing'
process.env.APP_URL = 'https://lexmedia-preview-git-main.vercel.app'

// Safe relative redirect
const safeRelative = sanitizeRedirectUrl('/invoices')
console.log('14. Safe relative redirect (/invoices):', safeRelative)
assert(safeRelative === '/invoices', 'Relative paths must be allowed')

// Safe trusted domain redirect
const safeVercelRedirect = sanitizeRedirectUrl('https://lexmedia-preview-git-main.vercel.app/dashboard')
console.log('15. Safe trusted domain redirect:', safeVercelRedirect)
assert(safeVercelRedirect === '/dashboard', 'Trusted domain redirects must extract safe path')

// Malicious open redirect
const maliciousRedirect = sanitizeRedirectUrl('https://evil-phishing-site.com/steal-credentials')
console.log('16. Malicious redirect (external site):', maliciousRedirect)
assert(maliciousRedirect === '/dashboard', 'Untrusted external redirect must default to /dashboard')

// Protocol injection attacks
const jsScheme = sanitizeRedirectUrl('javascript:alert(document.cookie)')
console.log('17. JavaScript scheme attack:', jsScheme)
assert(jsScheme === '/dashboard', 'javascript: scheme must be blocked')

const protocolRelative = sanitizeRedirectUrl('//attacker.com/login')
console.log('18. Protocol-relative attack:', protocolRelative)
assert(protocolRelative === '/dashboard', 'Protocol-relative // URLs must be blocked')

// Malicious external payment link sanitization
const maliciousPaymentLink = getProductionUrl('https://attacker-payment-gateway.com/pay/pay_token')
console.log('19. Malicious payment link sanitization:', maliciousPaymentLink)
assert(
  maliciousPaymentLink === 'https://lexmedia-preview-git-main.vercel.app/pay/pay_token',
  'Untrusted external payment URL must be sanitized to active application domain'
)

// Restore environment
process.env = originalEnv



// ─── TEST SUITE 5: VERCEL PREVIEW FALSE POSITIVE ─────────────────────────────
console.log('\n--- TEST SUITE 5: VERCEL PREVIEW (NODE_ENV=production) ---')
Object.defineProperty(process.env, "NODE_ENV", { value: "production" }); //'production'
process.env.VERCEL_ENV = 'preview'
process.env.NEXT_PUBLIC_VERCEL_URL = 'preview.vercel.app'
delete process.env.APP_ENV
delete process.env.APP_URL

const previewUrl = getCustomerUrl()
console.log('20. getCustomerUrl() on Vercel preview:', previewUrl)
assert(
  previewUrl === 'https://preview.vercel.app',
  'Vercel preview must not fall back to production domain'
)
console.log('\n=== ALL 20 URL SECURITY & ENVIRONMENT-AWARE GATEWAY TESTS PASSED ===')
