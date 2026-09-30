import { NextResponse } from 'next/server'
import { seedOfficialCatalogue } from '@/lib/services/catalogueData'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await seedOfficialCatalogue()
    return NextResponse.json({
      success: true,
      message: 'Official LEXMEDIA.GH catalogue synchronised successfully.',
      ...result,
    })
  } catch (error: any) {
    console.error('Failed to seed official catalogue:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to seed official catalogue',
      },
      { status: 500 }
    )
  }
}
