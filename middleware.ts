import { NextRequest, NextResponse } from 'next/server'

// Routes that require authentication
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
]

// Routes that should redirect to dashboard if already authenticated
const AUTH_PATHS = ['/login']

// Public client-facing routes that MUST bypass admin authentication:
// - /pay/* (payment portal)
// - /payment/* (payment portal alias)
// - /p/* (short payment link)
// - /delivery/* (secure delivery portal)
// - /d/* (short delivery link)
// - /quick-jobs/delivery/* (quick job delivery portal)
// - /quick-jobs/[token] (client token view)
// - /client/quick-job/* (client quick job alias)
export function isPublicClientRoute(pathname: string): boolean {
  if (
    pathname === '/pay' ||
    pathname.startsWith('/pay/') ||
    pathname === '/payment' ||
    pathname.startsWith('/payment/') ||
    pathname.startsWith('/p/') ||
    pathname === '/delivery' ||
    pathname.startsWith('/delivery/') ||
    pathname.startsWith('/d/') ||
    pathname.startsWith('/quick-jobs/delivery') ||
    pathname.startsWith('/client/quick-job')
  ) {
    return true
  }

  // Quick job client token portals: /quick-jobs/[token]
  // Note: /quick-jobs and /quick-jobs/ are the admin portal, which remains protected.
  if (pathname.startsWith('/quick-jobs/') && pathname !== '/quick-jobs/') {
    return true
  }

  return false
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Unconditionally allow public client-facing portal routes
  if (isPublicClientRoute(pathname)) {
    return NextResponse.next()
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
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login page
  if (isAuthPath && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     * - API routes (handled separately)
     * - Public client pages (pay, payment, delivery, d, p, client)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api|p/|pay|payment|delivery|d/|client).*)',
  ],
}
