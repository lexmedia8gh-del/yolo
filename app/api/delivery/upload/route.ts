import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryPaymentRequiredEmail } from '@/lib/services/brevo'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = (formData.get('projectId') as string) || ''
    const deliveryId = (formData.get('deliveryId') as string) || ''
    const clientId = (formData.get('clientId') as string) || ''
    const fileDocId = (formData.get('fileDocId') as string) || ''

    if (!file || !projectId || !deliveryId) {
      return NextResponse.json(
        { error: 'Missing file, projectId, or deliveryId' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const id = fileDocId || Math.random().toString(36).substring(2, 15)

    // Save to local public storage directory: public/uploads/deliveries/{projectId}/{deliveryId}/{id}/{sanitizedName}
    const relativeStorageDir = path.join('uploads', 'deliveries', projectId, deliveryId, id)
    const absoluteTargetDir = path.join(process.cwd(), 'public', relativeStorageDir)

    await fs.promises.mkdir(absoluteTargetDir, { recursive: true })
    const absoluteFilePath = path.join(absoluteTargetDir, sanitizedName)
    await fs.promises.writeFile(absoluteFilePath, buffer)

    // Web-accessible download URL via streaming endpoint
    const downloadUrl = `/api/files?id=${id}`
    const storagePath = `deliveries/${projectId}/${deliveryId}/${id}/${sanitizedName}`

    // Save metadata to Firestore using Admin SDK
    const adminDb = getAdminDb()
    const fileRecord = {
      deliveryId,
      projectId,
      clientId,
      fileName: file.name,
      originalName: file.name,
      fileType: file.type || file.name.split('.').pop() || 'application/octet-stream',
      fileSize: file.size,
      storagePath,
      downloadUrl,
      downloadCount: 0,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: 'admin',
    }

    await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(id).set(fileRecord)

    // Atomically increment container metrics and update status
    let emailNotificationStatus: { sent: boolean; messageId?: string; error?: string; skipped?: boolean } = { sent: false }
    const deliveryRef = adminDb.collection(COLLECTIONS.DELIVERIES).doc(deliveryId)
    const deliverySnap = await deliveryRef.get()

    if (deliverySnap.exists) {
      const deliveryData = deliverySnap.data()!
      const currentStatus = deliveryData.status || 'Not Ready'
      const nextStatus = currentStatus === 'Not Ready' ? 'Ready for Delivery' : currentStatus

      const updates: any = {
        fileCount: FieldValue.increment(1),
        totalSize: FieldValue.increment(file.size),
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Check if transitioning to "Ready for Delivery" or if email not yet sent
      if (nextStatus === 'Ready for Delivery' && !deliveryData.uploadEmailSent) {
        let clientEmail = deliveryData.clientEmail || ''
        let clientName = deliveryData.clientName || 'Valued Client'
        let clientLogoUrl = ''
        const targetClientId = deliveryData.clientId || clientId

        if (targetClientId) {
          const clientSnap = await adminDb.collection(COLLECTIONS.CLIENTS).doc(targetClientId).get()
          if (clientSnap.exists) {
            const cData = clientSnap.data()!
            if (cData.email) clientEmail = cData.email
            if (cData.fullName) clientName = cData.fullName
            if (cData.photoURL) clientLogoUrl = cData.photoURL
          }
        }

        // Fetch brand logo
        let lexmediaLogoUrl = ''
        const brandingSnap = await adminDb.collection(COLLECTIONS.SETTINGS).doc('branding').get()
        if (brandingSnap.exists) {
          const bData = brandingSnap.data()!
          if (bData.logoUrl) lexmediaLogoUrl = bData.logoUrl
        }

        // Fetch invoice / balance due
        let amountDue = 0
        let invoiceId = deliveryData.invoiceId
        if (!invoiceId && projectId) {
          const invSnap = await adminDb.collection(COLLECTIONS.INVOICES).where('projectId', '==', projectId).get()
          if (!invSnap.empty) invoiceId = invSnap.docs[0].id
        }

        if (invoiceId) {
          const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(invoiceId).get()
          if (invDoc.exists) {
            const invData = invDoc.data()!
            amountDue = invData.balanceDue !== undefined ? invData.balanceDue : (invData.total || 0)
          }
        }

        if (clientEmail) {
          const origin = new URL(req.url).origin
          const paymentUrl = `${origin}/delivery/${encodeURIComponent(deliveryData.accessToken || deliveryId)}`

          const emailRes = await sendDeliveryPaymentRequiredEmail({
            toEmail: clientEmail,
            clientName,
            projectName: deliveryData.projectName || 'Your Project',
            amountDue,
            currencySymbol: 'GH₵',
            paymentUrl,
            lexmediaLogoUrl,
            clientLogoUrl,
          })

          if (emailRes.success) {
            updates.uploadEmailSent = true
            updates.uploadEmailSentAt = FieldValue.serverTimestamp()
            updates.uploadEmailMessageId = emailRes.messageId || null
            emailNotificationStatus = { sent: true, messageId: emailRes.messageId }
          } else {
            emailNotificationStatus = { sent: false, error: emailRes.error }
          }
        }
      }

      await deliveryRef.update(updates)
    }

    return NextResponse.json({
      success: true,
      fileId: id,
      downloadUrl,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: fileRecord.fileType,
    })
  } catch (error: any) {
    console.error('API delivery upload error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
