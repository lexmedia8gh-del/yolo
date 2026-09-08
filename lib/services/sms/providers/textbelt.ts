import { SmsProvider, SmsSendParams, SmsSendResponse } from '../types'
import { validatePhoneNumber } from '../phoneUtils'

export class TextbeltProvider implements SmsProvider {
  readonly name = 'textbelt' as const

  private getApiKey(): string {
    const key = process.env.TEXTBELT_API_KEY?.trim()
    // Default to 'textbelt' free test key if no custom key is configured in environment
    return key && key.length > 0 ? key : 'textbelt'
  }

  isConfigured(): boolean {
    const key = process.env.TEXTBELT_API_KEY?.trim()
    return Boolean(key && key.length > 0 && key !== 'textbelt')
  }

  async send(params: SmsSendParams): Promise<SmsSendResponse> {
    const { to, message, senderId } = params

    // 1. Validate and normalize recipient phone number
    const validation = validatePhoneNumber(to)
    if (!validation.isValid) {
      console.warn('[Textbelt Provider] Validation failed for recipient phone:', {
        rawInput: to,
        error: validation.error,
      })
      return {
        success: false,
        provider: this.name,
        error: validation.error || `Invalid recipient phone number format: ${to}`,
        to: validation.normalized || to,
      }
    }

    const normalizedPhone = validation.normalized

    // 2. Validate message content
    if (!message || !message.trim()) {
      return {
        success: false,
        provider: this.name,
        error: 'Message content cannot be empty',
        to: normalizedPhone,
      }
    }

    // 3. Resolve API key
    const apiKey = this.getApiKey()
    const isTestKey = apiKey === 'textbelt'

    // Server-side debug log (safe: never exposes the secret API key value)
    console.log('[Textbelt Provider] Preparing SMS request:', {
      recipient: normalizedPhone,
      messageLength: message.trim().length,
      isTestKey,
      hasCustomApiKey: !isTestKey,
    })

    // 4. Send SMS via Textbelt HTTP API
    try {
      const response = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          phone: normalizedPhone,
          message: message.trim(),
          key: apiKey,
          ...(senderId ? { sender: senderId } : {}),
        }),
      })

      const data = await response.json()

      // Server-side response log (safe: includes textId and status without secret keys)
      console.log('[Textbelt Provider] API Response:', {
        recipient: normalizedPhone,
        httpStatus: response.status,
        success: data?.success,
        textId: data?.textId,
        quotaRemaining: data?.quotaRemaining,
        error: data?.error || null,
        isTestKey,
      })

      if (data && data.success === true) {
        let statusMessage = 'SMS request accepted by provider'
        if (isTestKey) {
          statusMessage = 'SMS request accepted by Textbelt using test key ("textbelt"). Note: Handset delivery requires a paid Textbelt API key.'
        }

        return {
          success: true,
          provider: this.name,
          messageId: data.textId ? String(data.textId) : undefined,
          quotaRemaining: typeof data.quotaRemaining === 'number' ? data.quotaRemaining : undefined,
          statusMessage,
          isTestKey,
          sentAt: new Date().toISOString(),
          to: normalizedPhone,
          rawResponse: {
            textId: data.textId,
            quotaRemaining: data.quotaRemaining,
            success: true,
          },
        }
      }

      // Handle failure responses from Textbelt
      let errorMsg = data?.error || `Textbelt failed to process request (HTTP ${response.status})`

      const lowerErr = errorMsg.toLowerCase()
      if (lowerErr.includes('quota')) {
        errorMsg = isTestKey
          ? 'Textbelt free daily quota limit reached (1 text/day). Please configure a paid key in TEXTBELT_API_KEY.'
          : 'Textbelt account quota exceeded. Please top up your Textbelt account.'
      } else if (lowerErr.includes('invalid phone') || lowerErr.includes('number')) {
        errorMsg = `Textbelt rejected phone number ${normalizedPhone} as invalid or unsupported.`
      } else if (lowerErr.includes('key')) {
        errorMsg = 'Invalid or unrecognized Textbelt API key. Please check TEXTBELT_API_KEY setting.'
      }

      return {
        success: false,
        provider: this.name,
        error: errorMsg,
        quotaRemaining: typeof data?.quotaRemaining === 'number' ? data.quotaRemaining : undefined,
        isTestKey,
        to: normalizedPhone,
        rawResponse: {
          success: false,
          error: data?.error,
          quotaRemaining: data?.quotaRemaining,
        },
      }
    } catch (err: any) {
      console.error('[Textbelt Provider Exception]', {
        recipient: normalizedPhone,
        error: err?.message || err,
      })

      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Network communication failure while contacting Textbelt service',
        isTestKey,
        to: normalizedPhone,
      }
    }
  }
}
