import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/firebase/admin"

/**
 * POST /api/admin/verify-session
 * Called client-side after Google sign-in to confirm the user has the admin custom claim.
 * Returns { ok: true } if admin, or { ok: false, error } if not authorized.
 * Body: { token: string }  (Firebase ID token)
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) {
      return NextResponse.json({ ok: false, error: "No token provided" }, { status: 400 })
    }

    const auth = getAdminAuth()
    const decoded = await auth.verifyIdToken(token)

    const authorizedEmail = process.env.ADMIN_EMAIL || "lexmedia8gh@gmail.com"
    const hasAdminClaim = decoded.admin === true
    const isAuthorizedEmail = decoded.email === authorizedEmail

    if (!hasAdminClaim && !isAuthorizedEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: `Access Denied. The account "${decoded.email}" is not authorized as a LexMedia admin.`,
        },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true, email: decoded.email, uid: decoded.uid })
  } catch (error: any) {
    console.error("[verify-session] Error:", error)
    return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 })
  }
}
