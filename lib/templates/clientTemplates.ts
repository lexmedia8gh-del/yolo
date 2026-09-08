// ============================================================
// Client Information Intake Templates & Utilities
// ============================================================

export interface ClientTemplate {
  id: string
  title: string
  category: 'intake' | 'followup' | 'brief' | 'billing' | 'custom'
  description: string
  text: string
  isCustom?: boolean
}

export const DEFAULT_CLIENT_TEMPLATES: ClientTemplate[] = [
  {
    id: 'standard-intake',
    title: 'Standard Client Intake Form',
    category: 'intake',
    description: 'Comprehensive form for collecting client contact, business, project scope, and budget.',
    text: `👋 Hello! Thank you for reaching out to us.

To help us set up your project and prepare an accurate proposal, please share the following details:

1. Full Name:
2. Business / Brand Name:
3. Email Address (for official files & invoices):
4. Phone / WhatsApp Number:
5. Location / Address (City, Country):
6. Service Needed (e.g., Brand Identity, Flyer, Social Media, Website, Video):
7. Project Overview & Deliverables:
8. Target Deadline:
9. Estimated Budget:

Looking forward to working with you! 🚀`,
  },
  {
    id: 'quick-contact-collect',
    title: 'Quick Contact Information Check',
    category: 'intake',
    description: 'Quick 4-point questionnaire to collect contact details for profile setup.',
    text: `Hi there! 👋

Before we finalize your client account and project schedule, please confirm your contact details:

• Full Name:
• Company / Brand Name:
• Email Address:
• Phone & WhatsApp Number:
• Location:

Thank you!`,
  },
  {
    id: 'project-scope-brief',
    title: 'Creative Project Scope Brief',
    category: 'brief',
    description: 'In-depth brief to capture creative direction, references, style, and timeline.',
    text: `Hello! 🎨

To help us bring your creative vision to life, please provide a brief overview of your project:

1. Project Title / Objective:
2. Target Audience:
3. Desired Style & Colors (minimal, bold, luxury, playful, etc.):
4. Any sample links or reference files you love:
5. Key Deliverables (e.g., Instagram posts, print banners, vector logo):
6. Expected Completion Date:

We will review your brief and share the kickoff timeline immediately!`,
  },
  {
    id: 'missing-info-followup',
    title: 'Missing Information Follow-up',
    category: 'followup',
    description: 'Polite reminder message to request specific missing fields from a client.',
    text: `Hi {clientName}! 👋

We are currently setting up your client file and project details in our system.

We noticed we still need a few details to complete your profile:
{missingFields}

Could you please send these over when you have a moment? Thank you!`,
  },
  {
    id: 'billing-invoice-request',
    title: 'Billing & Invoice Details Request',
    category: 'billing',
    description: 'Request formal invoicing details before issuing payment links or invoice receipts.',
    text: `Hi {clientName}! 👋

We are generating your official project invoice and payment link. Please confirm your billing details:

• Official Invoice Name (Personal or Company):
• Billing Address / City:
• Email for payment confirmation & receipt:
• Phone number:

Thank you!`,
  },
]

const LOCAL_STORAGE_KEY = 'ctrlroom_custom_client_templates'

export function getStoredClientTemplates(): ClientTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_CLIENT_TEMPLATES

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return DEFAULT_CLIENT_TEMPLATES
    const customTemplates: ClientTemplate[] = JSON.parse(raw)
    return [...DEFAULT_CLIENT_TEMPLATES, ...customTemplates]
  } catch (err) {
    console.error('Error loading custom templates from localStorage:', err)
    return DEFAULT_CLIENT_TEMPLATES
  }
}

export function saveCustomTemplate(template: Omit<ClientTemplate, 'id' | 'isCustom'>): ClientTemplate {
  const newTemplate: ClientTemplate = {
    ...template,
    id: `custom-${Date.now()}`,
    isCustom: true,
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      const existing: ClientTemplate[] = raw ? JSON.parse(raw) : []
      const updated = [newTemplate, ...existing]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
    } catch (err) {
      console.error('Error saving custom template to localStorage:', err)
    }
  }

  return newTemplate
}

export function deleteCustomTemplate(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return
    const existing: ClientTemplate[] = JSON.parse(raw)
    const updated = existing.filter((t) => t.id !== id)
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Error deleting custom template:', err)
  }
}

export function formatTemplateForClient(
  templateText: string,
  variables: { clientName?: string; missingFields?: string[]; companyName?: string }
): string {
  let result = templateText
  const name = variables.clientName || 'there'
  result = result.replace(/{clientName}/g, name)

  if (variables.missingFields && variables.missingFields.length > 0) {
    const fieldsList = variables.missingFields.map((f) => `• ${f}`).join('\n')
    result = result.replace(/{missingFields}/g, fieldsList)
  } else {
    result = result.replace(/{missingFields}/g, '• Email address\n• Phone / WhatsApp number\n• Location / Address')
  }

  return result
}

export const CLIENT_TEMPLATES = DEFAULT_CLIENT_TEMPLATES

