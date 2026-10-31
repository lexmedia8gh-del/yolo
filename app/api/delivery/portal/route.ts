import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const clientId = (searchParams.get('client') || '').trim()
    const db = getAdminDb()

    const portals: Array<{
      id: string
      projectName: string
      status: string
      accessToken: string
      fileCount: number
      updatedAt: string | null
    }> = []

    const paymentLinks: Array<{
      id: string
      title: string
      amount: number
      currency: string
      token: string
      status: string
    }> = []

    let clientName = (searchParams.get('name') || '').trim()

    if (clientId && !clientId.startsWith('custom_')) {
      try {
        const deliveriesSnap = await db
          .collection(COLLECTIONS.DELIVERIES)
          .where('clientId', '==', clientId)
          .get()

        deliveriesSnap.docs.forEach((doc) => {
          const d = doc.data() || {}
          if (!d.accessToken) return
          if (!clientName && d.clientName) clientName = String(d.clientName)
          portals.push({
            id: doc.id,
            projectName: String(d.projectName || d.title || 'Project Portal'),
            status: String(d.projectStatus || d.status || 'Active'),
            accessToken: String(d.accessToken),
            fileCount: Number(d.fileCount || 0),
            updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
          })
        })
      } catch {
        // Non-fatal
      }

      try {
        const linksSnap = await db
          .collection(COLLECTIONS.CLIENT_LINKS)
          .where('clientId', '==', clientId)
          .get()

        linksSnap.docs.forEach((doc) => {
          const l = doc.data() || {}
          if (!l.token || l.status === 'disabled') return
          if (!clientName && l.clientName) clientName = String(l.clientName)
          paymentLinks.push({
            id: doc.id,
            title: String(l.title || l.projectName || 'Invoice Payment'),
            amount: Number(l.amount || 0),
            currency: String(l.currency || 'GHS'),
            token: String(l.token),
            status: String(l.status || 'Active'),
          })
        })
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({
      ok: true,
      clientName: clientName || 'Valued Client',
      portals,
      paymentLinks,
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to load client portal hub.' },
      { status: 500 }
    )
  }
}
