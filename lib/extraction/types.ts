export type ExtractionConfidence = 'explicit' | 'inferred' | 'uncertain' | 'missing'

export interface FieldConfidenceMeta {
  confidence: ExtractionConfidence
  sourceSnippet?: string
  labelUsed?: string
}

export interface ExtractedEntity {
  name: string
  roleOrRelation?: string
  company?: string
  email?: string
  phone?: string
  whatsappNumber?: string
  address?: string
  notes?: string
  isPrimary?: boolean
}

export type FinancialCategory =
  | 'budget'
  | 'total'
  | 'price'
  | 'deposit'
  | 'balance'
  | 'discount'
  | 'tax'
  | 'unit_price'
  | 'other'

export interface ExtractedFinancialItem {
  raw: string
  normalizedAmount: number | null
  currency: string
  isPercentage?: boolean
  category: FinancialCategory
  context?: string
  confidence: ExtractionConfidence
}

export type DateCategory =
  | 'deadline'
  | 'event_date'
  | 'start_date'
  | 'invoice_date'
  | 'date'

export interface ExtractedDateItem {
  raw: string
  normalizedDate?: string
  category: DateCategory
  context?: string
}

export interface ExtractionConflict {
  field: string
  label: string
  values: string[]
  description: string
}

export interface ExtractionPipelineReport {
  stagesCompleted: string[]
  segmentCount: number
  chunkCount: number
  totalDetailsIdentified: number
  uncertainFieldsCount: number
  conflictsCount: number
  unmatchedPreservedCount: number
  completenessScore: number
  usedAiMultiPass: boolean
}

export interface ParsedClientResponse {
  // Core backward-compatible fields
  fullName: string
  email: string
  phone: string
  whatsappNumber: string
  company: string
  address: string
  serviceOrProject: string
  notes: string
  budget?: string
  timeline?: string
  availableFields: string[]
  missingFields: string[]
  usefulDetails: string[]

  // Additive comprehensive extraction fields
  originalText?: string
  additionalInformation?: string
  alternateEmails?: string[]
  alternatePhones?: string[]
  entities?: ExtractedEntity[]
  financials?: ExtractedFinancialItem[]
  quantitiesAndMeasurements?: string[]
  datesAndDeadlines?: ExtractedDateItem[]
  referenceNumbers?: string[]
  urlsAndHandles?: string[]
  servicesAndProducts?: string[]
  statusAndPriority?: {
    status?: string
    priority?: string
    paymentStatus?: string
  }
  fieldMeta?: Record<string, FieldConfidenceMeta>
  conflicts?: ExtractionConflict[]
  warnings?: string[]
  pipelineReport?: ExtractionPipelineReport
}

export const CORE_CLIENT_FIELD_DEFS: Array<{
  key: 'fullName' | 'phone' | 'whatsappNumber' | 'email' | 'company' | 'address' | 'serviceOrProject'
  label: string
}> = [
  { key: 'fullName', label: 'Client Name' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'whatsappNumber', label: 'WhatsApp Number' },
  { key: 'email', label: 'Email Address' },
  { key: 'company', label: 'Company / Brand' },
  { key: 'address', label: 'Location / Address' },
  { key: 'serviceOrProject', label: 'Service or Project' },
]

export function recomputeFieldAvailability(data: ParsedClientResponse): ParsedClientResponse {
  const availableFields: string[] = []
  const missingFields: string[] = []

  for (const { key, label } of CORE_CLIENT_FIELD_DEFS) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) {
      availableFields.push(label)
    } else {
      missingFields.push(label)
    }
  }

  return {
    ...data,
    availableFields,
    missingFields,
  }
}

/**
 * Composes a complete, non-destructive notes block for persisting on a Client record
 * so zero extracted details (services, financials, deadlines, quantities, secondary contacts,
 * references, URLs, or unmatched notes) are lost during Quick Create or Apply to Form.
 */
export function composeComprehensiveClientNotes(data: ParsedClientResponse): string {
  const sections: string[] = []
  const baseNotes = (data.notes || '').trim()
  const lowerBase = baseNotes.toLowerCase()

  const alreadyIncluded = (snippet: string): boolean => {
    const clean = snippet.trim().toLowerCase()
    if (!clean) return true
    return lowerBase.includes(clean)
  }

  if (baseNotes) {
    sections.push(baseNotes)
  }

  const structuredLines: string[] = []

  if (data.serviceOrProject?.trim() && !alreadyIncluded(data.serviceOrProject)) {
    structuredLines.push(`Requested Service / Project: ${data.serviceOrProject.trim()}`)
  }

  if (data.servicesAndProducts && data.servicesAndProducts.length > 1) {
    const missingServices = data.servicesAndProducts.filter((s) => !alreadyIncluded(s))
    if (missingServices.length > 0) {
      structuredLines.push(`Deliverables / Items: ${missingServices.join('; ')}`)
    }
  }

  if (data.budget?.trim() && !alreadyIncluded(data.budget)) {
    structuredLines.push(`Budget / Pricing: ${data.budget.trim()}`)
  }

  if (data.financials && data.financials.length > 0) {
    const extraFinancials = data.financials
      .map((f) => {
        const label = f.category !== 'other' ? `${f.category.replace('_', ' ')}: ` : ''
        return `${label}${f.raw}${f.context ? ` (${f.context})` : ''}`
      })
      .filter((item) => !alreadyIncluded(item) && !alreadyIncluded(item.split('(')[0]))
    if (extraFinancials.length > 0) {
      structuredLines.push(`Financial Breakdown: ${extraFinancials.join(' | ')}`)
    }
  }

  if (data.timeline?.trim() && !alreadyIncluded(data.timeline)) {
    structuredLines.push(`Timeline / Deadline: ${data.timeline.trim()}`)
  }

  if (data.datesAndDeadlines && data.datesAndDeadlines.length > 0) {
    const extraDates = data.datesAndDeadlines
      .map((d) => `${d.raw}${d.normalizedDate ? ` [${d.normalizedDate}]` : ''}${d.context ? ` (${d.context})` : ''}`)
      .filter((d) => !alreadyIncluded(d.split('[')[0]))
    if (extraDates.length > 0) {
      structuredLines.push(`Dates Mentioned: ${extraDates.join(' | ')}`)
    }
  }

  if (data.quantitiesAndMeasurements && data.quantitiesAndMeasurements.length > 0) {
    const extraSpecs = data.quantitiesAndMeasurements.filter((q) => !alreadyIncluded(q))
    if (extraSpecs.length > 0) {
      structuredLines.push(`Quantities & Specifications: ${extraSpecs.join('; ')}`)
    }
  }

  if (data.alternateEmails && data.alternateEmails.length > 0) {
    const extraEmails = data.alternateEmails.filter((e) => !alreadyIncluded(e))
    if (extraEmails.length > 0) {
      structuredLines.push(`Additional Emails: ${extraEmails.join(', ')}`)
    }
  }

  if (data.alternatePhones && data.alternatePhones.length > 0) {
    const extraPhones = data.alternatePhones.filter((p) => !alreadyIncluded(p))
    if (extraPhones.length > 0) {
      structuredLines.push(`Additional Phone Numbers: ${extraPhones.join(', ')}`)
    }
  }

  if (data.entities && data.entities.length > 1) {
    const secondary = data.entities.filter(
      (ent) => ent.name && ent.name.trim().toLowerCase() !== data.fullName.trim().toLowerCase()
    )
    for (const ent of secondary) {
      if (!alreadyIncluded(ent.name)) {
        const parts = [
          ent.name,
          ent.roleOrRelation ? `(${ent.roleOrRelation})` : '',
          ent.company ? `at ${ent.company}` : '',
          ent.phone ? `Tel: ${ent.phone}` : '',
          ent.email ? `Email: ${ent.email}` : '',
        ].filter(Boolean)
        structuredLines.push(`Related Contact / Entity: ${parts.join(' ')}`)
      }
    }
  }

  if (data.referenceNumbers && data.referenceNumbers.length > 0) {
    const extraRefs = data.referenceNumbers.filter((r) => !alreadyIncluded(r))
    if (extraRefs.length > 0) {
      structuredLines.push(`Reference / IDs: ${extraRefs.join(', ')}`)
    }
  }

  if (data.urlsAndHandles && data.urlsAndHandles.length > 0) {
    const extraUrls = data.urlsAndHandles.filter((u) => !alreadyIncluded(u))
    if (extraUrls.length > 0) {
      structuredLines.push(`Links & Handles: ${extraUrls.join(', ')}`)
    }
  }

  if (data.statusAndPriority) {
    const sp = [
      data.statusAndPriority.priority ? `Priority: ${data.statusAndPriority.priority}` : '',
      data.statusAndPriority.paymentStatus ? `Payment: ${data.statusAndPriority.paymentStatus}` : '',
      data.statusAndPriority.status ? `Status: ${data.statusAndPriority.status}` : '',
    ].filter((s) => s && !alreadyIncluded(s))
    if (sp.length > 0) {
      structuredLines.push(sp.join(' | '))
    }
  }

  if (structuredLines.length > 0) {
    sections.push(structuredLines.join('\n'))
  }

  const additional = (data.additionalInformation || '').trim()
  if (additional && !alreadyIncluded(additional)) {
    sections.push(`Additional Preserved Details:\n${additional}`)
  }

  return sections.filter(Boolean).join('\n\n').trim()
}
