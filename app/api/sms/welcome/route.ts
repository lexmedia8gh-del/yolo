import { NextRequest, NextResponse } from 'next/server'
import { sendWelcomeSms, validatePhoneNumber } from '@/lib/services/sms'
import { getDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BusinessSettings } from '@/lib/types'

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

    let templateToUse = customTemplate
    if (!templateToUse) {
      try {
        const bizSettings = await getDocument<BusinessSettings>(COLLECTIONS.SETTINGS, 'business')
        if (bizSettings && bizSettings.defaultWelcomeSmsTemplate) {
          templateToUse = bizSettings.defaultWelcomeSmsTemplate
        }
      } catch {
        // use fallback/default
      }
    }

    const result = await sendWelcomeSms({
      phone: validation.normalized,
      clientName: clientName || 'Valued Client',
      phoneNumber: validation.normalized,
      clientId,
      businessName: businessName || 'LEXMEDIA.GH',
      customTemplate: templateToUse,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'SMS provider rejected the request.',
          provider: result.provider,
          quotaRemaining: result.quotaRemaining,
          phone: validation.normalized,
          isTestKey: result.isTestKey,
        },
        { status: 200 } // Return 200 so frontend handles provider response gracefully without interrupting client creation
      )
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      message: result.statusMessage || 'SMS request accepted by provider',
      quotaRemaining: result.quotaRemaining,
      phone: validation.normalized,
      isTestKey: result.isTestKey,
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
