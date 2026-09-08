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
]

// Routes that should redirect to dashboard if already authenticated
const AUTH_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for Firebase auth session cookie
  const sessionCookie = request.cookies.get('__session')
  const isAuthenticated = !!sessionCookie?.value

  // Check if path is protected
  const isProtectedPath = PROTECTED_PATHS.some((path) =>
    pathname.startsWith(path)
  )

  // Check if path is auth-only (login page)
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path))

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
     * - Public client pages /p/*, /pay/*, /delivery/*, /d/* (always accessible)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api|p/|pay/|delivery/|d/).*)',
  ],
}
