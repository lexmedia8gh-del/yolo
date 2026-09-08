import { NextRequest, NextResponse } from 'next/server'
import { sendWelcomeSms, validatePhoneNumber } from '@/lib/services/sms'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, clientName, clientId, customTemplate, businessName } = body

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Phone number is required to send welcome SMS.',
        },
        { status: 400 }
      )
    }

    const validation = validatePhoneNumber(phone)
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error || 'The provided phone number is invalid.',
          phone,
        },
        { status: 400 }
      )
    }

    const result = await sendWelcomeSms({
      phone: validation.normalized,
      clientName: clientName || 'Valued Client',
      clientId,
      businessName: businessName || 'Ctrl Room',
      customTemplate,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'SMS provider failed to deliver the message.',
          provider: result.provider,
          quotaRemaining: result.quotaRemaining,
          phone: validation.normalized,
        },
        { status: 200 } // Return 200 so frontend client handles provider failure gracefully without crashing
      )
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      quotaRemaining: result.quotaRemaining,
      phone: validation.normalized,
      sentAt: result.sentAt,
    })
  } catch (error: any) {
    console.error('[API /api/sms/welcome] Server error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Unexpected server error while processing SMS request.',
      },
      { status: 500 }
    )
  }
}
