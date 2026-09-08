/**
 * Configurable Welcome Message Template for Newly Created Clients.
 */

export const DEFAULT_WELCOME_TEMPLATE =
  'Hello {name}, welcome to Ctrl Room. Thank you for choosing us. We are pleased to have you with us and will keep you updated regarding your service.'

/**
 * Generates the welcome message with dynamic placeholders replaced.
 * Supports: {name}, {client_name}, {business_name}, {company}
 */
export function getWelcomeMessage(
  clientName?: string,
  businessName = 'Ctrl Room',
  customTemplate?: string
): string {
  const template = customTemplate?.trim() || DEFAULT_WELCOME_TEMPLATE
  const displayName = clientName?.trim() || 'Valued Client'

  return template
    .replace(/\{name\}/gi, displayName)
    .replace(/\{client_name\}/gi, displayName)
    .replace(/\{business_name\}/gi, businessName)
    .replace(/\{company\}/gi, businessName)
}

/**
 * Returns the default template string for configuration/preview.
 */
export function getDefaultWelcomeTemplate(): string {
  return DEFAULT_WELCOME_TEMPLATE
}
