import { NextRequest, NextResponse } from 'next/server'
import { handleGetClientPreview } from '@/lib/preview/client-preview'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } | Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    return await handleGetClientPreview(req, resolvedParams)
  } catch (err: any) {
    console.error('[API /api/client-preview/[token] Exception]:', err)
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Server Exception',
        stack: err?.stack,
      },
      { status: 500 }
    )
  }
}
