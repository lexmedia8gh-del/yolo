import { NextRequest } from 'next/server'
import { GET as handleAssetGet } from '@/app/api/client-preview/[token]/asset/route'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: { token: string } }
) {
  return handleAssetGet(req, context)
}
