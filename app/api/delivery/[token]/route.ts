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
      // If payment is required and not released, check if invoice is paid
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
      }
    }

    if (isLocked) {
      return NextResponse.json(
        {
          isLocked: true,
          lockReason,
          delivery: {
            title: deliveryDocData.title,
            projectName: deliveryDocData.projectName,
            clientName: deliveryDocData.clientName,
            projectId: deliveryDocData.projectId,
            invoiceId: deliveryDocData.invoiceId,
          },
        },
        { status: 403 }
      )
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
        return {
          id: f.id,
          fileName: f.fileName,
          originalName: f.originalName,
          fileType: f.fileType,
          fileSize: f.fileSize,
          downloadUrl: f.downloadUrl,
          downloadCount: f.downloadCount,
          uploadedAt: iso,
          _ms: iso ? new Date(iso).getTime() : 0,
        }
      })
      .sort((a, b) => b._ms - a._ms)
      .map(({ _ms, ...rest }) => rest)

    const totalSize = formattedFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0)

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
        fileCount: formattedFiles.length,
        totalSize: deliveryDocData.totalSize || totalSize,
      },
      files: formattedFiles,
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
