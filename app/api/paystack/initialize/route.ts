import { NextRequest, NextResponse } from 'next/server'
import { getAppBaseUrl, buildPaymentCallbackUrl, getProductionUrl } from '@/lib/utils'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, email: frontendEmail, amount: frontendAmount, invoiceNumber: frontendInvNum, clientName: frontendClientName, callbackPath } = body

    const adminDb = getAdminDb()
    let serverAmount = 0
    let serverEmail = frontendEmail || 'client@lexmedia.com'
    let serverClientName = frontendClientName || 'Valued Client'
    let serverInvoiceNumber = frontendInvNum || ''
    let serverDeliveryAccessToken = ''
    let serverDeliveryId = ''
    let serverInvoiceId = ''
    let serverQuickJobId = ''
    let serverProjectId = ''
    let serverClientId = ''

    // ─── Resolve Server-Truth Financial Data ──────────────────────────
    if (token) {
      // 1. Try finding in client links
      const linkSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS).where('token', '==', token).limit(1).get()
      if (!linkSnap.empty) {
        const linkData = linkSnap.docs[0].data()
        serverClientId = linkData.clientId || ''
        serverClientName = linkData.clientName || serverClientName
        serverEmail = linkData.clientEmail || serverEmail
        serverInvoiceId = linkData.invoiceId || ''
        serverQuickJobId = linkData.quickJobId || ''
        serverProjectId = linkData.projectId || ''
        serverDeliveryId = linkData.deliveryId || ''
        serverDeliveryAccessToken = linkData.deliveryAccessToken || ''
        serverAmount = Number(linkData.amount || 0)

        // Verify balance against actual invoice
        if (serverInvoiceId) {
          const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(serverInvoiceId).get()
          if (invDoc.exists) {
            const invData = invDoc.data()!
            const total = Number(invData.total || invData.totalAmount || 0)
            const paid = Number(invData.amountPaid || 0)
            const balance = Number(invData.balanceDue !== undefined ? invData.balanceDue : (total - paid))
            serverAmount = Math.max(0, balance)
            serverInvoiceNumber = invData.invoiceNumber || serverInvoiceNumber
          }
        } else if (serverQuickJobId) {
          const qjDoc = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(serverQuickJobId).get()
          if (qjDoc.exists) {
            const qjData = qjDoc.data()!
            const total = Number(qjData.originalAgreedPrice || qjData.amount || 0)
            const paid = Number(qjData.amountPaid || 0)
            const balance = Number(qjData.outstandingBalance !== undefined ? qjData.outstandingBalance : (total - paid))
            serverAmount = Math.max(0, balance)
            serverInvoiceNumber = qjData.jobCode || qjData.title || serverInvoiceNumber
          }
        } else if (serverProjectId) {
          const projDoc = await adminDb.collection(COLLECTIONS.PROJECTS).doc(serverProjectId).get()
          if (projDoc.exists) {
            const projData = projDoc.data()!
            const total = Number(projData.price || projData.totalAmount || 0)
            const paid = Number(projData.amountPaid || 0)
            const balance = Number(projData.outstandingBalance !== undefined ? projData.outstandingBalance : (total - paid))
            serverAmount = Math.max(0, balance)
          }
        }
      } else {
        // 2. Try checking if token is a delivery accessToken
        const deliverySnap = await adminDb.collection(COLLECTIONS.DELIVERIES).where('accessToken', '==', token).limit(1).get()
        if (!deliverySnap.empty) {
          const dData = deliverySnap.docs[0].data()
          serverDeliveryId = deliverySnap.docs[0].id
          serverDeliveryAccessToken = dData.accessToken || token
          serverInvoiceId = dData.invoiceId || ''
          serverQuickJobId = dData.quickJobId || ''
          serverProjectId = dData.projectId || ''
          serverClientId = dData.clientId || ''
          serverClientName = dData.clientName || serverClientName
          serverEmail = dData.clientEmail || serverEmail

          if (serverInvoiceId) {
            const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(serverInvoiceId).get()
            if (invDoc.exists) {
              const invData = invDoc.data()!
              const total = Number(invData.total || invData.totalAmount || 0)
              const paid = Number(invData.amountPaid || 0)
              const balance = Number(invData.balanceDue !== undefined ? invData.balanceDue : (total - paid))
              serverAmount = Math.max(0, balance)
              serverInvoiceNumber = invData.invoiceNumber || serverInvoiceNumber
            }
          } else if (serverQuickJobId) {
            const qjDoc = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(serverQuickJobId).get()
            if (qjDoc.exists) {
              const qjData = qjDoc.data()!
              const total = Number(qjData.originalAgreedPrice || qjData.amount || 0)
              const paid = Number(qjData.amountPaid || 0)
              const balance = Number(qjData.outstandingBalance !== undefined ? qjData.outstandingBalance : (total - paid))
              serverAmount = Math.max(0, balance)
              serverInvoiceNumber = qjData.jobCode || qjData.title || serverInvoiceNumber
            }
          }
        }
      }
    }

    // Fall back to frontendAmount only if server calculation was unable to find records, but ensure > 0
    const finalAmount = serverAmount > 0 ? serverAmount : Number(frontendAmount || 0)

    if (finalAmount <= 0) {
      return NextResponse.json({
        error: 'This invoice or deliverable is already fully paid or has no outstanding balance.',
        isAlreadyPaid: true,
        deliveryAccessToken: serverDeliveryAccessToken || null,
      }, { status: 400 })
    }

    const amountInSubunits = Math.round(finalAmount * 100)
    const reference = `LXM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    let callbackUrl: string
    if (callbackPath) {
      const baseAppUrl = getAppBaseUrl(req)
      const cleanPrefix = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`
      const raw = `${baseAppUrl}${cleanPrefix}${token ? encodeURIComponent(token) : ''}?reference=${reference}&token=${token || ''}`
      callbackUrl = getProductionUrl(raw, req)
    } else {
      callbackUrl = buildPaymentCallbackUrl(reference, token, req)
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY
    if (!paystackSecret || paystackSecret.includes('xxxxxxxx') || paystackSecret.includes('placeholder')) {
      // Allow testing without variables before Vercel environment variables are populated
      console.log(`[Paystack Init - Sandbox Mode] Continuing without PAYSTACK_SECRET_KEY for testing.`)
      const simulatedUrl = callbackUrl.includes('?')
        ? `${callbackUrl}&sandbox=true`
        : `${callbackUrl}?reference=${reference}&token=${token || ''}&sandbox=true`
      return NextResponse.json({
        status: true,
        message: 'Sandbox redirect (Configure PAYSTACK_SECRET_KEY in Vercel for live processing)',
        authorization_url: simulatedUrl,
        reference,
        amount: finalAmount,
      })
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: serverEmail,
        amount: amountInSubunits,
        reference,
        callback_url: callbackUrl,
        metadata: {
          token: token || null,
          deliveryAccessToken: serverDeliveryAccessToken || null,
          deliveryId: serverDeliveryId || null,
          invoiceId: serverInvoiceId || null,
          quickJobId: serverQuickJobId || null,
          projectId: serverProjectId || null,
          clientId: serverClientId || null,
          invoiceNumber: serverInvoiceNumber || null,
          clientName: serverClientName || null,
          custom_fields: [
            {
              display_name: 'Invoice Number',
              variable_name: 'invoice_number',
              value: serverInvoiceNumber || 'N/A',
            },
          ],
        },
      }),
    })

    const data = await response.json()

    if (!response.ok || !data.status) {
      throw new Error(data.message || 'Paystack API initialization failed')
    }

    if (data.status && data.data?.authorization_url) {
      return NextResponse.json({
        status: true,
        authorization_url: data.data.authorization_url,
        reference,
        access_code: data.data.access_code,
        amount: finalAmount,
      })
    }

    throw new Error('Failed to get authorization URL from Paystack')
  } catch (error: any) {
    console.error('Paystack initialization error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize Paystack payment' },
      { status: 500 }
    )
  }
}
