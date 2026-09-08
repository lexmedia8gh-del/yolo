import { SmsProvider, SmsSendParams, SmsSendResponse } from '../types'
import { validatePhoneNumber } from '../phoneUtils'

export class TextbeltProvider implements SmsProvider {
  readonly name = 'textbelt' as const

  private getApiKey(): string | undefined {
    return process.env.TEXTBELT_API_KEY?.trim()
  }

  isConfigured(): boolean {
    const key = this.getApiKey()
    return Boolean(key && key.length > 0)
  }

  async send(params: SmsSendParams): Promise<SmsSendResponse> {
    const { to, message, senderId } = params

    // 1. Validate and normalize the recipient phone number
    const validation = validatePhoneNumber(to)
    if (!validation.isValid) {
      return {
        success: false,
        provider: this.name,
        error: validation.error || `Invalid recipient phone number: ${to}`,
        to,
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

    // 3. Validate API key presence
    const apiKey = this.getApiKey()
    if (!apiKey) {
      console.warn('[Textbelt Provider] TEXTBELT_API_KEY is not configured in server environment.')
      return {
        success: false,
        provider: this.name,
        error: 'TEXTBELT_API_KEY is not configured in server environment variables. Please add your key to send SMS.',
        to: normalizedPhone,
      }
    }

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

      if (data && data.success === true) {
        return {
          success: true,
          provider: this.name,
          messageId: data.textId ? String(data.textId) : undefined,
          quotaRemaining: typeof data.quotaRemaining === 'number' ? data.quotaRemaining : undefined,
          sentAt: new Date().toISOString(),
          to: normalizedPhone,
          rawResponse: data,
        }
      }

      // Provider returned an error (e.g., quota exceeded, invalid number, bad key)
      const errorMsg =
        data?.error ||
        `Textbelt failed to deliver SMS (HTTP ${response.status})`

      console.warn('[Textbelt Provider Failed]', {
        to: normalizedPhone,
        error: errorMsg,
        quotaRemaining: data?.quotaRemaining,
      })

      return {
        success: false,
        provider: this.name,
        error: errorMsg,
        quotaRemaining: data?.quotaRemaining,
        to: normalizedPhone,
        rawResponse: data,
      }
    } catch (err: any) {
      console.error('[Textbelt Provider Exception]', err)
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Network communication failure while contacting Textbelt service',
        to: normalizedPhone,
      }
    }
  }
}
