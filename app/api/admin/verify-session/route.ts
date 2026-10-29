import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth, getAdminDb, hasAdminCredentials } from "@/lib/firebase/admin"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/verify-session
 * Called client-side after Google sign-in to confirm the user is an authorized admin.
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

    const authorizedEmails = [
      (process.env.ADMIN_EMAIL || "").toLowerCase().trim(),
      "lexmedia8gh@gmail.com",
      "lexmediaapp@gmail.com",
    ].filter(Boolean)

    const hasAdminClaim = decoded.admin === true
    const isAuthorizedEmail = Boolean(
      decoded.email && authorizedEmails.includes(decoded.email.toLowerCase().trim())
    )

    let hasStoredAdminRole = false
    if (!hasAdminClaim && !isAuthorizedEmail) {
      try {
        const snap = await getAdminDb().collection("users").doc(decoded.uid).get()
        hasStoredAdminRole = snap.exists && snap.data()?.role === "admin"
      } catch {}
    }

    if (!hasAdminClaim && !isAuthorizedEmail && !hasStoredAdminRole) {
      return NextResponse.json(
        {
          ok: false,
          error: `Access Denied. The account "${decoded.email}" is not authorized as a LexMedia admin.`,
        },
        { status: 403 }
      )
    }

    // Ensure UID-bound admin claim is persisted so future email updates never lose authorization
    if (!hasAdminClaim && hasAdminCredentials()) {
      try {
        const userRecord = await auth.getUser(decoded.uid)
        await auth.setCustomUserClaims(decoded.uid, {
          ...(userRecord.customClaims || {}),
          admin: true,
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, email: decoded.email, uid: decoded.uid })
  } catch (error: any) {
    console.error("[verify-session] Error:", error)
    return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 })
  }
}
