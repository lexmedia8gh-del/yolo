import { NextRequest, NextResponse } from 'next/server'
import { sendSms, validatePhoneNumber } from '@/lib/services/sms'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to, phone, message, clientId, clientName, senderId } = body

    const targetPhone = to || phone
    if (!targetPhone || !message) {
      return NextResponse.json(
        { success: false, error: "Missing required 'to'/'phone' or 'message' parameter" },
        { status: 400 }
      )
    }

    const validation = validatePhoneNumber(targetPhone)
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid phone number format' },
        { status: 400 }
      )
    }

    const result = await sendSms({
      to: validation.normalized,
      message,
      clientId,
      clientName,
      senderId,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to submit SMS',
          provider: result.provider,
          quotaRemaining: result.quotaRemaining,
          isTestKey: result.isTestKey,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      message: result.statusMessage || 'SMS request accepted by provider',
      quotaRemaining: result.quotaRemaining,
      isTestKey: result.isTestKey,
      sentAt: result.sentAt,
      to: validation.normalized,
    })
  } catch (error: any) {
    console.error('[API /api/sms/send] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error sending SMS' },
      { status: 500 }
    )
  }
}
