import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateSecureToken, appUrl, getDeliveryLink } from '@/lib/utils'
import { senderName, getEmailSender } from '@/lib/config/email'

export async function POST(req: NextRequest) {
  try {
    const { jobId, clientName, clientEmail, files } = await req.json()

    if (!jobId || !clientEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminDb = getAdminDb()
    
    // 1. Verify Quick Job Payment Status
    const qjRef = adminDb.collection('quickJobs').doc(jobId)
    const qjSnap = await qjRef.get()
    
    if (!qjSnap.exists) {
      return NextResponse.json({ error: 'Quick Job not found' }, { status: 404 })
    }
    
    const qjData = qjSnap.data()!
    if (qjData.paymentStatus !== 'Paid') {
      return NextResponse.json({ error: 'Payment must be completed before sending delivery' }, { status: 400 })
    }
    
    if (qjData.deliveryStatus === 'Sent') {
      return NextResponse.json({ error: 'Delivery already sent' }, { status: 400 })
    }

    // 2. Create a delivery record to generate an access token
    const accessToken = generateSecureToken('dlv_')
    const deliveryRef = adminDb.collection('deliveries').doc()
    
    // Map uploaded files to delivery files structure
    const deliveryFiles = files.map((f: any) => ({
      id: generateSecureToken('file_'),
      name: f.name,
      url: f.url,
      path: f.path,
      size: f.size || 0,
      type: f.name.split('.').pop() || 'file',
      uploadedAt: new Date().toISOString()
    }))

    await deliveryRef.set({
      clientId: qjData.clientId,
      clientName: qjData.clientName,
      quickJobId: jobId,
      projectName: qjData.jobDescription || 'Quick Job Delivery',
      title: 'Quick Job Delivery Files',
      status: 'Ready',
      accessToken,
      files: deliveryFiles,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const deliveryLink = getDeliveryLink(accessToken)

    // 3. Send email via Brevo API directly using centralized sender configuration
    const apiKey = process.env.BREVO_API_KEY
    const sender = getEmailSender()

    // Using precise requested template
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>Hello ${clientName},</p>
        <p>Great news! 🎉 Your payment has been successfully confirmed, and your files are now ready.</p>
        <p>You can access your delivered files using the link below:</p>
        <p><a href="${deliveryLink}" style="color: #2563eb; text-decoration: underline;">${deliveryLink}</a></p>
        <br>
        <p>Thank you for choosing ${senderName}.</p>
        <br>
        <p>Best regards,<br>${senderName}</p>
      </div>
    `

    if (apiKey) {
      const brevoPayload = {
        sender: { name: senderName, email: sender.email },
        to: [{ email: clientEmail, name: clientName }],
        replyTo: { name: senderName, email: sender.email },
        subject: `Your Files Are Ready – ${senderName}`,
        htmlContent,
      }

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(brevoPayload),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        console.error('Brevo Error:', errText)
        throw new Error('Failed to send email via Brevo')
      }
    } else {
      console.log(`[Quick Jobs Delivery Email - Preview Mode] Continuing without Brevo API key:`)
      console.log(`  To: ${clientName} <${clientEmail}>`)
      console.log(`  From: ${senderName} <${sender.email}>`)
      console.log(`  Subject: Your Files Are Ready – ${senderName}`)
    }

    // 4. Update Quick Job to Sent
    await qjRef.update({
      deliveryStatus: 'Sent',
      deliveryEmailSentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })

    return NextResponse.json({ success: true, deliveryLink })

  } catch (error: any) {
    console.error('Send Quick Job Delivery Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
