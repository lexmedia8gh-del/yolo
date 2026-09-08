import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const { secret, email } = await req.json()

    const expectedSecret = process.env.CLAIM_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const defaultAdminEmail = (process.env.ADMIN_EMAIL || "lexmedia8gh@gmail.com").toLowerCase().trim()
    const targetEmail = (email || defaultAdminEmail).toLowerCase().trim()

    // Ensure the target email is an authorized admin email
    const authorizedEmails = [
      defaultAdminEmail,
      "lexmedia8gh@gmail.com",
      "lexmediaapp@gmail.com"
    ].filter(Boolean)

    if (!authorizedEmails.includes(targetEmail)) {
      return NextResponse.json(
        { error: `Email ${targetEmail} is not authorized for administrator custom claims.` },
        { status: 403 }
      )
    }

    const auth = getAdminAuth()

    let userRecord
    try {
      userRecord = await auth.getUserByEmail(targetEmail)
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        return NextResponse.json(
          { error: `User ${targetEmail} not found. Sign in via Google first, then call this endpoint.` },
          { status: 404 }
        )
      }
      throw err
    }

    await auth.setCustomUserClaims(userRecord.uid, { admin: true })

    const db = getAdminDb()
    await db.collection("users").doc(userRecord.uid).set(
      {
        email: targetEmail,
        displayName: userRecord.displayName || "LexMedia Admin",
        role: "admin",
        uid: userRecord.uid,
        grantedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    console.log(`[grant-claim] Admin claim set for: ${targetEmail} (uid: ${userRecord.uid})`)

    return NextResponse.json({
      success: true,
      message: `Admin claim granted to ${targetEmail}. User must sign out and back in for the claim to take effect.`,
      uid: userRecord.uid,
    })
  } catch (error: any) {
    console.error("[grant-claim] Error:", error)
    return NextResponse.json({ error: error.message || "Failed to grant claim" }, { status: 500 })
  }
}
