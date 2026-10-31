export interface MessageTemplate {
  id: string
  name: string
  category: 'welcome' | 'credentials' | 'new_project' | 'project_update' | 'dispatch' | 'invoice' | 'payment_confirmation' | 'payment_reminder' | 'service_completion' | 'announcement'
  channel: 'all' | 'email' | 'sms'
  subject: string
  body: string
  description: string
}

export const DEFAULT_DISPATCH_TEMPLATES: MessageTemplate[] = [
  {
    id: 'welcome-onboarding',
    name: '1. Client Onboarding Welcome',
    category: 'welcome',
    channel: 'all',
    subject: 'Welcome to {{companyName}} — Your Client Account is Ready',
    body: `Hello {{clientName}},

Welcome to {{companyName}}! Your official client account (ID: {{clientId}}) has been successfully set up.

You can access your dedicated client portal at any time to track project progress, preview deliverables, and manage billing:
{{loginUrl}}

Account Details:
- Client Name: {{clientName}}
- Client ID: {{clientId}}
- Registered Email: {{clientEmail}}

If you have any questions or need custom media production assistance, reach out to us at {{supportEmail}}.

Best regards,
{{companyName}} Production Team`,
    description: 'Welcome new clients with account credentials and portal access link',
  },
  {
    id: 'account-details',
    name: '2. Account Details & Credentials',
    category: 'credentials',
    channel: 'all',
    subject: 'Your Account Details & Portal Access — {{companyName}}',
    body: `Dear {{clientName}},

Here is your official account access details for {{companyName}}:

- Account ID: {{clientId}}
- Primary Email: {{clientEmail}}
- Client Portal Link: {{loginUrl}}

Use this link to view active project proofs, review media deliverables, and complete invoice payments securely.

Thank you for partnering with {{companyName}}.`,
    description: 'Send portal login URL and official client credentials',
  },
  {
    id: 'new-project-created',
    name: '3. New Project Created',
    category: 'new_project',
    channel: 'all',
    subject: 'New Project Started: {{projectName}} (ID: {{projectId}})',
    body: `Hello {{clientName}},

A new project "{{projectName}}" (ID: {{projectId}}) has been created in your {{companyName}} account.

Service Type: {{serviceName}}

You can monitor production milestones, upload media briefs, and view live draft proofs directly inside your portal:
{{loginUrl}}

Thank you for choosing {{companyName}}!`,
    description: 'Notify client when a new project record is initiated',
  },
  {
    id: 'project-status-update',
    name: '4. Project Progress Update',
    category: 'project_update',
    channel: 'all',
    subject: 'Update on Your Project: {{projectName}}',
    body: `Hi {{clientName}},

We are pleased to share an update regarding your project "{{projectName}}" (ID: {{projectId}}).

Our production team has completed the latest editing/rendering milestone. You can review current proofs and status in your client portal:
{{loginUrl}}

Outstanding Balance: {{outstandingBalance}}

Thank you for your continued trust in {{companyName}}.`,
    description: 'Notify client when a project phase or draft milestone is updated',
  },
  {
    id: 'project-dispatch-ready',
    name: '5. Project Dispatch & Deliverables',
    category: 'dispatch',
    channel: 'all',
    subject: 'Deliverables Ready: {{projectName}}',
    body: `Great news {{clientName}}!

Your high-resolution media deliverables for "{{projectName}}" are ready in your portal.

Review & Download Link:
{{loginUrl}}

Payment Status: {{paymentStatus}}
Outstanding Balance: {{outstandingBalance}}

Thank you for partnering with {{companyName}}!`,
    description: 'Dispatch notification with link to project deliverables portal',
  },
  {
    id: 'invoice-payment-request',
    name: '6. Invoice Notification & Payment Request',
    category: 'invoice',
    channel: 'all',
    subject: 'Invoice {{invoiceNumber}} from {{companyName}} — {{invoiceAmount}}',
    body: `Hello {{clientName}},

Your invoice {{invoiceNumber}} for "{{projectName}}" has been issued.

- Total Invoice Amount: {{invoiceAmount}}
- Amount Paid: {{amountPaid}}
- Outstanding Balance: {{outstandingBalance}}
- Payment Status: {{paymentStatus}}

Pay securely online via Mobile Money, Card, or Bank transfer using the link below:
{{loginUrl}}

Thank you for your prompt payment!
{{companyName}}`,
    description: 'Send payment link and itemized invoice summary to client',
  },
  {
    id: 'payment-received-confirmation',
    name: '7. Payment Receipt & Confirmation',
    category: 'payment_confirmation',
    channel: 'all',
    subject: 'Payment Confirmed — Invoice {{invoiceNumber}} ({{amountPaid}})',
    body: `Dear {{clientName}},

Thank you! We have successfully received your payment of {{amountPaid}} for Invoice {{invoiceNumber}}.

- Project: {{projectName}}
- Total Invoice: {{invoiceAmount}}
- Remaining Balance: {{outstandingBalance}}
- Payment Status: {{paymentStatus}}

Your account balance has been updated, and your deliverables are accessible in your portal:
{{loginUrl}}

Best regards,
{{companyName}}`,
    description: 'Confirm payment receipt and update unlock status',
  },
  {
    id: 'payment-reminder-due',
    name: '8. Payment Due Reminder',
    category: 'payment_reminder',
    channel: 'all',
    subject: 'Payment Reminder: Invoice {{invoiceNumber}} — {{outstandingBalance}} Due',
    body: `Hello {{clientName}},

This is a friendly reminder regarding outstanding invoice {{invoiceNumber}} for project "{{projectName}}".

- Outstanding Balance: {{outstandingBalance}}
- Payment Status: {{paymentStatus}}

To avoid delays in final media release, please complete payment at your earliest convenience:
{{loginUrl}}

If you have already processed this payment, please disregard this notice or contact support at {{supportEmail}}.

Best regards,
{{companyName}} Billing`,
    description: 'Send polite payment reminder for pending/unpaid invoices',
  },
  {
    id: 'service-completion-ready',
    name: '9. Service Completion Notice',
    category: 'service_completion',
    channel: 'all',
    subject: 'Service Completed: {{serviceName}} for {{clientName}}',
    body: `Hello {{clientName}},

We are delighted to inform you that your requested service "{{serviceName}}" for project "{{projectName}}" has been fully completed!

All final high-definition media renders, video files, and assets are now archived and ready in your portal:
{{loginUrl}}

Thank you for trusting {{companyName}} with your digital media needs.`,
    description: 'Notify client that full service production is complete',
  },
  {
    id: 'general-announcement',
    name: '10. General Announcement & Update',
    category: 'announcement',
    channel: 'all',
    subject: 'Important Notice from {{companyName}}',
    body: `Hello {{clientName}},

This is an official update from {{companyName}} regarding your account (ID: {{clientId}}).

Please visit your client portal to review your account dashboard and active project details:
{{loginUrl}}

For any immediate inquiries, feel free to contact us at {{supportEmail}}.

Warm regards,
{{companyName}} Team`,
    description: 'General purpose announcement and broadcast template',
  },
]

export interface SubstituteParams {
  clientName?: string
  clientId?: string
  clientEmail?: string
  clientPhone?: string
  projectName?: string
  projectId?: string
  projectStatus?: string
  invoiceNumber?: string
  invoiceAmount?: string
  amountPaid?: string
  outstandingBalance?: string
  paymentStatus?: string
  serviceName?: string
  loginUrl?: string
  portalUrl?: string
  supportEmail?: string
  supportPhone?: string
  companyName?: string
}

export function substitutePlaceholders(templateText: string, params: SubstituteParams): string {
  let result = templateText || ''
  const company = params.companyName || 'LEXMEDIA.GH'
  const resolvedPortal = params.portalUrl || params.loginUrl || ''
  const mapping: Record<string, string> = {
    clientName: params.clientName || 'Valued Client',
    client_name: params.clientName || 'Valued Client',
    clientId: params.clientId || 'CLIENT',
    client_id: params.clientId || 'CLIENT',
    clientEmail: params.clientEmail || '',
    client_email: params.clientEmail || '',
    clientPhone: params.clientPhone || '',
    client_phone: params.clientPhone || '',
    projectName: params.projectName || 'Client Project',
    project_name: params.projectName || 'Client Project',
    projectId: params.projectId || 'PROJECT',
    project_id: params.projectId || 'PROJECT',
    projectStatus: params.projectStatus || 'Active',
    project_status: params.projectStatus || 'Active',
    invoiceNumber: params.invoiceNumber || 'N/A',
    invoice_number: params.invoiceNumber || 'N/A',
    invoiceAmount: params.invoiceAmount || 'GH₵0.00',
    invoice_amount: params.invoiceAmount || 'GH₵0.00',
    amountPaid: params.amountPaid || 'GH₵0.00',
    amount_paid: params.amountPaid || 'GH₵0.00',
    outstandingBalance: params.outstandingBalance || 'GH₵0.00',
    outstanding_balance: params.outstandingBalance || 'GH₵0.00',
    paymentStatus: params.paymentStatus || 'Pending',
    payment_status: params.paymentStatus || 'Pending',
    serviceName: params.serviceName || 'Digital Production',
    service_name: params.serviceName || 'Digital Production',
    loginUrl: resolvedPortal,
    login_url: resolvedPortal,
    portalUrl: resolvedPortal,
    portal_url: resolvedPortal,
    supportEmail: params.supportEmail || 'lexmedia8gh@gmail.com',
    support_email: params.supportEmail || 'lexmedia8gh@gmail.com',
    supportPhone: params.supportPhone || '',
    support_phone: params.supportPhone || '',
    companyName: company,
    company_name: company,
  }

  for (const [key, value] of Object.entries(mapping)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi')
    result = result.replace(regex, value)
  }

  return result
}

export function validateTemplateVariables(
  content: string,
  providedVariables: SubstituteParams
): { isComplete: boolean; unpopulatedVariables: string[] } {
  if (!content) return { isComplete: true, unpopulatedVariables: [] }
  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g
  const unpopulated = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const varName = match[1]
    const val = (providedVariables as any)?.[varName]
    if (val === undefined || val === null || val === '') {
      unpopulated.add(varName)
    }
  }

  return {
    isComplete: unpopulated.size === 0,
    unpopulatedVariables: Array.from(unpopulated),
  }
}

