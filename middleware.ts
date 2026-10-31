import { NextRequest, NextResponse } from 'next/server'

// Routes that require admin authentication
const PROTECTED_PATHS = [
  '/dashboard',
  '/clients',
  '/projects',
  '/services',
  '/packages',
  '/invoices',
  '/payments',
  '/links',
  '/analytics',
  '/settings',
  '/quick-jobs',
  '/previews',
  '/dispatch',
]

// Routes that should redirect to dashboard if already authenticated
const AUTH_PATHS = ['/login']

// Public client-facing routes that MUST bypass admin authentication:
export function isPublicClientRoute(pathname: string): boolean {
  if (
    pathname.startsWith('/api/') ||
    pathname === '/pay' ||
    pathname.startsWith('/pay/') ||
    pathname === '/payment' ||
    pathname.startsWith('/payment/') ||
    pathname.startsWith('/p/') ||
    pathname === '/delivery' ||
    pathname.startsWith('/delivery/') ||
    pathname.startsWith('/d/') ||
    pathname === '/client-preview' ||
    pathname.startsWith('/client-preview/') ||
    pathname === '/preview' ||
    pathname.startsWith('/preview/') ||
    pathname.startsWith('/quick-jobs/delivery') ||
    pathname.startsWith('/client/quick-job')
  ) {
    return true
  }

  // Quick job client token portals: /quick-jobs/[token]
  if (pathname.startsWith('/quick-jobs/') && pathname !== '/quick-jobs/') {
    return true
  }

  return false
}

function buildRedirectUrl(request: NextRequest, targetPath: string): URL {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const rawHost = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim() || ''
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()

  if (rawHost && !rawHost.startsWith('0.0.0.0')) {
    const proto =
      forwardedProto ||
      (rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1') ? 'http' : 'https')
    return new URL(targetPath, `${proto}://${rawHost}`)
  }

  const envAppUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (envAppUrl.startsWith('http://') || envAppUrl.startsWith('https://')) {
    return new URL(targetPath, envAppUrl)
  }

  return new URL(targetPath, request.url)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Unconditionally allow API routes & public client-facing portal routes
  if (isPublicClientRoute(pathname)) {
    return NextResponse.next()
  }

  // Handle root path / cleanly at middleware level
  if (pathname === '/') {
    const sessionCookie = request.cookies.get('__session')
    const isAuthenticated = !!sessionCookie?.value
    return NextResponse.redirect(
      buildRedirectUrl(request, isAuthenticated ? '/dashboard' : '/login')
    )
  }

  // 2. Check for Firebase auth session cookie
  const sessionCookie = request.cookies.get('__session')
  const isAuthenticated = !!sessionCookie?.value

  // 3. Check if path is protected admin route
  const isProtectedPath = PROTECTED_PATHS.some((path) =>
    pathname === path || pathname.startsWith(`${path}/`)
  )

  // 4. Check if path is auth-only (login page)
  const isAuthPath = AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  // Redirect unauthenticated users away from protected routes
  if (isProtectedPath && !isAuthenticated) {
    const loginUrl = buildRedirectUrl(request, '/login')
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login page
  if (isAuthPath && isAuthenticated) {
    return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api).*)',
  ],
}
