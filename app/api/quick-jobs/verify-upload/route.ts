import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing Quick Job ID', canUpload: false },
        { status: 400 }
      )
    }

    const adminDb = getAdminDb()
    const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(jobId)
    const qjSnap = await qjRef.get()

    if (!qjSnap.exists) {
      return NextResponse.json(
        { error: 'Quick Job not found', canUpload: false },
        { status: 404 }
      )
    }

    const qjData = qjSnap.data()!
    const isPaid =
      qjData.paymentStatus === 'Paid' ||
      (Number(qjData.outstandingBalance) <= 0 && Number(qjData.amountPaid) >= Number(qjData.originalAgreedPrice))

    if (!isPaid) {
      return NextResponse.json(
        {
          canUpload: false,
          paymentStatus: qjData.paymentStatus || 'Unpaid',
          outstandingBalance: qjData.outstandingBalance || qjData.originalAgreedPrice || 0,
          error: 'Upload Locked: Payment has not been confirmed for this Quick Job.',
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      canUpload: true,
      jobId,
      clientName: qjData.clientName,
      paymentStatus: 'Paid',
    })
  } catch (error: any) {
    console.error('[QuickJobs Verify Upload] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', canUpload: false },
      { status: 500 }
    )
  }
}
