import { NextRequest, NextResponse } from 'next/server'
import { sendInvoiceEmail } from '@/lib/services/brevo'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getProductionUrl, getPaymentLink } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      invoiceId,
      toEmail,
      clientName,
      invoiceNumber,
      dueDate,
      totalAmount,
      balanceDue,
      currencySymbol,
      paymentUrl,
      paymentToken,
      personalMessage,
      items,
      businessName,
      businessLogoUrl,
    } = body

    if (!toEmail || !invoiceNumber) {
      return NextResponse.json(
        { error: 'Missing required parameters (toEmail or invoiceNumber)' },
        { status: 400 }
      )
    }

    // Resolve authoritative production payment URL
    let resolvedPaymentUrl = paymentUrl ? getProductionUrl(paymentUrl, req) : ''
    if (!resolvedPaymentUrl && paymentToken) {
      resolvedPaymentUrl = getPaymentLink(paymentToken, req)
    }

    // If still no payment URL and invoiceId is present, attempt to retrieve linked payment token
    if (!resolvedPaymentUrl && invoiceId) {
      try {
        const adminDb = getAdminDb()
        const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(invoiceId).get()
        if (invSnap.exists) {
          const invData = invSnap.data()
          const token = invData?.paymentToken || invData?.clientLinkId || invData?.paymentLinkId
          if (token) {
            resolvedPaymentUrl = getPaymentLink(token, req)
          }
        }
      } catch (e) {
        console.warn('Could not lookup payment token for invoice:', e)
      }
    }

    const result = await sendInvoiceEmail({
      toEmail,
      clientName: clientName || 'Valued Client',
      invoiceNumber,
      dueDate,
      totalAmount: Number(totalAmount) || 0,
      balanceDue: Number(balanceDue) !== undefined ? Number(balanceDue) : Number(totalAmount) || 0,
      currencySymbol: currencySymbol || 'GH₵',
      paymentUrl: resolvedPaymentUrl,
      personalMessage,
      items,
      businessName,
      businessLogoUrl,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to dispatch email' },
        { status: 500 }
      )
    }

    // If invoiceId provided, update status to 'Sent' if currently Draft or Pending
    if (invoiceId) {
      try {
        const adminDb = getAdminDb()
        const invRef = adminDb.collection(COLLECTIONS.INVOICES).doc(invoiceId)
        const snap = await invRef.get()
        if (snap.exists) {
          const cur = snap.data()
          if (cur?.status === 'Draft' || cur?.status === 'Pending') {
            await invRef.update({
              status: 'Sent',
              lastSentAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          } else {
            await invRef.update({
              lastSentAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        }
      } catch (dbErr) {
        console.warn('Failed to update invoice status after sending email:', dbErr)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: `Invoice email successfully sent to ${toEmail}`,
    })
  } catch (error: any) {
    console.error('Invoice send email error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server error while sending invoice email' },
      { status: 500 }
    )
  }
}
