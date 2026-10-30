import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { getEmailSender, senderName } from '@/lib/config/email'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const apiKey = process.env.BREVO_API_KEY
  const senderInfo = getEmailSender()

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      configured: false,
      mode: 'preview',
      senderName,
      senderEmail: senderInfo.email,
      message: 'BREVO_API_KEY environment variable is not set. System is operating in preview / simulated dispatch mode.',
    })
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'api-key': apiKey,
      },
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        configured: true,
        status: res.status,
        error: data.message || data.code || 'Failed to authenticate Brevo API Key',
        senderName,
        senderEmail: senderInfo.email,
      })
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      mode: 'live',
      accountEmail: data.email,
      companyName: data.companyName,
      plan: data.plan,
      senderName,
      senderEmail: senderInfo.email,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      configured: true,
      error: err?.message || 'Network error connecting to Brevo API',
      senderName,
      senderEmail: senderInfo.email,
    })
  }
}
