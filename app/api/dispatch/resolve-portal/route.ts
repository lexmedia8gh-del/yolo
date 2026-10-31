import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/firebase/admin'
import { resolveRecipientPortalTarget } from '@/lib/portal/resolveClientPortal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId') || ''
    const clientName = searchParams.get('clientName') || ''
    const clientEmail = searchParams.get('clientEmail') || ''
    const projectId = searchParams.get('projectId') || ''
    const preferGeneralPortal = searchParams.get('preferGeneral') === 'true'
    const explicitPublicPath = searchParams.get('portalPath') || ''

    const resolved = await resolveRecipientPortalTarget({
      clientId,
      clientName,
      clientEmail,
      projectId,
      preferGeneralPortal,
      explicitPublicPath,
      requestContext: req,
    })

    if (!resolved.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: resolved.error || 'Could not resolve production portal URL.',
        },
        { status: 422 }
      )
    }

    return NextResponse.json(resolved)
  } catch (err: any) {
    console.error('[Resolve Portal API Error]:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to resolve client portal link.' },
      { status: 500 }
    )
  }
}
