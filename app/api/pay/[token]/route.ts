import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token
    if (!rawToken) {
      return NextResponse.json({ error: 'Missing payment token' }, { status: 400 })
    }

    const token = decodeURIComponent(rawToken).trim()

    let linkData: any = null
    let linkDocId = ''
    let invoiceData: any = null

    // 1. Try querying clientLinks via Admin DB if available
    try {
      const adminDb = getAdminDb()
      const linksSnap = await adminDb
        .collection(COLLECTIONS.CLIENT_LINKS)
        .where('token', '==', token)
        .limit(1)
        .get()

      if (!linksSnap.empty) {
        linkData = linksSnap.docs[0].data()
        linkDocId = linksSnap.docs[0].id
      } else {
        // Try doc ID lookup
        const docSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS).doc(token).get()
        if (docSnap.exists) {
          linkData = docSnap.data()
          linkDocId = docSnap.id
        } else {
          // Check invoices by paymentLinkToken or invoiceNumber
          const invByToken = await adminDb.collection(COLLECTIONS.INVOICES).where('paymentLinkToken', '==', token).limit(1).get()
          if (!invByToken.empty) {
            const inv = invByToken.docs[0].data()
            invoiceData = { id: invByToken.docs[0].id, ...inv }
            linkData = {
              token,
              amount: inv.balanceDue !== undefined ? inv.balanceDue : inv.total,
              currency: inv.currency || 'GHS',
              clientName: inv.clientName || '',
              projectName: inv.projectName || '',
              invoiceNumber: inv.invoiceNumber || '',
              title: `Invoice ${inv.invoiceNumber || ''} Payment`,
              status: inv.status === 'Paid' ? 'Paid' : 'Pending Payment',
              invoiceId: invByToken.docs[0].id,
            }
            linkDocId = invByToken.docs[0].id
          } else {
            const invByNum = await adminDb.collection(COLLECTIONS.INVOICES).where('invoiceNumber', '==', token).limit(1).get()
            if (!invByNum.empty) {
              const inv = invByNum.docs[0].data()
              invoiceData = { id: invByNum.docs[0].id, ...inv }
              linkData = {
                token: inv.paymentLinkToken || token,
                amount: inv.balanceDue !== undefined ? inv.balanceDue : inv.total,
                currency: inv.currency || 'GHS',
                clientName: inv.clientName || '',
                projectName: inv.projectName || '',
                invoiceNumber: inv.invoiceNumber || '',
                title: `Invoice ${inv.invoiceNumber || ''} Payment`,
                status: inv.status === 'Paid' ? 'Paid' : 'Pending Payment',
                invoiceId: invByNum.docs[0].id,
              }
              linkDocId = invByNum.docs[0].id
            } else {
              // Check Quick Jobs by paymentToken or doc id
              const qjByToken = await adminDb.collection(COLLECTIONS.QUICK_JOBS).where('paymentToken', '==', token).limit(1).get()
              if (!qjByToken.empty) {
                const qj = qjByToken.docs[0].data()
                linkData = {
                  token,
                  amount: qj.outstandingBalance !== undefined ? qj.outstandingBalance : (qj.originalAgreedPrice || 0),
                  currency: qj.currency || 'GHS',
                  clientName: qj.clientName || '',
                  projectName: qj.jobDescription || '',
                  invoiceNumber: '',
                  title: `Payment for Quick Job: ${qj.jobDescription || ''}`,
                  status: (qj.paymentStatus === 'Paid' || (qj.outstandingBalance !== undefined && qj.outstandingBalance <= 0)) ? 'Paid' : (qj.paymentStatus || 'Pending Payment'),
                  paymentStatus: qj.paymentStatus || 'Pending Payment',
                  quickJobId: qjByToken.docs[0].id,
                }
                linkDocId = qjByToken.docs[0].id
              } else {
                const qjDoc = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(token).get()
                if (qjDoc.exists) {
                  const qj = qjDoc.data()!
                  linkData = {
                    token: qj.paymentToken || token,
                    amount: qj.outstandingBalance !== undefined ? qj.outstandingBalance : (qj.originalAgreedPrice || 0),
                    currency: qj.currency || 'GHS',
                    clientName: qj.clientName || '',
                    projectName: qj.jobDescription || '',
                    invoiceNumber: '',
                    title: `Payment for Quick Job: ${qj.jobDescription || ''}`,
                    status: (qj.paymentStatus === 'Paid' || (qj.outstandingBalance !== undefined && qj.outstandingBalance <= 0)) ? 'Paid' : (qj.paymentStatus || 'Pending Payment'),
                    paymentStatus: qj.paymentStatus || 'Pending Payment',
                    quickJobId: qjDoc.id,
                  }
                  linkDocId = qjDoc.id
                }
              }
            }
          }
        }
      }

      if (linkData?.invoiceId) {
        const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(linkData.invoiceId).get()
        if (invSnap.exists) {
          invoiceData = { id: invSnap.id, ...invSnap.data() }
        }
      }
    } catch {
      // Admin DB not configured; will fallback to client SDK
    }

    // 2. Fallback to client Firestore SDK
    if (!linkData) {
      const linksRef = collection(db, COLLECTIONS.CLIENT_LINKS)
      // Check where token == token
      const q = query(linksRef, where('token', '==', token))
      const snap = await getDocs(q)

      if (!snap.empty) {
        linkData = snap.docs[0].data()
        linkDocId = snap.docs[0].id
      } else {
        // Check by doc id
        try {
          const docRef = doc(db, COLLECTIONS.CLIENT_LINKS, token)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            linkData = docSnap.data()
            linkDocId = docSnap.id
          }
        } catch {}
      }

      // Check invoice if available
      if (linkData?.invoiceId) {
        try {
          const invRef = doc(db, COLLECTIONS.INVOICES, linkData.invoiceId)
          const invSnap = await getDoc(invRef)
          if (invSnap.exists()) {
            invoiceData = { id: invSnap.id, ...invSnap.data() }
          }
        } catch {}
      }
    }

    // 3. Fallback: check invoices directly by token, invoiceNumber, or doc ID
    if (!linkData) {
      try {
        const invRef = collection(db, COLLECTIONS.INVOICES)
        let invSnap = await getDocs(query(invRef, where('paymentLinkToken', '==', token)))
        if (invSnap.empty) {
          invSnap = await getDocs(query(invRef, where('invoiceNumber', '==', token)))
        }
        if (invSnap.empty) {
          try {
            const singleDoc = await getDoc(doc(db, COLLECTIONS.INVOICES, token))
            if (singleDoc.exists()) {
              const inv = singleDoc.data()
              invoiceData = { id: singleDoc.id, ...inv }
              linkData = {
                token: inv.paymentLinkToken || singleDoc.id,
                amount: inv.balanceDue !== undefined ? inv.balanceDue : inv.total,
                currency: inv.currency || 'GHS',
                clientName: inv.clientName || '',
                projectName: inv.projectName || '',
                invoiceNumber: inv.invoiceNumber || '',
                title: `Invoice ${inv.invoiceNumber || ''} Payment`,
                status: inv.status === 'Paid' ? 'Paid' : 'Pending Payment',
                invoiceId: singleDoc.id,
              }
              linkDocId = singleDoc.id
            }
          } catch {}
        } else {
          const inv = invSnap.docs[0].data()
          invoiceData = { id: invSnap.docs[0].id, ...inv }
          linkData = {
            token: inv.paymentLinkToken || token,
            amount: inv.balanceDue !== undefined ? inv.balanceDue : inv.total,
            currency: inv.currency || 'GHS',
            clientName: inv.clientName || '',
            projectName: inv.projectName || '',
            invoiceNumber: inv.invoiceNumber || '',
            title: `Invoice ${inv.invoiceNumber || ''} Payment`,
            status: inv.status === 'Paid' ? 'Paid' : 'Pending Payment',
            invoiceId: invSnap.docs[0].id,
          }
          linkDocId = invSnap.docs[0].id
        }
      } catch {}
    }

    if (!linkData) {
      return NextResponse.json(
        { error: 'Payment link not found or invalid' },
        { status: 404 }
      )
    }

    const isAlreadyPaid =
      linkData.status === 'Paid' ||
      linkData.paymentStatus === 'Paid' ||
      invoiceData?.status === 'Paid'

    let deliveryAccessToken: string | null = null
    try {
      const adminDb = getAdminDb()
      if (linkData.quickJobId) {
        const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(linkData.quickJobId).get()
        if (qjSnap.exists) {
          deliveryAccessToken = qjSnap.data()?.deliveryAccessToken || null
        }
      } else if (linkData.invoiceId) {
        const delSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).where('invoiceId', '==', linkData.invoiceId).limit(1).get()
        if (!delSnap.empty) {
          deliveryAccessToken = delSnap.docs[0].data()?.accessToken || null
        }
      }
    } catch {}

    return NextResponse.json({
      success: true,
      link: {
        id: linkDocId,
        token: linkData.token || linkDocId,
        amount: Number(linkData.amount || invoiceData?.balanceDue || invoiceData?.total || 0),
        currency: linkData.currency || invoiceData?.currency || 'GHS',
        title:
          linkData.title ||
          (invoiceData?.invoiceNumber
            ? `Invoice ${invoiceData.invoiceNumber} Payment`
            : `Payment from ${linkData.clientName || 'Client'}`),
        clientName: linkData.clientName || invoiceData?.clientName || 'Client',
        projectName: linkData.projectName || invoiceData?.projectName || '',
        invoiceNumber: linkData.invoiceNumber || invoiceData?.invoiceNumber || '',
        status: isAlreadyPaid ? 'Paid' : (linkData.status || 'Pending Payment'),
        paymentStatus: isAlreadyPaid ? 'Paid' : (linkData.paymentStatus || 'Pending Payment'),
        notes: linkData.notes || '',
        invoiceId: linkData.invoiceId || null,
        quickJobId: linkData.quickJobId || null,
      },
      invoice: invoiceData
        ? {
            id: invoiceData.id,
            invoiceNumber: invoiceData.invoiceNumber,
            status: invoiceData.status,
            total: invoiceData.total,
            balanceDue: invoiceData.balanceDue,
          }
        : null,
      isAlreadyPaid,
      deliveryAccessToken,
    })
  } catch (error: any) {
    console.error('[Payment API] Token lookup error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve payment information' },
      { status: 500 }
    )
  }
}
