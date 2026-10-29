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
    let serverPaymentRequestId = ''

    // ─── Resolve Server-Truth Financial Data ──────────────────────────
    if (token) {
      // 1. Try finding in client links
      const linkSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS).where('token', '==', token).limit(1).get()
      if (!linkSnap.empty) {
        const linkDoc = linkSnap.docs[0]
        const linkData = linkDoc.data()
        serverPaymentRequestId = linkDoc.id

        // Check if payment link is already paid
        if (linkData.status === 'Paid' || linkData.paymentStatus === 'Paid') {
          return NextResponse.json(
            { error: 'This payment request has already been paid and verified.', isAlreadyPaid: true },
            { status: 400 }
          )
        }
        if (linkData.status === 'Cancelled' || linkData.status === 'disabled') {
          return NextResponse.json(
            { error: 'This payment request has been cancelled or disabled.' },
            { status: 400 }
          )
        }
        if (linkData.expiresAt) {
          const expTime = typeof linkData.expiresAt.toDate === 'function'
            ? linkData.expiresAt.toDate().getTime()
            : new Date(linkData.expiresAt).getTime()
          if (expTime > 0 && expTime < Date.now()) {
            return NextResponse.json({ error: 'This payment request link has expired.' }, { status: 400 })
          }
        }

        serverClientId = linkData.clientId || ''
        serverClientName = linkData.clientName || serverClientName
        serverEmail = linkData.clientEmail || serverEmail
        serverInvoiceId = linkData.invoiceId || ''
        serverQuickJobId = linkData.quickJobId || ''
        serverProjectId = linkData.projectId || ''
        serverDeliveryId = linkData.deliveryId || ''
        serverDeliveryAccessToken = linkData.deliveryAccessToken || ''
        const savedRequestAmount = Number(linkData.amount || 0)

        // Verify balance against actual Quick Job
        if (serverQuickJobId) {
          const qjDoc = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(serverQuickJobId).get()
          if (!qjDoc.exists) {
            return NextResponse.json({ error: 'Associated Quick Job not found.' }, { status: 404 })
          }
          const qjData = qjDoc.data()!
          const jobTotal = Number(qjData.originalAgreedPrice || qjData.amount || 0)

          // Calculate trusted verified payments from payments collection (including offline/manual payments)
          const paymentsSnap = await adminDb
            .collection(COLLECTIONS.PAYMENTS)
            .where('quickJobId', '==', serverQuickJobId)
            .where('status', '==', 'success')
            .get()
          const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
          const trustedPaid = Math.max(verifiedPaymentsSum, Number(qjData.amountPaid || 0))
          const trustedOutstanding = Math.max(0, jobTotal - trustedPaid)

          if (trustedOutstanding <= 0) {
            return NextResponse.json({
              error: 'This Quick Job has already been fully paid.',
              isAlreadyPaid: true,
              deliveryAccessToken: qjData.deliveryAccessToken || null,
            }, { status: 400 })
          }

          // Use the saved payment-request amount
          const targetAmount = savedRequestAmount > 0 ? savedRequestAmount : trustedOutstanding

          if (targetAmount <= 0) {
            return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
          }

          if (targetAmount > trustedOutstanding) {
            return NextResponse.json({
              error: `Payment amount (GH₵${targetAmount.toFixed(2)}) exceeds current outstanding balance (GH₵${trustedOutstanding.toFixed(2)}).`,
            }, { status: 400 })
          }

          serverAmount = targetAmount
          serverInvoiceNumber = qjData.jobCode || qjData.title || `QJ-${serverQuickJobId.slice(0, 8).toUpperCase()}`
          serverDeliveryAccessToken = qjData.deliveryAccessToken || ''
        } else if (serverInvoiceId) {
          // Verify balance against actual invoice
          const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(serverInvoiceId).get()
          if (invDoc.exists) {
            const invData = invDoc.data()!
            const total = Number(invData.total || invData.totalAmount || 0)

            const paymentsSnap = await adminDb
              .collection(COLLECTIONS.PAYMENTS)
              .where('invoiceId', '==', serverInvoiceId)
              .where('status', '==', 'success')
              .get()
            const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
            const trustedPaid = Math.max(verifiedPaymentsSum, Number(invData.amountPaid || 0))
            const balance = Math.max(0, total - trustedPaid)

            if (balance <= 0) {
              return NextResponse.json({
                error: 'This invoice is already fully paid.',
                isAlreadyPaid: true,
              }, { status: 400 })
            }

            const targetAmount = savedRequestAmount > 0 ? Math.min(savedRequestAmount, balance) : balance
            if (targetAmount <= 0) {
              return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
            }
            if (savedRequestAmount > balance) {
              return NextResponse.json({
                error: `Payment amount exceeds current invoice balance of GH₵${balance.toFixed(2)}.`,
              }, { status: 400 })
            }
            serverAmount = targetAmount
            serverInvoiceNumber = invData.invoiceNumber || serverInvoiceNumber
          }
        } else if (serverProjectId) {
          const projDoc = await adminDb.collection(COLLECTIONS.PROJECTS).doc(serverProjectId).get()
          if (projDoc.exists) {
            const projData = projDoc.data()!
            const total = Number(projData.price || projData.totalAmount || 0)

            const paymentsSnap = await adminDb
              .collection(COLLECTIONS.PAYMENTS)
              .where('projectId', '==', serverProjectId)
              .where('status', '==', 'success')
              .get()
            const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
            const trustedPaid = Math.max(verifiedPaymentsSum, Number(projData.amountPaid || 0))
            const balance = Math.max(0, total - trustedPaid)

            if (balance <= 0) {
              return NextResponse.json({
                error: 'This project is already fully paid.',
                isAlreadyPaid: true,
              }, { status: 400 })
            }

            const targetAmount = savedRequestAmount > 0 ? savedRequestAmount : balance
            if (targetAmount <= 0) {
              return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
            }
            if (targetAmount > balance) {
              return NextResponse.json({
                error: `Payment amount (GH₵${targetAmount.toFixed(2)}) exceeds current project outstanding balance of GH₵${balance.toFixed(2)}.`,
              }, { status: 400 })
            }
            serverAmount = targetAmount
            serverInvoiceNumber = projData.reference || `PROJ-${serverProjectId.slice(0, 8).toUpperCase()}`
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

          if (serverQuickJobId) {
            const qjDoc = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(serverQuickJobId).get()
            if (qjDoc.exists) {
              const qjData = qjDoc.data()!
              const total = Number(qjData.originalAgreedPrice || qjData.amount || 0)
              const paymentsSnap = await adminDb
                .collection(COLLECTIONS.PAYMENTS)
                .where('quickJobId', '==', serverQuickJobId)
                .where('status', '==', 'success')
                .get()
              const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
              const trustedPaid = Math.max(verifiedPaymentsSum, Number(qjData.amountPaid || 0))
              const balance = Math.max(0, total - trustedPaid)
              serverAmount = balance
              serverInvoiceNumber = qjData.jobCode || qjData.title || serverInvoiceNumber
            }
          } else if (serverInvoiceId) {
            const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(serverInvoiceId).get()
            if (invDoc.exists) {
              const invData = invDoc.data()!
              const total = Number(invData.total || invData.totalAmount || 0)
              const paymentsSnap = await adminDb
                .collection(COLLECTIONS.PAYMENTS)
                .where('invoiceId', '==', serverInvoiceId)
                .where('status', '==', 'success')
                .get()
              const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
              const trustedPaid = Math.max(verifiedPaymentsSum, Number(invData.amountPaid || 0))
              const balance = Math.max(0, total - trustedPaid)
              serverAmount = balance
              serverInvoiceNumber = invData.invoiceNumber || serverInvoiceNumber
            }
          }
        } else {
          // 3. Try checking quickJobs directly by paymentToken or doc id
          const qjByToken = await adminDb.collection(COLLECTIONS.QUICK_JOBS).where('paymentToken', '==', token).limit(1).get()
          let matchedQjDoc: any = null
          if (!qjByToken.empty) {
            matchedQjDoc = qjByToken.docs[0]
          } else {
            const docById = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(token).get()
            if (docById.exists) matchedQjDoc = docById
          }

          if (matchedQjDoc) {
            const qjData = matchedQjDoc.data()
            serverQuickJobId = matchedQjDoc.id
            serverClientId = qjData.clientId || ''
            serverClientName = qjData.clientName || serverClientName
            serverEmail = qjData.clientEmail || serverEmail
            const total = Number(qjData.originalAgreedPrice || qjData.amount || 0)
            const paymentsSnap = await adminDb
              .collection(COLLECTIONS.PAYMENTS)
              .where('quickJobId', '==', serverQuickJobId)
              .where('status', '==', 'success')
              .get()
            const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
            const trustedPaid = Math.max(verifiedPaymentsSum, Number(qjData.amountPaid || 0))
            const balance = Math.max(0, total - trustedPaid)

            if (balance <= 0) {
              return NextResponse.json({
                error: 'This Quick Job has already been fully paid.',
                isAlreadyPaid: true,
                deliveryAccessToken: qjData.deliveryAccessToken || null,
              }, { status: 400 })
            }

            // Check if there is an associated ClientLink for this token
            const matchedLink = await adminDb.collection(COLLECTIONS.CLIENT_LINKS)
              .where('token', '==', token)
              .limit(1)
              .get()
            let reqAmount = balance
            if (!matchedLink.empty) {
              const mlData = matchedLink.docs[0].data()
              if (mlData.status === 'Paid') {
                return NextResponse.json({ error: 'This payment request has already been paid.', isAlreadyPaid: true }, { status: 400 })
              }
              if (mlData.amount && Number(mlData.amount) > 0) {
                reqAmount = Number(mlData.amount)
              }
            }

            if (reqAmount <= 0) {
              return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
            }
            if (reqAmount > balance) {
              return NextResponse.json({ error: `Payment amount exceeds outstanding balance of GH₵${balance.toFixed(2)}` }, { status: 400 })
            }

            serverAmount = reqAmount
            serverDeliveryAccessToken = qjData.deliveryAccessToken || ''
            serverInvoiceNumber = qjData.jobCode || qjData.title || `QJ-${serverQuickJobId.slice(0, 8).toUpperCase()}`
          } else {
            // 4. Try checking invoices directly by paymentLinkToken or invoiceNumber
            const invByToken = await adminDb.collection(COLLECTIONS.INVOICES).where('paymentLinkToken', '==', token).limit(1).get()
            if (!invByToken.empty) {
              const invData = invByToken.docs[0].data()
              serverInvoiceId = invByToken.docs[0].id
              serverClientId = invData.clientId || ''
              serverClientName = invData.clientName || serverClientName
              serverEmail = invData.clientEmail || serverEmail
              serverInvoiceNumber = invData.invoiceNumber || serverInvoiceNumber
              const total = Number(invData.total || invData.totalAmount || 0)
              const paymentsSnap = await adminDb
                .collection(COLLECTIONS.PAYMENTS)
                .where('invoiceId', '==', serverInvoiceId)
                .where('status', '==', 'success')
                .get()
              const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
              const trustedPaid = Math.max(verifiedPaymentsSum, Number(invData.amountPaid || 0))
              serverAmount = Math.max(0, total - trustedPaid)
            } else {
              // 5. Try checking projects directly by doc id
              const projDoc = await adminDb.collection(COLLECTIONS.PROJECTS).doc(token).get()
              if (projDoc.exists) {
                const projData = projDoc.data()!
                serverProjectId = projDoc.id
                serverClientId = projData.clientId || ''
                serverClientName = projData.clientName || serverClientName
                serverEmail = projData.clientEmail || serverEmail
                serverInvoiceNumber = projData.reference || `PROJ-${serverProjectId.slice(0, 8).toUpperCase()}`
                const total = Number(projData.price || projData.totalAmount || 0)
                const paymentsSnap = await adminDb
                  .collection(COLLECTIONS.PAYMENTS)
                  .where('projectId', '==', serverProjectId)
                  .where('status', '==', 'success')
                  .get()
                const verifiedPaymentsSum = paymentsSnap.docs.reduce((sum, doc) => sum + (Number(doc.data().amount) || 0), 0)
                const trustedPaid = Math.max(verifiedPaymentsSum, Number(projData.amountPaid || 0))
                serverAmount = Math.max(0, total - trustedPaid)
              }
            }
          }
        }
      }
    }

    // Server-calculated trusted amount (do not trust user-modified frontend body)
    const finalAmount = serverAmount

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
          paymentRequestId: serverPaymentRequestId || null,
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
