import { NextRequest, NextResponse } from 'next/server'
import { sendInvoiceEmail } from '@/lib/services/brevo'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getProductionUrl, getPaymentLink } from '@/lib/utils'
import { resolveExternalBrandingLogoUrl } from '@/lib/supabase/storage'

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

    let rawLogoCandidate =
      typeof businessLogoUrl === 'string' && !businessLogoUrl.trim().startsWith('/uploads/')
        ? businessLogoUrl.trim()
        : ''
    let storedLogoPath = ''

    try {
      const adminDb = getAdminDb()
      const [brandSnap, bizSnap] = await Promise.all([
        adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get(),
        adminDb.collection(COLLECTIONS.SETTINGS).doc('business').get(),
      ])
      const brandData = brandSnap.exists ? brandSnap.data() : null
      const bizData = bizSnap.exists ? bizSnap.data() : null

      storedLogoPath =
        (typeof brandData?.logoStoragePath === 'string' && brandData.logoStoragePath) ||
        (typeof bizData?.logoStoragePath === 'string' && bizData.logoStoragePath) ||
        ''

      if (!rawLogoCandidate) {
        const fromBrand = brandData?.logoUrl
        const fromBiz = bizData?.logoURL
        rawLogoCandidate =
          (typeof fromBrand === 'string' && !fromBrand.startsWith('/uploads/') && fromBrand) ||
          (typeof fromBiz === 'string' && !fromBiz.startsWith('/uploads/') && fromBiz) ||
          ''
      }
    } catch {
      // Ignore fallback lookup errors when Admin credentials are unset locally
    }

    const fallbackAbsoluteLogo = rawLogoCandidate
      ? getProductionUrl(rawLogoCandidate, req)
      : ''
    const cleanLogoUrl = await resolveExternalBrandingLogoUrl(
      rawLogoCandidate,
      storedLogoPath,
      fallbackAbsoluteLogo
    )

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
      businessLogoUrl: cleanLogoUrl || undefined,
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
