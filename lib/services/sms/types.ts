/**
 * Modular SMS Provider Architecture Types
 */

export type SmsProviderName = 'textbelt' | 'twilio' | 'arkesel' | 'hubtel' | 'generic'

export interface SmsSendParams {
  to: string
  message: string
  clientId?: string
  clientName?: string
  senderId?: string
}

export interface SmsSendResponse {
  success: boolean
  provider: SmsProviderName
  messageId?: string
  quotaRemaining?: number
  error?: string
  statusMessage?: string
  isTestKey?: boolean
  rawResponse?: any
  sentAt?: string
  to?: string
}

export interface SmsProvider {
  readonly name: SmsProviderName
  isConfigured(): boolean
  send(params: SmsSendParams): Promise<SmsSendResponse>
}

export interface WelcomeSmsParams {
  phone: string
  clientName: string
  phoneNumber?: string
  clientId?: string
  businessName?: string
  customTemplate?: string
  senderId?: string
}
