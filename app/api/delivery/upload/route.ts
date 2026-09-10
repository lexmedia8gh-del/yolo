import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { sendDeliveryPaymentRequiredEmail } from '@/lib/services/brevo'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { appUrl, getPaymentLink, getDeliveryLink } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const directUrl = (formData.get('directUrl') as string) || ''
    const directStoragePath = (formData.get('storagePath') as string) || ''
    const directFileName = (formData.get('fileName') as string) || ''
    const directFileSize = (formData.get('fileSize') as string) || ''
    const directFileType = (formData.get('fileType') as string) || ''

    const projectId = (formData.get('projectId') as string) || ''
    const quickJobId = (formData.get('quickJobId') as string) || ''
    const deliveryId = (formData.get('deliveryId') as string) || ''
    const clientId = (formData.get('clientId') as string) || ''
    const fileDocId = (formData.get('fileDocId') as string) || ''

    if ((!projectId && !quickJobId) || !deliveryId) {
      return NextResponse.json(
        { error: 'Missing projectId/quickJobId or deliveryId' },
        { status: 400 }
      )
    }

    const bytes = file ? await file.arrayBuffer() : null
    const buffer = bytes ? Buffer.from(bytes) : null

    const sanitizedName = file ? file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file' : 'file'
    const id = fileDocId || Math.random().toString(36).substring(2, 15)

    const parentId = projectId || quickJobId || 'unassigned'
    let downloadUrl = directUrl
    let storagePath = directStoragePath || `deliveries/${parentId}/${deliveryId}/${id}/${sanitizedName}`

    if (!directUrl) {
      if (!buffer) {
        return NextResponse.json({ error: 'Missing file upload buffer' }, { status: 400 })
      }

      // Secure server-side upload directly to Supabase Storage (no local filesystem)
      const supabase = getSupabaseServerClient()
      let { error: uploadError } = await supabase.storage
        .from('Delivery files')
        .upload(storagePath, buffer, {
          contentType: file ? (file.type || 'application/octet-stream') : 'application/octet-stream',
          upsert: true
        })

      if (
        uploadError &&
        (uploadError.message.toLowerCase().includes('bucket not found') ||
          uploadError.message.toLowerCase().includes('nosuchbucket'))
      ) {
        try {
          await supabase.storage.createBucket('Delivery files', { public: true })
          const retry = await supabase.storage
            .from('Delivery files')
            .upload(storagePath, buffer, {
              contentType: file ? (file.type || 'application/octet-stream') : 'application/octet-stream',
              upsert: true,
            })
          uploadError = retry.error
        } catch {}
      }

      if (uploadError) {
        console.error('[Supabase Server Upload Error] Upload failed:', uploadError)
        return NextResponse.json(
          { error: `Supabase Storage upload failed: ${uploadError.message}` },
          { status: 500 }
        )
      }

      downloadUrl = `/api/files?id=${id}`
    }

    const fileName = directUrl ? directFileName : (file ? file.name : '')
    const fileSize = directUrl ? (parseInt(directFileSize, 10) || 0) : (file ? file.size : 0)
    const fileType = directUrl ? directFileType : (file ? (file.type || file.name.split('.').pop() || 'application/octet-stream') : 'application/octet-stream')

    // Save metadata to Firestore using Admin SDK
    const adminDb = getAdminDb()
    const fileRecord = {
      deliveryId,
      projectId: projectId || null,
      quickJobId: quickJobId || null,
      clientId,
      fileName,
      originalName: fileName,
      fileType,
      fileSize,
      storagePath,
      downloadUrl,
      downloadCount: 0,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: 'admin',
    }

    await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(id).set(fileRecord)

    // If this is for a Quick Job, synchronize the Quick Job status
    if (quickJobId) {
      try {
        const qjRef = adminDb.collection(COLLECTIONS.QUICK_JOBS).doc(quickJobId)
        const qjSnap = await qjRef.get()
        if (qjSnap.exists) {
          const qjData = qjSnap.data()!
          const qjUpdates: any = { updatedAt: FieldValue.serverTimestamp() }
          if (qjData.status === 'In Progress' || qjData.status === 'Draft' || !qjData.status) {
            qjUpdates.status = 'Ready for Delivery'
          }
          await qjRef.set(qjUpdates, { merge: true })
        }
      } catch (qjErr) {
        console.warn('[Delivery Upload] Failed to sync Quick Job status:', qjErr)
      }
    }

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
        totalSize: FieldValue.increment(fileSize),
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
          const deliveryUrl = getDeliveryLink(deliveryData.accessToken || deliveryId, req)
          let finalPaymentUrl = ''

          if (amountDue > 0) {
            let paymentToken = ''

            // 1. Check if a clientLink already exists for this invoiceId
            if (invoiceId) {
              const linkSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS)
                .where('invoiceId', '==', invoiceId)
                .limit(1)
                .get()
              if (!linkSnap.empty) {
                const linkData = linkSnap.docs[0].data()
                paymentToken = linkData.token
              }
            }

            // 2. Check if a clientLink already exists for this projectId
            if (!paymentToken && projectId) {
              const linkSnap = await adminDb.collection(COLLECTIONS.CLIENT_LINKS)
                .where('projectId', '==', projectId)
                .limit(1)
                .get()
              if (!linkSnap.empty) {
                const linkData = linkSnap.docs[0].data()
                paymentToken = linkData.token
              }
            }

            // 3. If no link exists, create a new system-generated payment link
            if (!paymentToken) {
              paymentToken = `pay_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`

              let currency = 'GHS'
              let invoiceNum = ''

              if (invoiceId) {
                try {
                  const invDoc = await adminDb.collection(COLLECTIONS.INVOICES).doc(invoiceId).get()
                  if (invDoc.exists) {
                    const invData = invDoc.data()!
                    invoiceNum = invData.invoiceNumber || ''
                    currency = invData.currency || 'GHS'
                  }
                } catch (e) {
                  console.warn('Error fetching invoice details during auto clientLink creation:', e)
                }
              }

              if (!currency && projectId) {
                try {
                  const projDoc = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get()
                  if (projDoc.exists) {
                    const projData = projDoc.data()!
                    currency = projData.currency || 'GHS'
                  }
                } catch (e) {
                  console.warn('Error fetching project details during auto clientLink creation:', e)
                }
              }

              const newLinkPayload = {
                token: paymentToken,
                clientId: targetClientId,
                clientName: clientName,
                projectId: projectId || null,
                projectName: deliveryData.projectName || 'Your Project',
                invoiceId: invoiceId || null,
                invoiceNumber: invoiceNum || null,
                amount: amountDue,
                currency,
                status: 'Pending Payment',
                createdBy: 'system_delivery_upload',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                viewCount: 0,
              }

              await adminDb.collection(COLLECTIONS.CLIENT_LINKS).add(newLinkPayload)
            }

            finalPaymentUrl = getPaymentLink(paymentToken, req)
          } else {
            // If there's no balance due, point directly to the delivery portal
            finalPaymentUrl = deliveryUrl
          }

          const emailRes = await sendDeliveryPaymentRequiredEmail({
            toEmail: clientEmail,
            clientName,
            projectName: deliveryData.projectName || 'Your Project',
            amountDue,
            currencySymbol: 'GH₵',
            paymentUrl: finalPaymentUrl,
            deliveryUrl,
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
      fileName,
      fileSize,
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
