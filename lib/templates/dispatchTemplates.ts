export interface MessageTemplate {
  id: string
  name: string
  category: 'welcome' | 'credentials' | 'project_update' | 'invoice' | 'payment_confirmation' | 'service_completion' | 'dispatch' | 'announcement'
  channel: 'all' | 'email' | 'sms'
  subject: string
  body: string
  description: string
}

export const DEFAULT_DISPATCH_TEMPLATES: MessageTemplate[] = [
  {
    id: 'welcome-onboarding',
    name: 'Client Onboarding Welcome',
    category: 'welcome',
    channel: 'all',
    subject: 'Welcome to LEXMEDIA.GH — Your Client Account is Ready',
    body: `Hello {{clientName}},

Welcome to LEXMEDIA.GH! Your official client account (ID: {{clientId}}) has been successfully set up.

You can access your dedicated client portal at any time to track project progress, preview deliverables, and manage billing:
{{loginUrl}}

If you have any questions or need custom media production assistance, reach out to us at {{supportEmail}}.

Best regards,
LEXMEDIA.GH Production Team`,
    description: 'Welcome new clients with account credentials and portal link',
  },
  {
    id: 'credentials-reset',
    name: 'Client Account Credentials & Portal Access',
    category: 'credentials',
    channel: 'all',
    subject: 'Your LEXMEDIA.GH Portal Access Information',
    body: `Dear {{clientName}},

Here is your official account access details for LEXMEDIA.GH:

Client Name: {{clientName}}
Client ID: {{clientId}}
Portal Access Link: {{loginUrl}}

Use this link to view active project proofs, review media files, and complete invoice payments securely.

Thank you for partnering with LEXMEDIA.GH.`,
    description: 'Send portal login URL and account identifier to clients',
  },
  {
    id: 'project-status-update',
    name: 'Project Progress Update',
    category: 'project_update',
    channel: 'all',
    subject: 'Update on Your Project: {{projectName}}',
    body: `Hi {{clientName}},

We are pleased to share an update regarding your project "{{projectName}}".

Our production team has completed the latest phase of editing/rendering. You can review the current proofs and status in your client portal:
{{loginUrl}}

Thank you for your continued trust in LEXMEDIA.GH.`,
    description: 'Notify client when a project phase or milestone is updated',
  },
  {
    id: 'invoice-payment-request',
    name: 'Invoice & Payment Request',
    category: 'invoice',
    channel: 'all',
    subject: 'Invoice {{invoiceNumber}} from LEXMEDIA.GH — Amount Due: {{amount}}',
    body: `Hello {{clientName}},

Your invoice {{invoiceNumber}} for "{{projectName}}" is ready.

Total Amount Due: {{amount}}
Status: {{paymentStatus}}

Pay securely online via Mobile Money, Card, or Bank transfer using the link below:
{{loginUrl}}

Thank you for your business!
LEXMEDIA.GH`,
    description: 'Send payment link and invoice summary to client',
  },
  {
    id: 'payment-received-confirmation',
    name: 'Payment Receipt & Confirmation',
    category: 'payment_confirmation',
    channel: 'all',
    subject: 'Payment Confirmed — Invoice {{invoiceNumber}} ({{amount}})',
    body: `Dear {{clientName}},

Thank you! We have successfully received your payment of {{amount}} for Invoice {{invoiceNumber}}.

Your account balance has been updated, and any locked media deliverables for "{{projectName}}" are now unlocked for download in your portal:
{{loginUrl}}

Best regards,
LEXMEDIA.GH`,
    description: 'Confirm payment receipt and unlock deliverable downloads',
  },
  {
    id: 'service-completion-ready',
    name: 'Final Deliverables Ready',
    category: 'service_completion',
    channel: 'all',
    subject: 'Your Deliverables for {{projectName}} Are Ready!',
    body: `Great news {{clientName}}!

Your high-resolution media deliverables for "{{projectName}}" are complete and ready for download.

Access your files immediately in your client portal:
{{loginUrl}}

Thank you for choosing LEXMEDIA.GH!`,
    description: 'Notify client that final project deliverables are ready for download',
  },
  {
    id: 'general-dispatch-notice',
    name: 'General Workspace Dispatch Notice',
    category: 'dispatch',
    channel: 'all',
    subject: 'Notice from LEXMEDIA.GH for {{clientName}}',
    body: `Hello {{clientName}},

This is an official communication from LEXMEDIA.GH regarding your account (ID: {{clientId}}).

Please visit your portal for detailed updates:
{{loginUrl}}

For any immediate inquiries, contact support at {{supportEmail}}.

Best regards,
LEXMEDIA.GH`,
    description: 'General purpose multi-channel broadcast message',
  },
]

export interface SubstituteParams {
  clientName?: string
  clientId?: string
  projectName?: string
  invoiceNumber?: string
  amount?: string
  paymentStatus?: string
  loginUrl?: string
  serviceName?: string
  supportEmail?: string
}

export function substitutePlaceholders(templateText: string, params: SubstituteParams): string {
  let result = templateText || ''
  const mapping: Record<string, string> = {
    clientName: params.clientName || 'Valued Client',
    clientId: params.clientId || 'LM-CLIENT',
    projectName: params.projectName || 'Media Production Project',
    invoiceNumber: params.invoiceNumber || 'INV-0001',
    amount: params.amount || 'GH₵0.00',
    paymentStatus: params.paymentStatus || 'Pending',
    loginUrl: params.loginUrl || 'https://lexmedia.gh/login',
    serviceName: params.serviceName || 'Media Service',
    supportEmail: params.supportEmail || 'lexmedia8gh@gmail.com',
  }

  for (const [key, value] of Object.entries(mapping)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi')
    result = result.replace(regex, value)
  }

  return result
}
