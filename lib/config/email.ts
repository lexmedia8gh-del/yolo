/**
 * Centralized Email Configuration for LexMedia
 *
 * Sender Display Name: LEXMEDIA.GH
 * Sender Email: Read from process.env.BREVO_SENDER_EMAIL or fallback to existing 'lexmedia8gh@gmail.com'
 * RFC 5322 Header Format: LEXMEDIA.GH <existing-sender-email>
 */

export const senderName = "LEXMEDIA.GH"
export const defaultSenderEmail = process.env.BREVO_SENDER_EMAIL || 'lexmedia8gh@gmail.com'

export interface EmailSenderIdentity {
  name: string
  email: string
  formatted: string
}

/**
 * Returns the centralized email sender identity for all transactional emails.
 * Ensures the sender name is consistently 'LEXMEDIA.GH' across the entire platform.
 */
export function getEmailSender(overrideEmail?: string): EmailSenderIdentity {
  const email = (overrideEmail || process.env.BREVO_SENDER_EMAIL || 'lexmedia8gh@gmail.com').trim()
  return {
    name: senderName,
    email,
    formatted: `${senderName} <${email}>`,
  }
}
