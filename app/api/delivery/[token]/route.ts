import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, query, where, getDocs, doc, getDoc, updateDoc, Timestamp as ClientTimestamp } from 'firebase/firestore'
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token
    if (!token) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 })
    }

    let deliveryDocData: any = null
    let deliveryId: string = ''
    let files: any[] = []
    let isFallback = false

    // Try Admin DB first
    try {
      const adminDb = getAdminDb()
      const deliveriesSnap = await adminDb
        .collection(COLLECTIONS.DELIVERIES)
        .where('accessToken', '==', token)
        .limit(1)
        .get()

      if (!deliveriesSnap.empty) {
        const doc = deliveriesSnap.docs[0]
        deliveryDocData = doc.data()
        deliveryId = doc.id

        const filesSnap = await adminDb
          .collection(COLLECTIONS.DELIVERY_FILES)
          .where('deliveryId', '==', deliveryId)
          .get()

        files = filesSnap.docs.map((d) => {
          const fd = d.data()
          return {
            id: d.id,
            fileName: fd.fileName || fd.originalName || 'file',
            originalName: fd.originalName || fd.fileName || 'file',
            fileType: fd.fileType || 'application/octet-stream',
            fileSize: fd.fileSize || 0,
            downloadUrl: fd.downloadUrl || '',
            downloadCount: fd.downloadCount || 0,
            uploadedAt: fd.uploadedAt,
          }
        })
      }
    } catch (adminErr) {
      // Admin SDK not configured or failed - fallback to client SDK
      isFallback = true
    }

    // If not found or Admin SDK failed, use client Firestore fallback
    if (!deliveryDocData) {
      const deliveriesRef = collection(db, COLLECTIONS.DELIVERIES)
      const q = query(deliveriesRef, where('accessToken', '==', token))
      const snap = await getDocs(q)

      if (!snap.empty) {
        const docSnap = snap.docs[0]
        deliveryDocData = docSnap.data()
        deliveryId = docSnap.id

        const filesRef = collection(db, COLLECTIONS.DELIVERY_FILES)
        const filesQ = query(filesRef, where('deliveryId', '==', deliveryId))
        const filesSnap = await getDocs(filesQ)

        files = filesSnap.docs.map((d) => {
          const fd = d.data()
          return {
            id: d.id,
            fileName: fd.fileName || fd.originalName || 'file',
            originalName: fd.originalName || fd.fileName || 'file',
            fileType: fd.fileType || 'application/octet-stream',
            fileSize: fd.fileSize || 0,
            downloadUrl: fd.downloadUrl || '',
            downloadCount: fd.downloadCount || 0,
            uploadedAt: fd.uploadedAt,
          }
        })
      }
    }

    // If files list is empty from deliveryId query, try searching by quickJobId or deliveryDocData.files array
    if (files.length === 0 && deliveryDocData) {
      if (deliveryDocData.quickJobId) {
        try {
          const adminDb = getAdminDb()
          const qjFilesSnap = await adminDb
            .collection(COLLECTIONS.DELIVERY_FILES)
            .where('quickJobId', '==', deliveryDocData.quickJobId)
            .get()

          if (!qjFilesSnap.empty) {
            files = qjFilesSnap.docs.map((d) => {
              const fd = d.data()
              return {
                id: d.id,
                fileName: fd.fileName || fd.originalName || 'file',
                originalName: fd.originalName || fd.fileName || 'file',
                fileType: fd.fileType || 'application/octet-stream',
                fileSize: fd.fileSize || 0,
                downloadUrl: fd.downloadUrl || '',
                downloadCount: fd.downloadCount || 0,
                uploadedAt: fd.uploadedAt,
              }
            })
          }
        } catch {}
      }

      if (files.length === 0 && Array.isArray(deliveryDocData.files) && deliveryDocData.files.length > 0) {
        files = deliveryDocData.files.map((f: any, idx: number) => ({
          id: f.id || `file_${idx}`,
          fileName: f.name || f.fileName || 'file',
          originalName: f.name || f.originalName || 'file',
          fileType: f.fileType || 'application/octet-stream',
          fileSize: f.size || f.fileSize || 0,
          downloadUrl: f.url || f.downloadUrl || '',
          downloadCount: f.downloadCount || 0,
          uploadedAt: f.uploadedAt || deliveryDocData.createdAt,
        }))
      }
    }

    if (!deliveryDocData) {
      console.warn(`[Delivery] Token not found: ${token.slice(0, 8)}...`)
      return NextResponse.json({ error: 'Delivery not found or link is invalid' }, { status: 404 })
    }

    // Check expiration
    if (deliveryDocData.expiresAt) {
      let expiresDate: Date
      if (
        deliveryDocData.expiresAt instanceof AdminTimestamp ||
        deliveryDocData.expiresAt instanceof ClientTimestamp
      ) {
        expiresDate = deliveryDocData.expiresAt.toDate()
      } else if (deliveryDocData.expiresAt?.seconds) {
        expiresDate = new Date(deliveryDocData.expiresAt.seconds * 1000)
      } else {
        expiresDate = new Date(deliveryDocData.expiresAt)
      }
      if (expiresDate.getTime() < Date.now()) {
        return NextResponse.json(
          {
            error: 'This delivery link has expired. Please contact LexMedia for a new link.',
            isExpired: true,
          },
          { status: 410 }
        )
      }
    }

    // Check payment lock
    let isLocked = false
    let lockReason = ''

    if (deliveryDocData.requiresFullPayment && !deliveryDocData.isReleased) {
      // If payment is required and not released, check if invoice or quick job is paid
      if (deliveryDocData.invoiceId) {
        try {
          if (!isFallback) {
            const adminDb = getAdminDb()
            const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryDocData.invoiceId).get()
            if (invSnap.exists) {
              const invData = invSnap.data()
              if (invData && invData.status !== 'Paid') {
                isLocked = true
                lockReason = 'Delivery files will become available once the project payment is completed.'
              }
            }
          }
        } catch {}
      } else if (deliveryDocData.quickJobId) {
        try {
          if (!isFallback) {
            const adminDb = getAdminDb()
            const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(deliveryDocData.quickJobId).get()
            if (qjSnap.exists) {
              const qjData = qjSnap.data()
              if (qjData && qjData.paymentStatus !== 'Paid' && (qjData.outstandingBalance ?? 1) > 0) {
                isLocked = true
                lockReason = 'Delivery files will become available once the quick job payment is completed.'
              }
            }
          }
        } catch {}
      }
    }

    const toISO = (ts: any): string | null => {
      if (!ts) return null
      if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
      if (ts.seconds) return new Date(ts.seconds * 1000).toISOString()
      if (typeof ts === 'string') return ts
      return null
    }

    const formattedFiles = files
      .map((f) => {
        const iso = toISO(f.uploadedAt)
        let downloadUrl = f.downloadUrl
        if (!downloadUrl || downloadUrl.includes('localhost') || downloadUrl.includes('127.0.0.1')) {
          downloadUrl = `/api/files?id=${f.id}`
        }
        return {
          id: f.id,
          fileName: f.fileName,
          originalName: f.originalName,
          fileType: f.fileType,
          fileSize: f.fileSize,
          downloadUrl,
          downloadCount: f.downloadCount,
          uploadedAt: iso,
          _ms: iso ? new Date(iso).getTime() : 0,
        }
      })
      .sort((a, b) => b._ms - a._ms)
      .map(({ _ms, ...rest }) => rest)

    const totalSize = formattedFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0)

    let invoiceTotal = 0
    let totalPaid = 0
    let remainingBalance = 0
    let currency = 'GHS'
    let clientEmail = deliveryDocData.clientEmail || ''
    let invoiceNumber = ''
    let paymentLinkToken = token

    if (deliveryDocData.invoiceId) {
      try {
        const adminDb = getAdminDb()
        const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).doc(deliveryDocData.invoiceId).get()
        if (invSnap.exists) {
          const inv = invSnap.data()!
          invoiceTotal = inv.total || 0
          totalPaid = inv.amountPaid || 0
          remainingBalance = inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, invoiceTotal - totalPaid)
          currency = inv.currency || 'GHS'
          clientEmail = inv.clientEmail || clientEmail
          invoiceNumber = inv.invoiceNumber || ''
          if (inv.paymentLinkToken) {
            paymentLinkToken = inv.paymentLinkToken
          }
        }
      } catch {}
    } else if (deliveryDocData.quickJobId) {
      try {
        const adminDb = getAdminDb()
        const qjSnap = await adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(deliveryDocData.quickJobId).get()
        if (qjSnap.exists) {
          const qj = qjSnap.data()!
          invoiceTotal = qj.originalAgreedPrice || qj.total || 0
          totalPaid = qj.amountPaid || 0
          remainingBalance = qj.outstandingBalance !== undefined ? qj.outstandingBalance : Math.max(0, invoiceTotal - totalPaid)
          currency = qj.currency || 'GHS'
          clientEmail = qj.clientEmail || clientEmail
          if (qj.deliveryAccessToken) {
            paymentLinkToken = qj.deliveryAccessToken
          }
        }
      } catch {}
    }

    if (deliveryDocData.invoiceId) {
      try {
        const adminDb = getAdminDb()
        const linksSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS).where('invoiceId', '==', deliveryDocData.invoiceId).limit(1).get()
        if (!linksSnap.empty) {
          const linkData = linksSnap.docs[0].data()
          if (linkData.token) {
            paymentLinkToken = linkData.token
          }
        }
      } catch {}
    }

    const isFullyPaid = deliveryDocData.isReleased || (remainingBalance <= 0) || (invoiceTotal > 0 && totalPaid >= invoiceTotal) || !deliveryDocData.requiresFullPayment

    return NextResponse.json({
      delivery: {
        id: deliveryId,
        title: deliveryDocData.title || 'Project Delivery',
        projectName: deliveryDocData.projectName || '',
        clientName: deliveryDocData.clientName || '',
        status: deliveryDocData.status || 'Delivered',
        isReleased: deliveryDocData.isReleased || false,
        expiresAt: toISO(deliveryDocData.expiresAt),
        releasedAt: toISO(deliveryDocData.releasedAt),
        notes: deliveryDocData.notes || '',
        requiresFullPayment: deliveryDocData.requiresFullPayment ?? true,
        fileCount: formattedFiles.length,
        totalSize: deliveryDocData.totalSize || totalSize,
      },
      financials: {
        invoiceTotal,
        totalPaid,
        remainingBalance: Math.max(0, remainingBalance),
        currency,
        clientEmail,
        invoiceNumber,
        paymentLinkToken,
        isFullyPaid,
      },
      files: formattedFiles,
      isLocked: deliveryDocData.requiresFullPayment && !isFullyPaid,
    })
  } catch (error: any) {
    console.error('[Delivery] Lookup error:', error)
    return NextResponse.json(
      {
        error: 'Failed to load delivery details. Please try again later.',
        code: 'DELIVERY_LOOKUP_ERROR',
      },
      { status: 500 }
    )
  }
}
