import { NextRequest } from 'next/server'
import { handleGetClientPreview } from '@/lib/preview/client-preview'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  return handleGetClientPreview(req, params)
}
