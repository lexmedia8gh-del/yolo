import { NextRequest } from 'next/server'
import { handleLogClientPreview } from '@/lib/preview/client-preview'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  return handleLogClientPreview(req, params)
}
