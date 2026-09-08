import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin"

const AUTHORIZED_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "lexmedia8gh@gmail.com"

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json()

    const expectedSecret = process.env.CLAIM_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = getAdminAuth()

    let userRecord
    try {
      userRecord = await auth.getUserByEmail(AUTHORIZED_ADMIN_EMAIL)
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        return NextResponse.json(
          { error: `User ${AUTHORIZED_ADMIN_EMAIL} not found. Sign in via Google first, then call this endpoint.` },
          { status: 404 }
        )
      }
      throw err
    }

    await auth.setCustomUserClaims(userRecord.uid, { admin: true })

    const db = getAdminDb()
    await db.collection("users").doc(userRecord.uid).set(
      {
        email: AUTHORIZED_ADMIN_EMAIL,
        displayName: userRecord.displayName || "LexMedia Admin",
        role: "admin",
        uid: userRecord.uid,
        grantedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    console.log(`[grant-claim] Admin claim set for: ${AUTHORIZED_ADMIN_EMAIL} (uid: ${userRecord.uid})`)

    return NextResponse.json({
      success: true,
      message: `Admin claim granted to ${AUTHORIZED_ADMIN_EMAIL}. User must sign out and back in for the claim to take effect.`,
      uid: userRecord.uid,
    })
  } catch (error: any) {
    console.error("[grant-claim] Error:", error)
    return NextResponse.json({ error: error.message || "Failed to grant claim" }, { status: 500 })
  }
}
