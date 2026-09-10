/**
 * Configurable Welcome Message Template for Newly Created Clients.
 */

export const DEFAULT_WELCOME_TEMPLATE =
  'Hello {clientName}, welcome to LEXMEDIA.GH. We are happy to have you as our client.'

/**
 * Generates the welcome message with dynamic placeholders replaced.
 * Supports: {clientName}, {phoneNumber}, {name}, {client_name}, {businessName}, {company}
 */
export function getWelcomeMessage(
  clientName?: string,
  phoneNumber?: string,
  businessName = 'LEXMEDIA.GH',
  customTemplate?: string
): string {
  const template = customTemplate?.trim() || DEFAULT_WELCOME_TEMPLATE
  const displayName = clientName?.trim() || 'Valued Client'
  const displayPhone = phoneNumber?.trim() || ''

  return template
    .replace(/\{clientName\}/gi, displayName)
    .replace(/\{name\}/gi, displayName)
    .replace(/\{client_name\}/gi, displayName)
    .replace(/\{phoneNumber\}/gi, displayPhone)
    .replace(/\{phone\}/gi, displayPhone)
    .replace(/\{businessName\}/gi, businessName)
    .replace(/\{business_name\}/gi, businessName)
    .replace(/\{company\}/gi, businessName)
}

/**
 * Returns the default template string for configuration/preview.
 */
export function getDefaultWelcomeTemplate(): string {
  return DEFAULT_WELCOME_TEMPLATE
}
