import { NextRequest, NextResponse } from 'next/server'
import { sendPaymentRequestEmail } from '@/lib/services/brevo'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getProductionUrl, getPaymentLink } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      toEmail,
      clientName,
      paymentUrl,
      paymentToken,
      amount,
      currency,
      currencySymbol,
      projectName,
      invoiceNumber,
      title,
      dueDate,
      personalMessage,
      businessName,
      businessLogoUrl,
      linkId,
    } = body

    if (!toEmail) {
      return NextResponse.json(
        { error: 'Recipient email (toEmail) is required' },
        { status: 400 }
      )
    }

    // Resolve authoritative production payment URL
    let resolvedPaymentUrl = paymentUrl ? getProductionUrl(paymentUrl, req) : ''
    if (!resolvedPaymentUrl && paymentToken) {
      resolvedPaymentUrl = getPaymentLink(paymentToken, req)
    }

    // If still empty and linkId provided, try to find the token in CLIENT_LINKS
    if (!resolvedPaymentUrl && linkId) {
      try {
        const adminDb = getAdminDb()
        const linkSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS).doc(linkId).get()
        if (linkSnap.exists) {
          const data = linkSnap.data()
          const token = data?.token || data?.id
          if (token) {
            resolvedPaymentUrl = getPaymentLink(token, req)
          }
        }
      } catch (e) {
        console.warn('Could not lookup payment token for linkId:', e)
      }
    }

    if (!resolvedPaymentUrl) {
      return NextResponse.json(
        { error: 'A valid payment URL or paymentToken must be provided' },
        { status: 400 }
      )
    }

    // Disallow sending localhost payment links to clients
    const finalCleanUrl = getProductionUrl(resolvedPaymentUrl, req)

    const result = await sendPaymentRequestEmail({
      toEmail,
      clientName: clientName || 'Valued Client',
      paymentUrl: finalCleanUrl,
      amount: Number(amount) || 0,
      currency: currency || 'GHS',
      currencySymbol: currencySymbol || 'GH₵',
      projectName,
      invoiceNumber,
      title,
      dueDate,
      personalMessage,
      businessName,
      businessLogoUrl,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to dispatch payment email via Brevo' },
        { status: 500 }
      )
    }

    // Log the event or update link status if linkId provided
    if (linkId) {
      try {
        const adminDb = getAdminDb()
        await adminDb.collection(COLLECTIONS.CLIENT_LINKS).doc(linkId).update({
          lastSentAt: new Date().toISOString(),
          lastSentTo: toEmail,
        })
      } catch (e) {
        console.warn('Failed to update CLIENT_LINKS lastSentAt:', e)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      paymentUrl: finalCleanUrl,
      message: `Payment request email successfully sent to ${toEmail}`,
    })
  } catch (error: any) {
    console.error('Payment send email error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server error while sending payment email' },
      { status: 500 }
    )
  }
}
