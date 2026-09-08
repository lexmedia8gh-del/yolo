import { TextbeltProvider } from './providers/textbelt'
import {
  SmsProvider,
  SmsProviderName,
  SmsSendParams,
  SmsSendResponse,
  WelcomeSmsParams,
} from './types'
import { getWelcomeMessage } from './welcomeTemplate'
import { normalizePhoneNumber, validatePhoneNumber } from './phoneUtils'
import { insertRow, TABLES, isSupabaseConfigured } from '@/lib/supabase'

export * from './types'
export * from './phoneUtils'
export * from './welcomeTemplate'
export * from './providers/textbelt'

/**
 * Returns the configured SMS provider instance.
 * Currently defaults to Textbelt, designed so other providers (Twilio, Arkesel, etc.)
 * can easily be swapped or dynamically selected without changing consumer code.
 */
export function getSmsProvider(providerName: SmsProviderName = 'textbelt'): SmsProvider {
  switch (providerName) {
    case 'textbelt':
    default:
      return new TextbeltProvider()
  }
}

/**
 * Dispatches a generic SMS message via the current SMS provider.
 */
export async function sendSms(params: SmsSendParams): Promise<SmsSendResponse> {
  const provider = getSmsProvider()
  const result = await provider.send(params)

  // Asynchronously record delivery log in database if Supabase is active
  recordSmsLogAsync(params, result).catch((err) => {
    console.warn('[SMS Logger] Could not record SMS log in database:', err?.message || err)
  })

  return result
}

/**
 * Sends a personalized Welcome SMS to a newly created client.
 */
export async function sendWelcomeSms(params: WelcomeSmsParams): Promise<SmsSendResponse> {
  const { phone, clientName, clientId, businessName, customTemplate, senderId } = params

  const message = getWelcomeMessage(clientName, businessName, customTemplate)

  return sendSms({
    to: phone,
    message,
    clientId,
    clientName,
    senderId,
  })
}

/**
 * Safely logs SMS attempt to Supabase database for audit and troubleshooting.
 */
async function recordSmsLogAsync(params: SmsSendParams, result: SmsSendResponse): Promise<void> {
  if (!isSupabaseConfigured()) return

  try {
    await insertRow('sms_logs', {
      recipient: result.to || params.to,
      client_id: params.clientId || null,
      client_name: params.clientName || null,
      message_preview: params.message.substring(0, 160),
      provider: result.provider,
      status: result.success ? 'delivered' : 'failed',
      error_message: result.error || null,
      provider_message_id: result.messageId || null,
      quota_remaining: result.quotaRemaining ?? null,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Non-blocking catch to ensure database logging never interferes with execution
  }
}
