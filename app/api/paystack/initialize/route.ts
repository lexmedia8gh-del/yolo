import { NextRequest, NextResponse } from 'next/server'
import { getAppBaseUrl, buildPaymentCallbackUrl, getProductionUrl } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, email, amount, invoiceNumber, clientName, callbackPath } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
    }

    const amountInSubunits = Math.round(amount * 100)
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
      })
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email || 'client@lexmedia.com',
        amount: amountInSubunits,
        reference,
        callback_url: callbackUrl,
        metadata: {
          token,
          invoiceNumber,
          clientName,
          custom_fields: [
            {
              display_name: 'Invoice Number',
              variable_name: 'invoice_number',
              value: invoiceNumber || 'N/A',
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
