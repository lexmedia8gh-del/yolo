import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db, isFirebaseConfigured } from '@/lib/firebase/config'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'

export const dynamic = 'force-dynamic'

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
    let quickJobData: any = null
    let projectData: any = null

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
                } else {
                  // Check Projects by doc id
                  const projDoc = await adminDb.collection(COLLECTIONS.PROJECTS).doc(token).get()
                  if (projDoc.exists) {
                    const proj = projDoc.data()!
                    projectData = { id: projDoc.id, ...proj }
                    linkData = {
                      token,
                      amount: proj.outstandingBalance !== undefined ? proj.outstandingBalance : (proj.price || 0),
                      currency: proj.currency || 'GHS',
                      clientName: proj.clientName || '',
                      projectName: proj.name || '',
                      invoiceNumber: '',
                      title: `Payment for Project: ${proj.name || ''}`,
                      status: (proj.paymentStatus === 'Paid' || (proj.outstandingBalance !== undefined && proj.outstandingBalance <= 0)) ? 'Paid' : (proj.paymentStatus || 'Pending Payment'),
                      paymentStatus: proj.paymentStatus || 'Pending Payment',
                      projectId: projDoc.id,
                    }
                    linkDocId = projDoc.id
                  }
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

      if (linkData?.quickJobId) {
        const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(linkData.quickJobId).get()
        if (qjSnap.exists) {
          quickJobData = { id: qjSnap.id, ...qjSnap.data() }
        }
      }

      if (linkData?.projectId) {
        const projSnap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(linkData.projectId).get()
        if (projSnap.exists) {
          projectData = { id: projSnap.id, ...projSnap.data() }
        }
      }
    } catch {
      // Admin DB not configured; will fallback to client SDK
    }

    // 2. Fallback to client Firestore SDK
    if (!linkData && isFirebaseConfigured) {
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

      // Check quickJob if available
      if (linkData?.quickJobId) {
        try {
          const qjRef = doc(db, COLLECTIONS.QUICK_JOBS, linkData.quickJobId)
          const qjSnap = await getDoc(qjRef)
          if (qjSnap.exists()) {
            quickJobData = { id: qjSnap.id, ...qjSnap.data() }
          }
        } catch {}
      }

      // Check project if available
      if (linkData?.projectId) {
        try {
          const projRef = doc(db, COLLECTIONS.PROJECTS, linkData.projectId)
          const projSnap = await getDoc(projRef)
          if (projSnap.exists()) {
            projectData = { id: projSnap.id, ...projSnap.data() }
          }
        } catch {}
      }
    }

    // 3. Fallback: check invoices directly by token, invoiceNumber, or doc ID
    if (!linkData && isFirebaseConfigured) {
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

    // 4. Fallback: check projects directly by doc ID
    if (!linkData && isFirebaseConfigured) {
      try {
        const projRef = doc(db, COLLECTIONS.PROJECTS, token)
        const projSnap = await getDoc(projRef)
        if (projSnap.exists()) {
          const proj = projSnap.data()!
          projectData = { id: projSnap.id, ...proj }
          linkData = {
            token,
            amount: proj.outstandingBalance !== undefined ? proj.outstandingBalance : (proj.price || 0),
            currency: proj.currency || 'GHS',
            clientName: proj.clientName || '',
            projectName: proj.name || '',
            invoiceNumber: '',
            title: `Payment for Project: ${proj.name || ''}`,
            status: (proj.paymentStatus === 'Paid' || (proj.outstandingBalance !== undefined && proj.outstandingBalance <= 0)) ? 'Paid' : (proj.paymentStatus || 'Pending Payment'),
            paymentStatus: proj.paymentStatus || 'Pending Payment',
            projectId: projSnap.id,
          }
          linkDocId = projSnap.id
        }
      } catch {}
    }

    if (!linkData) {
      return NextResponse.json(
        { error: 'Payment link not found or invalid' },
        { status: 404 }
      )
    }

    const isCancelled = linkData.status === 'Cancelled'
    let isExpired = false
    if (linkData.expiresAt) {
      const expDate = linkData.expiresAt?.toDate ? linkData.expiresAt.toDate() : new Date(linkData.expiresAt)
      if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
        isExpired = true
      }
    }

    const isAlreadyPaid =
      linkData.status === 'Paid' ||
      linkData.paymentStatus === 'Paid' ||
      invoiceData?.status === 'Paid' ||
      (projectData && (projectData.paymentStatus === 'Paid' || (projectData.outstandingBalance !== undefined && projectData.outstandingBalance <= 0))) ||
      (quickJobData && (quickJobData.paymentStatus === 'Paid' || (quickJobData.outstandingBalance !== undefined && quickJobData.outstandingBalance <= 0)))

    let deliveryAccessToken: string | null = null
    let lastPayment: {
      reference: string
      receiptNumber: string
      amount: number
      currency: string
      paidAt: string | null
      channel: string
    } | null = null

    try {
      const adminDb = getAdminDb()

      // Resolve associated delivery only when permitted (fully paid or requiresFullPayment === false or already released)
      let delDocData: any = null
      if (linkData.quickJobId) {
        const delSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).where('quickJobId', '==', linkData.quickJobId).limit(1).get()
        if (!delSnap.empty) delDocData = delSnap.docs[0].data()
      }
      if (!delDocData && linkData.invoiceId) {
        const delSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).where('invoiceId', '==', linkData.invoiceId).limit(1).get()
        if (!delSnap.empty) delDocData = delSnap.docs[0].data()
      }
      if (!delDocData && linkData.projectId) {
        const delSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).where('projectId', '==', linkData.projectId).limit(1).get()
        if (!delSnap.empty) delDocData = delSnap.docs[0].data()
      }

      const isFullySettled = invoiceData
        ? invoiceData.status === 'Paid' || Number(invoiceData.balanceDue ?? 1) <= 0.01
        : projectData
        ? projectData.paymentStatus === 'Paid' || Number(projectData.outstandingBalance ?? 1) <= 0.01
        : quickJobData
        ? quickJobData.paymentStatus === 'Paid' || Number(quickJobData.outstandingBalance ?? 1) <= 0.01
        : isAlreadyPaid

      if (delDocData) {
        const requiresFull = delDocData.requiresFullPayment !== false
        const permitted = Boolean(isFullySettled || delDocData.isReleased || !requiresFull)
        if (permitted && delDocData.accessToken) {
          deliveryAccessToken = delDocData.accessToken
        }
      } else if (isFullySettled && quickJobData?.deliveryAccessToken) {
        deliveryAccessToken = quickJobData.deliveryAccessToken
      }

      // Resolve latest verified payment record for receipt display
      let pSnap: FirebaseFirestore.QuerySnapshot | null = null
      if (linkData.paystackReference) {
        pSnap = await adminDb
          .collection(COLLECTIONS.PAYMENTS)
          .where('paystackReference', '==', linkData.paystackReference)
          .limit(1)
          .get()
      }
      if ((!pSnap || pSnap.empty) && linkData.invoiceId) {
        pSnap = await adminDb
          .collection(COLLECTIONS.PAYMENTS)
          .where('invoiceId', '==', linkData.invoiceId)
          .where('status', '==', 'success')
          .limit(5)
          .get()
      } else if ((!pSnap || pSnap.empty) && linkData.projectId) {
        pSnap = await adminDb
          .collection(COLLECTIONS.PAYMENTS)
          .where('projectId', '==', linkData.projectId)
          .where('status', '==', 'success')
          .limit(5)
          .get()
      } else if ((!pSnap || pSnap.empty) && linkData.quickJobId) {
        pSnap = await adminDb
          .collection(COLLECTIONS.PAYMENTS)
          .where('quickJobId', '==', linkData.quickJobId)
          .where('status', '==', 'success')
          .limit(5)
          .get()
      }

      if (pSnap && !pSnap.empty) {
        const sortedDocs = [...pSnap.docs].sort((a, b) => {
          const aTime = new Date(a.data().paidAt || 0).getTime() || 0
          const bTime = new Date(b.data().paidAt || 0).getTime() || 0
          return bTime - aTime
        })
        const p = sortedDocs[0].data()
        const refStr = String(p.paystackReference || p.reference || '')
        const cleanRef = refStr.replace(/^LXM_/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
        lastPayment = {
          reference: refStr,
          receiptNumber: p.receiptNumber || (cleanRef ? `RCP-${cleanRef.slice(-10)}` : 'RCP-000001'),
          amount: Number(p.amount || 0),
          currency: String(p.currency || 'GHS'),
          paidAt: p.paidAt
            ? typeof p.paidAt?.toDate === 'function'
              ? p.paidAt.toDate().toISOString()
              : String(p.paidAt)
            : null,
          channel: String(p.channel || p.paymentMethod || 'card'),
        }
      }
    } catch {}

    const resolvedStatus = isCancelled
      ? 'Cancelled'
      : isExpired
      ? 'Expired'
      : isAlreadyPaid
      ? 'Paid'
      : (linkData.status || 'Pending Payment')

    return NextResponse.json({
      success: true,
      link: {
        id: linkDocId,
        token: linkData.token || linkDocId,
        amount: Number(linkData.amount || (projectData ? projectData.outstandingBalance : (quickJobData ? quickJobData.outstandingBalance : (invoiceData?.balanceDue || invoiceData?.total || 0)))),
        currency: linkData.currency || projectData?.currency || quickJobData?.currency || invoiceData?.currency || 'GHS',
        title:
          linkData.title ||
          (projectData?.name
            ? `Payment for Project: ${projectData.name}`
            : quickJobData?.jobDescription
            ? `Payment for Quick Job: ${quickJobData.jobDescription}`
            : invoiceData?.invoiceNumber
            ? `Invoice ${invoiceData.invoiceNumber} Payment`
            : `Payment from ${linkData.clientName || 'Client'}`),
        clientName: linkData.clientName || projectData?.clientName || quickJobData?.clientName || invoiceData?.clientName || 'Client',
        projectName: linkData.projectName || projectData?.name || quickJobData?.jobDescription || invoiceData?.projectName || '',
        invoiceNumber: linkData.invoiceNumber || invoiceData?.invoiceNumber || '',
        paystackReference: linkData.paystackReference || lastPayment?.reference || '',
        status: resolvedStatus,
        paymentStatus: isAlreadyPaid ? 'Paid' : (linkData.paymentStatus || 'Pending Payment'),
        notes: linkData.notes || '',
        invoiceId: linkData.invoiceId || null,
        quickJobId: linkData.quickJobId || null,
        projectId: linkData.projectId || null,
        expiresAt: linkData.expiresAt ? (linkData.expiresAt?.toDate ? linkData.expiresAt.toDate().toISOString() : new Date(linkData.expiresAt).toISOString()) : null,
      },
      invoice: invoiceData
        ? {
            id: invoiceData.id,
            invoiceNumber: invoiceData.invoiceNumber,
            status: invoiceData.status,
            total: invoiceData.total,
            amountPaid: invoiceData.amountPaid,
            balanceDue: invoiceData.balanceDue,
          }
        : null,
      quickJob: quickJobData
        ? {
            id: quickJobData.id,
            jobDescription: quickJobData.jobDescription,
            originalAgreedPrice: Number(quickJobData.originalAgreedPrice) || 0,
            amountPaid: Number(quickJobData.amountPaid) || 0,
            outstandingBalance: Number(quickJobData.outstandingBalance) || 0,
            currency: quickJobData.currency || 'GHS',
            status: quickJobData.status,
            paymentStatus: quickJobData.paymentStatus,
          }
        : null,
      project: projectData
        ? {
            id: projectData.id,
            name: projectData.name,
            serviceName: projectData.serviceName || '',
            packageTitle: projectData.packageTitle || '',
            price: Number(projectData.price) || 0,
            amountPaid: Number(projectData.amountPaid) || 0,
            outstandingBalance: Number(projectData.outstandingBalance) || 0,
            currency: projectData.currency || 'GHS',
            status: projectData.status,
            paymentStatus: projectData.paymentStatus,
          }
        : null,
      lastPayment,
      isCancelled,
      isExpired,
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
