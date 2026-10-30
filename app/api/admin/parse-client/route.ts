import { NextRequest, NextResponse } from 'next/server'
import { runClientExtractionPipeline } from '@/lib/extraction/clientExtractionEngine'

export type {
  ParsedClientResponse,
  ExtractedEntity,
  ExtractedFinancialItem,
  ExtractedDateItem,
  ExtractionConflict,
  FieldConfidenceMeta,
  ExtractionPipelineReport,
} from '@/lib/extraction/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Malformed request payload. Expected a JSON object with a "text" string.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || !('text' in body)) {
      return NextResponse.json(
        { error: 'Missing "text" field. Please paste or type information to analyze.' },
        { status: 400 }
      )
    }

    const rawText = (body as { text: unknown }).text
    if (typeof rawText !== 'string') {
      return NextResponse.json(
        { error: 'Invalid "text" field. Input must be a text string.' },
        { status: 400 }
      )
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: 'No text provided. Please paste or type client information before analyzing.' },
        { status: 400 }
      )
    }

    // Pass verbatim rawText so Stage 1 preserves 100% of formatting, line breaks, and content
    const result = await runClientExtractionPipeline(rawText)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[parse-client] Extraction pipeline error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze pasted information.' },
      { status: 500 }
    )
  }
}
