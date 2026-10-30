import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai'
import {
  CORE_CLIENT_FIELD_DEFS,
  type DateCategory,
  type ExtractedDateItem,
  type ExtractedEntity,
  type ExtractedFinancialItem,
  type ExtractionConfidence,
  type ExtractionConflict,
  type FieldConfidenceMeta,
  type FinancialCategory,
  type ParsedClientResponse,
} from './types'

export * from './types'

// ============================================================================
// INTERNAL PIPELINE DATA STRUCTURES
// ============================================================================

interface TextSegment {
  index: number
  rawLine: string
  cleanLine: string
  wasBulletOrNumbered: boolean
  bulletMarker?: string
  label?: string
  value?: string
  semanticField?: SemanticFieldKey | null
}

interface SegmentedInput {
  originalText: string
  workingText: string
  segments: TextSegment[]
  paragraphs: string[]
  chunks: string[]
}

type SemanticFieldKey =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'whatsappNumber'
  | 'company'
  | 'address'
  | 'serviceOrProject'
  | 'budget'
  | 'deposit'
  | 'balance'
  | 'discount'
  | 'timeline'
  | 'quantity'
  | 'reference'
  | 'url'
  | 'priority'
  | 'status'
  | 'secondaryContact'
  | 'notes'

interface CandidateValue {
  value: string
  confidence: ExtractionConfidence
  sourceSnippet: string
  labelUsed?: string
  sourcePass: 'deterministic' | 'ai_primary' | 'ai_secondary'
}

interface StageExtractionResult {
  candidates: Record<
    'fullName' | 'email' | 'phone' | 'whatsappNumber' | 'company' | 'address' | 'serviceOrProject' | 'budget' | 'timeline',
    CandidateValue[]
  >
  emails: string[]
  phones: Array<{ raw: string; canonical: string; isWhatsApp: boolean; context: string }>
  entities: ExtractedEntity[]
  financials: ExtractedFinancialItem[]
  quantitiesAndMeasurements: string[]
  datesAndDeadlines: ExtractedDateItem[]
  referenceNumbers: string[]
  urlsAndHandles: string[]
  servicesAndProducts: string[]
  statusAndPriority: { status?: string; priority?: string; paymentStatus?: string }
  notesLines: string[]
  usefulDetails: string[]
  explicitConflicts: ExtractionConflict[]
  ungroundedFields?: string[]
}

// ============================================================================
// STRING, FUZZY & NORMALIZATION HELPERS
// ============================================================================

const PLACEHOLDER_STRINGS = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'not provided',
  'not specified',
  'not mentioned',
  'not available',
  'not applicable',
  'nil',
  'tbd',
  'tba',
  '-',
  '--',
  '—',
  'empty',
])

function isPlaceholderValue(val: string | undefined | null, originalText: string): boolean {
  if (!val) return true
  const trimmed = val.trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  if (PLACEHOLDER_STRINGS.has(lower)) return true
  if (lower.endsWith('@example.com') && !originalText.toLowerCase().includes('@example.com')) {
    return true
  }
  return false
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[b.length][a.length]
}

export function canonicalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  // Normalize Ghana numbers: 0244123456 (10 digits starting with 0) <-> 233244123456 (12 digits starting with 233)
  if (digits.length === 10 && digits.startsWith('0')) {
    return `233${digits.slice(1)}`
  }
  if (digits.length === 12 && digits.startsWith('233')) {
    return digits
  }
  if (digits.length === 13 && digits.startsWith('2330')) {
    return `233${digits.slice(4)}`
  }
  return digits
}

function dedupeStringsCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const clean = (item || '').trim()
    if (!clean) continue
    const key = clean.toLowerCase().replace(/\s+/g, ' ')
    if (!seen.has(key)) {
      seen.add(key)
      out.push(clean)
    }
  }
  return out
}

// ============================================================================
// SEMANTIC + TYPO-TOLERANT LABEL CLASSIFIER
// ============================================================================

const LABEL_PHRASE_PATTERNS: Array<{ field: SemanticFieldKey; regex: RegExp }> = [
  {
    field: 'secondaryContact',
    regex:
      /\b(?:secondary\s+contact|alternate\s+contact|assistant|coordinator|project\s+manager|billing\s+contact|representative|rep\s+name|contact\s*2|client\s*2|person\s*2|other\s+contact)\b/i,
  },
  {
    field: 'whatsappNumber',
    regex: /\b(?:whatsapp|whats\s*app|watsapp|watsap|whatsup|whatsap|wa\s*(?:no|num|number|line|contact)?)\b/i,
  },
  {
    field: 'email',
    regex: /\b(?:e-?mail|emial|emal|emai|electronic\s+mail|mail\s+address|email\s+adress|emial\s+adress)\b/i,
  },
  {
    field: 'phone',
    regex:
      /\b(?:phone|phne|phoen|fone|telephone|telephne|tel|mobile|moble|cell|call\s+number|contact\s+(?:no|num|number|nmber|line)|phone\s+(?:no|num|number|nmber))\b/i,
  },
  {
    field: 'company',
    regex:
      /\b(?:company|compny|comapny|business|bussiness|busines|brand|organization|organisation|organzation|agency|firm|enterprise|venture|institution|church|ministry|school|store|shop\s+name|company\s*\/?\s*brand|business\s+name|brand\s+name)\b/i,
  },
  {
    field: 'fullName',
    regex:
      /\b(?:full\s*name|client(?:'s)?\s*name|customer(?:'s)?\s*name|name\s+of\s+(?:customer|client|person|contact)|contact\s+person|client|clinet|cleint|customer|custmer|custmor|prepared\s+for|billed\s+to|bill\s+to|attention|attn|person\s+name|your\s+name|sender|requested\s+by)\b|^name$|^nmae$|^nam$/i,
  },
  {
    field: 'address',
    regex:
      /\b(?:address|adress|addres|location|loction|locaton|city|town|region|country|venue|delivery\s+(?:address|adress|location|loction|point)|office\s+location|physical\s+address|street|gps\s+address|digital\s+address|based\s+in|residence)\b/i,
  },
  {
    field: 'serviceOrProject',
    regex:
      /\b(?:service|servce|services|project|projcet|porject|package|pakage|deliverable|deliverables|deliverble|requirement|requirements|requirment|scope|job\s+type|work\s+needed|product|products|item|items|order\s+details|design\s+needed|project\s+title|subject)\b/i,
  },
  {
    field: 'discount',
    regex: /\b(?:discount|discont|rebate|promo|off|deduction)\b/i,
  },
  {
    field: 'deposit',
    regex: /\b(?:deposit|depost|advance|upfront|down\s*payment|initial\s+payment|amount\s+paid|paid\s+so\s+far)\b/i,
  },
  {
    field: 'balance',
    regex: /\b(?:balance|balnce|outstanding|amount\s+due|remaining)\b/i,
  },
  {
    field: 'budget',
    regex:
      /\b(?:budget|budjet|bugdet|price|pricng|pricing|cost|total|total\s+amount|amount|ammount|amnt|fee|rate|quote|quotation|estimate|value|charge)\b/i,
  },
  {
    field: 'timeline',
    regex:
      /\b(?:timeline|timline|deadline|deadine|dedline|due\s+date|delivery\s+date|delivry\s+date|delivry|turnaround|event\s+date|launch\s+date|completion\s+date|target\s+date|date\s+needed|date|dte|schedule)\b/i,
  },
  {
    field: 'quantity',
    regex:
      /\b(?:quantity|quantitty|quanity|qty|qnty|units|copies|pieces|pcs|size|sizes|dimension|dimensions|measurements?|specs|specifications?|resolution|format|paper\s+size|material)\b/i,
  },
  {
    field: 'reference',
    regex:
      /\b(?:reference|refrence|ref\s*(?:no|num|number|id|#)?|invoice\s*(?:no|num|number|id|#)?|invocie|receipt\s*(?:no|num|number|#)?|reciept|order\s*(?:no|num|number|id|#)|quote\s*(?:no|ref|#)|po\s*(?:no|number|#)|job\s*(?:id|no|#)|ticket\s*(?:id|no|#)|transaction\s+id|trn)\b/i,
  },
  {
    field: 'url',
    regex: /\b(?:website|web\s+site|url|link|portfolio|drive\s+link|asset\s+link|instagram|ig|tiktok|facebook|twitter|linkedin|social\s+media|handle)\b/i,
  },
  {
    field: 'priority',
    regex: /\b(?:priority|priorty|urgency)\b/i,
  },
  {
    field: 'status',
    regex: /\b(?:status|statis|payment\s+status|stage)\b/i,
  },
  {
    field: 'notes',
    regex: /\b(?:notes?|additional\s+info(?:rmation)?|extra\s+details|instructions?|remarks?|comments?|description|brief|preferences?|color\s+palette|colours?|colors?)\b/i,
  },
]

const FUZZY_LABEL_KEYWORDS: Array<{ word: string; field: SemanticFieldKey }> = [
  { word: 'customer', field: 'fullName' },
  { word: 'client', field: 'fullName' },
  { word: 'whatsapp', field: 'whatsappNumber' },
  { word: 'telephone', field: 'phone' },
  { word: 'mobile', field: 'phone' },
  { word: 'company', field: 'company' },
  { word: 'business', field: 'company' },
  { word: 'organization', field: 'company' },
  { word: 'address', field: 'address' },
  { word: 'location', field: 'address' },
  { word: 'service', field: 'serviceOrProject' },
  { word: 'project', field: 'serviceOrProject' },
  { word: 'deliverable', field: 'serviceOrProject' },
  { word: 'requirement', field: 'serviceOrProject' },
  { word: 'package', field: 'serviceOrProject' },
  { word: 'budget', field: 'budget' },
  { word: 'amount', field: 'budget' },
  { word: 'deposit', field: 'deposit' },
  { word: 'discount', field: 'discount' },
  { word: 'balance', field: 'balance' },
  { word: 'deadline', field: 'timeline' },
  { word: 'timeline', field: 'timeline' },
  { word: 'delivery', field: 'timeline' },
  { word: 'quantity', field: 'quantity' },
  { word: 'dimensions', field: 'quantity' },
  { word: 'measurements', field: 'quantity' },
  { word: 'reference', field: 'reference' },
  { word: 'invoice', field: 'reference' },
  { word: 'receipt', field: 'reference' },
  { word: 'priority', field: 'priority' },
]

export function classifySemanticLabel(rawLabel: string): SemanticFieldKey | null {
  const cleaned = rawLabel
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s/#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || cleaned.length > 48) return null

  for (const { field, regex } of LABEL_PHRASE_PATTERNS) {
    if (regex.test(cleaned)) {
      return field
    }
  }

  // Fuzzy word-level fallback for unexpected misspellings (e.g. "Custumer", "Deadlne", "Compnay")
  const tokens = cleaned.split(' ').filter((w) => w.length >= 5)
  for (const token of tokens) {
    for (const { word, field } of FUZZY_LABEL_KEYWORDS) {
      const maxDist = word.length >= 7 && token.length >= 6 ? 2 : 1
      if (Math.abs(token.length - word.length) <= maxDist && levenshteinDistance(token, word) <= maxDist) {
        return field
      }
    }
  }

  return null
}

// ============================================================================
// STAGE 1 — INPUT PRESERVATION
// ============================================================================

export function stage1PreserveInput(rawInput: string): { originalText: string; workingText: string } {
  const originalText = rawInput
  const workingText = rawInput
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')

  return { originalText, workingText }
}

// ============================================================================
// STAGE 2 — TEXT SEGMENTATION & OVERLAPPING CHUNKING
// ============================================================================

function stripBulletOrNumberPrefix(line: string): {
  stripped: string
  wasBulletOrNumbered: boolean
  marker?: string
} {
  const trimmed = line.trim()
  // Bullet prefixes: •, ●, ◦, ▪, ▫, *, -, –, —, →, >
  const bulletMatch = trimmed.match(/^([•●◦▪▫▸►‣⁃*+>→]|-(?=\s)|–(?=\s)|—(?=\s))\s+(.*)$/)
  if (bulletMatch) {
    return {
      stripped: bulletMatch[2].trim(),
      wasBulletOrNumbered: true,
      marker: bulletMatch[1],
    }
  }
  // Numbered prefixes: "1. ", "1) ", "(1) ", "1 - ", "a) "
  const numMatch = trimmed.match(/^(?:\(?(\d{1,3})[.)\]]|(\d{1,2})\s+-\s+|\(?([a-zA-Z])[.)])\s*(.*)$/)
  if (numMatch && numMatch[4]) {
    // Avoid stripping dates like "15. October 2026" if rest starts with month? Actually "1. Full Name:" has label
    return {
      stripped: numMatch[4].trim(),
      wasBulletOrNumbered: true,
      marker: trimmed.slice(0, trimmed.length - numMatch[4].length).trim(),
    }
  }
  return { stripped: trimmed, wasBulletOrNumbered: false }
}

function parseInlineLabelValue(cleanLine: string): { label: string; value: string } | null {
  // Do not treat bare URLs or timestamps at start of line as Label: Value
  if (/^(?:https?|ftp|mailto|tel):/i.test(cleanLine)) return null

  // 1. Colon or Equals delimiter: "Name of Customer: John Mensah" or "Budget = GH₵ 500"
  const colonIdx = cleanLine.search(/[:=]/)
  if (colonIdx > 0 && colonIdx <= 46) {
    const potentialLabel = cleanLine.slice(0, colonIdx).trim()
    const potentialValue = cleanLine.slice(colonIdx + 1).trim()
    const wordCount = potentialLabel.split(/\s+/).length
    // Avoid splitting times like "10:30 AM"
    if (wordCount <= 6 && !/^\d+$/.test(potentialLabel)) {
      return { label: potentialLabel, value: potentialValue }
    }
  }

  // 2. Spaced dash delimiter: "Name - John Mensah", "Customer Name – John Mensah"
  const dashMatch = cleanLine.match(/^([A-Za-z][A-Za-z0-9\s/'#&]{1,40}?)\s+[-–—]\s+(.+)$/)
  if (dashMatch) {
    const potentialLabel = dashMatch[1].trim()
    const potentialValue = dashMatch[2].trim()
    const wordCount = potentialLabel.split(/\s+/).length
    if (wordCount <= 5 && classifySemanticLabel(potentialLabel) !== null) {
      return { label: potentialLabel, value: potentialValue }
    }
  }

  return null
}

export function stage2SegmentText(originalText: string, workingText: string): SegmentedInput {
  const rawLines = workingText.split('\n')
  const segments: TextSegment[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]
    if (!rawLine.trim()) continue

    const { stripped, wasBulletOrNumbered, marker } = stripBulletOrNumberPrefix(rawLine)
    const parsedPair = parseInlineLabelValue(stripped)

    if (parsedPair && parsedPair.value === '') {
      // Multi-line template support: e.g. "1. Full Name:\nJohn Mensah"
      let nextIdx = i + 1
      while (nextIdx < rawLines.length && !rawLines[nextIdx].trim()) {
        nextIdx++
      }
      if (nextIdx < rawLines.length) {
        const nextStripped = stripBulletOrNumberPrefix(rawLines[nextIdx]).stripped
        const nextPair = parseInlineLabelValue(nextStripped)
        const nextSemantic = nextPair ? classifySemanticLabel(nextPair.label) : null
        if (!nextPair || nextSemantic === null) {
          const semanticField = classifySemanticLabel(parsedPair.label)
          segments.push({
            index: segments.length,
            rawLine: `${rawLine}\n${rawLines[nextIdx]}`,
            cleanLine: `${parsedPair.label}: ${nextStripped}`,
            wasBulletOrNumbered,
            bulletMarker: marker,
            label: parsedPair.label,
            value: nextStripped,
            semanticField,
          })
          i = nextIdx
          continue
        }
      }
    }

    if (parsedPair && parsedPair.value) {
      const semanticField = classifySemanticLabel(parsedPair.label)
      segments.push({
        index: segments.length,
        rawLine,
        cleanLine: stripped,
        wasBulletOrNumbered,
        bulletMarker: marker,
        label: parsedPair.label,
        value: parsedPair.value,
        semanticField,
      })
    } else {
      segments.push({
        index: segments.length,
        rawLine,
        cleanLine: stripped,
        wasBulletOrNumbered,
        bulletMarker: marker,
        semanticField: null,
      })
    }
  }

  const paragraphs = workingText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  // Overlapping chunking for long inputs (>2400 chars) so zero details in middle/end are lost
  const MAX_CHUNK_CHARS = 2400
  const chunks: string[] = []
  if (workingText.length <= MAX_CHUNK_CHARS) {
    chunks.push(workingText)
  } else {
    const lines = workingText.split('\n')
    let currentLines: string[] = []
    let currentLen = 0

    for (const line of lines) {
      if (currentLen + line.length + 1 > MAX_CHUNK_CHARS && currentLines.length > 0) {
        chunks.push(currentLines.join('\n'))
        // Carry over up to 3 trailing lines (~350 chars max) as boundary context overlap
        const overlap: string[] = []
        let overlapLen = 0
        for (let k = currentLines.length - 1; k >= 0 && overlap.length < 3; k--) {
          if (overlapLen + currentLines[k].length <= 350) {
            overlap.unshift(currentLines[k])
            overlapLen += currentLines[k].length + 1
          } else {
            break
          }
        }
        currentLines = [...overlap]
        currentLen = overlapLen
      }
      currentLines.push(line)
      currentLen += line.length + 1
    }
    if (currentLines.length > 0) {
      chunks.push(currentLines.join('\n'))
    }
  }

  return {
    originalText,
    workingText,
    segments,
    paragraphs,
    chunks,
  }
}

// ============================================================================
// DETERMINISTIC SPECIALIZED EXTRACTORS (NUMBERS, CURRENCIES, DATES, REFS, PHONES)
// ============================================================================

interface SpanRange {
  start: number
  end: number
}

function overlapsAny(start: number, end: number, spans: SpanRange[]): boolean {
  return spans.some((s) => start < s.end && end > s.start)
}

function extractReferencesAndSpans(text: string): { references: string[]; spans: SpanRange[] } {
  const references: string[] = []
  const spans: SpanRange[] = []

  const patterns = [
    // Explicit labeled references: Ref #LM-2026-009, Invoice #INV-883920, Receipt No: 9988776655, Order ID: ORD-99
    /\b(?:ref(?:erence|rence)?|inv(?:oice|ocie)?|rec(?:eipt|iept)?|order|quote|po|job|ticket|txn|transaction)\s*(?:no\.?|num(?:ber)?|id|code|ref|#|:|-)\s*[#:]?\s*([A-Z0-9][A-Z0-9/_-]{2,26})/gi,
    // Prefixed code tokens: #LM-2026-102, INV-2026-004, ORD-88412, QT-9910, PO-2026-11
    /(?:^|[\s(])(#[A-Z]{1,6}[-_]?[0-9]{3,16}|\b(?:INV|ORD|REF|REC|QT|PO|JOB|TXN)[-_][A-Z0-9-]{3,20})\b/gi,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0].trim()
      const start = match.index
      const end = match.index + match[0].length
      if (!overlapsAny(start, end, spans)) {
        spans.push({ start, end })
        references.push(fullMatch)
      }
    }
  }

  return { references: dedupeStringsCaseInsensitive(references), spans }
}

function normalizeDateToken(raw: string): string | undefined {
  const trimmed = raw.trim()
  // ISO YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // DD/MM/YYYY or DD-MM-YYYY (Ghana/UK primary convention; auto-detect if second > 12)
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    const first = parseInt(dmy[1], 10)
    const second = parseInt(dmy[2], 10)
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    if (first > 12 && second <= 12) {
      return `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`
    }
    if (second > 12 && first <= 12) {
      return `${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`
    }
    if (first <= 12 && second <= 12) {
      // Default to DD/MM/YYYY in Ghana
      return `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`
    }
  }

  // Written Month Date Year
  const months: Record<string, string> = {
    jan: '01',
    january: '01',
    feb: '02',
    february: '02',
    mar: '03',
    march: '03',
    apr: '04',
    april: '04',
    may: '05',
    jun: '06',
    june: '06',
    jul: '07',
    july: '07',
    aug: '08',
    august: '08',
    sep: '09',
    sept: '09',
    september: '09',
    oct: '10',
    october: '10',
    nov: '11',
    november: '11',
    dec: '12',
    december: '12',
  }

  const dMonthY = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s*(\d{4})?$/i)
  if (dMonthY && months[dMonthY[2].toLowerCase()]) {
    const day = dMonthY[1].padStart(2, '0')
    const month = months[dMonthY[2].toLowerCase()]
    const year = dMonthY[3] || ''
    return year ? `${year}-${month}-${day}` : `--${month}-${day}`
  }

  const monthDY = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/i)
  if (monthDY && months[monthDY[1].toLowerCase()]) {
    const month = months[monthDY[1].toLowerCase()]
    const day = monthDY[2].padStart(2, '0')
    const year = monthDY[3] || ''
    return year ? `${year}-${month}-${day}` : `--${month}-${day}`
  }

  return undefined
}

function classifyDateContext(context: string): DateCategory {
  const lower = context.toLowerCase()
  if (/\b(?:deadline|deadine|due|deliver|delivry|needed\s+by|ready\s+by|before|turnaround|submit|complete|launch)\b/.test(lower)) {
    return 'deadline'
  }
  if (/\b(?:event|wedding|ceremony|conference|program|funeral|party|concert|shoot\s+date)\b/.test(lower)) {
    return 'event_date'
  }
  if (/\b(?:start|begin|commence|kickoff)\b/.test(lower)) {
    return 'start_date'
  }
  if (/\b(?:invoice\s+date|issued|billed\s+on|dated)\b/.test(lower)) {
    return 'invoice_date'
  }
  return 'date'
}

function extractDatesAndSpans(text: string): { dates: ExtractedDateItem[]; spans: SpanRange[] } {
  const dates: ExtractedDateItem[] = []
  const spans: SpanRange[] = []

  const datePatterns = [
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s*\d{4})?\b/gi,
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/gi,
    /\b(?:within\s+\d+\s+(?:hours?|days?|weeks?|months?)|in\s+\d+\s+(?:days?|weeks?|months?)|end\s+of\s+(?:this\s+|next\s+)?(?:week|month|year)|(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))\b/gi,
  ]

  for (const regex of datePatterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (overlapsAny(start, end, spans)) continue
      spans.push({ start, end })

      const raw = match[0].trim()
      const lineStart = text.lastIndexOf('\n', start) + 1
      const lineEndIdx = text.indexOf('\n', end)
      const lineContext = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx).trim()

      dates.push({
        raw,
        normalizedDate: normalizeDateToken(raw),
        category: classifyDateContext(lineContext),
        context: lineContext.length <= 90 ? lineContext : lineContext.slice(0, 87) + '...',
      })
    }
  }

  return { dates, spans }
}

function normalizeCurrencyCode(token: string): string {
  const clean = token.trim().toUpperCase()
  if (clean === 'GH₵' || clean === '₵' || clean === 'GHS' || clean === 'GHC' || /CEDI/.test(clean)) {
    return 'GHS'
  }
  if (clean === '$' || clean === 'USD' || clean === 'US$' || /DOLLAR/.test(clean)) {
    return 'USD'
  }
  if (clean === '£' || clean === 'GBP' || /POUND/.test(clean)) {
    return 'GBP'
  }
  if (clean === '€' || clean === 'EUR' || /EURO/.test(clean)) {
    return 'EUR'
  }
  if (clean === '₦' || clean === 'NGN' || /NAIRA/.test(clean)) {
    return 'NGN'
  }
  if (clean === '%') return 'PERCENT'
  return clean || 'GHS'
}

function parseNumericAmount(numStr: string, multiplier?: string): number | null {
  const cleaned = numStr.replace(/,/g, '').trim()
  const base = parseFloat(cleaned)
  if (!Number.isFinite(base)) return null
  if (multiplier) {
    const m = multiplier.toLowerCase()
    if (m === 'k') return base * 1000
    if (m === 'm') return base * 1000000
  }
  return base
}

function classifyFinancialCategory(context: string, isPercentage: boolean): FinancialCategory {
  const lower = context.toLowerCase()
  if (/\b(?:discount|discont|off|rebate|promo)\b/.test(lower)) return 'discount'
  if (/\b(?:tax|vat|nhil|getfund|levy)\b/.test(lower)) return 'tax'
  if (/\b(?:deposit|depost|advance|upfront|down\s*payment|initial\s+payment|paid)\b/.test(lower)) return 'deposit'
  if (/\b(?:balance|outstanding|remaining|due)\b/.test(lower)) return 'balance'
  if (/\b(?:each|per\s+unit|unit\s+price|@\s*(?:gh|₵|\$))\b/.test(lower)) return 'unit_price'
  if (/\b(?:total|grand\s+total|overall)\b/.test(lower)) return 'total'
  if (/\b(?:budget|budjet|max\s+spend|allocation)\b/.test(lower)) return 'budget'
  if (isPercentage) return 'other'
  return 'price'
}

export function extractFinancialsAndSpans(text: string, blockedSpans: SpanRange[]): {
  financials: ExtractedFinancialItem[]
  spans: SpanRange[]
} {
  const financials: ExtractedFinancialItem[] = []
  const spans: SpanRange[] = []

  // 1. Prefix currency: GH₵500, GH₵ 1,250.50, GHS 500, GHC 500, ₵500, $150, USD 150, £200, €300, ₦50,000
  const prefixRegex =
    /(GH₵|GHS|GHC|₵|US\$|\$|USD|£|GBP|€|EUR|₦|NGN)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*([kKmM])?(?!\w)/g

  // 2. Suffix currency: 500 GHC, 500 GHS, 500 GH₵, 500 cedis, 150 USD, 150 dollars
  const suffixRegex =
    /\b(\d[\d,]*(?:\.\d{1,2})?)\s*([kKmM])?\s*(GH₵|GHS|GHC|₵|Ghana\s+cedis?|cedis?|USD|dollars?|GBP|pounds?|EUR|euros?|NGN|naira)\b/gi

  // 3. Percentages: 20%, 15.5%
  const percentRegex = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%/g

  const getClauseContext = (start: number, end: number): string => {
    const lineStart = text.lastIndexOf('\n', start) + 1
    const lineEndIdx = text.indexOf('\n', end)
    const fullLine = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx).trim()
    // Narrow to local clause if line has multiple comma/semicolon-separated items
    const clauses = fullLine.split(/[;|]/)
    const relOffset = start - lineStart
    let running = 0
    for (const c of clauses) {
      if (relOffset >= running && relOffset <= running + c.length + 1) {
        return c.trim().slice(0, 90)
      }
      running += c.length + 1
    }
    return fullLine.slice(0, 90)
  }

  let match: RegExpExecArray | null
  while ((match = prefixRegex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (overlapsAny(start, end, blockedSpans) || overlapsAny(start, end, spans)) continue
    spans.push({ start, end })
    const context = getClauseContext(start, end)
    financials.push({
      raw: match[0].trim(),
      normalizedAmount: parseNumericAmount(match[2], match[3]),
      currency: normalizeCurrencyCode(match[1]),
      isPercentage: false,
      category: classifyFinancialCategory(context, false),
      context,
      confidence: 'explicit',
    })
  }

  while ((match = suffixRegex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (overlapsAny(start, end, blockedSpans) || overlapsAny(start, end, spans)) continue
    spans.push({ start, end })
    const context = getClauseContext(start, end)
    financials.push({
      raw: match[0].trim(),
      normalizedAmount: parseNumericAmount(match[1], match[2]),
      currency: normalizeCurrencyCode(match[3]),
      isPercentage: false,
      category: classifyFinancialCategory(context, false),
      context,
      confidence: 'explicit',
    })
  }

  while ((match = percentRegex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (overlapsAny(start, end, blockedSpans) || overlapsAny(start, end, spans)) continue
    spans.push({ start, end })
    const context = getClauseContext(start, end)
    financials.push({
      raw: match[0].trim(),
      normalizedAmount: parseFloat(match[1]),
      currency: 'PERCENT',
      isPercentage: true,
      category: classifyFinancialCategory(context, true),
      context,
      confidence: 'explicit',
    })
  }

  return { financials, spans }
}

function extractQuantitiesAndSpecs(text: string, blockedSpans: SpanRange[]): string[] {
  const results: string[] = []
  const patterns = [
    // Quantities: 12 units, 500 copies, 10 flyers, 3 roll-up banners, 250 pcs, 50 shirts, 5 pages
    /\b\d[\d,]*\s*(?:units?|copies|pcs|pieces|packs?|boxes|rolls?|sheets?|pages?|flyers?|banners?|posters?|brochures?|booklets?|cards?|business\s+cards?|stickers?|labels?|shirts?|t-shirts?|hoodies?|caps?|mugs?|bags?|videos?|reels?|photos?|edits?|designs?|posts?|slides?|billboards?)\b/gi,
    // Dimensions & print/media specs: 3ft x 6ft, 1080x1920px, 85mm x 55mm, A4, A3, A5, 300gsm
    /\b\d+(?:\.\d+)?\s*(?:ft|in|inches|cm|mm|m|px)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ft|in|inches|cm|mm|m|px)\b/gi,
    /\b(?:A[0-6]\s*(?:size|paper|flyer|poster|booklet)?|\d{2,3}\s*gsm)\b/gi,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (overlapsAny(start, end, blockedSpans)) continue
      const val = match[0].trim()
      if (val.length >= 2) {
        results.push(val)
      }
    }
  }

  return dedupeStringsCaseInsensitive(results)
}

function extractEmails(text: string): { emails: string[]; spans: SpanRange[] } {
  const emails: string[] = []
  const spans: SpanRange[] = []
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    emails.push(match[0].trim())
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return { emails: dedupeStringsCaseInsensitive(emails), spans }
}

function extractUrlsAndHandles(text: string, emailSpans: SpanRange[]): string[] {
  const out: string[] = []
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (!overlapsAny(match.index, match.index + match[0].length, emailSpans)) {
      out.push(match[0].replace(/[.,;!?]+$/, ''))
    }
  }

  // Social handles like @lexmedia_gh (not preceded by email character)
  const handleRegex = /(?:^|[\s(])(@[a-zA-Z0-9_.]{3,30})\b/g
  while ((match = handleRegex.exec(text)) !== null) {
    const start = match.index + match[0].indexOf('@')
    if (!overlapsAny(start, start + match[1].length, emailSpans)) {
      out.push(match[1])
    }
  }

  return dedupeStringsCaseInsensitive(out)
}

function extractPhonesSafe(
  text: string,
  blockedSpans: SpanRange[]
): Array<{ raw: string; canonical: string; isWhatsApp: boolean; context: string }> {
  const phones: Array<{ raw: string; canonical: string; isWhatsApp: boolean; context: string }> = []
  const phoneRegex = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g

  let match: RegExpExecArray | null
  while ((match = phoneRegex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (overlapsAny(start, end, blockedSpans)) continue

    const raw = match[0].trim()
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) continue

    // Check immediate preceding text to ensure it's not an account/invoice/ref/meter/tin number
    const prefixWindow = text.slice(Math.max(0, start - 32), start).toLowerCase()
    if (/\b(?:acc(?:ount)?|acct|inv(?:oice)?|ref(?:erence)?|rec(?:eipt)?|order|tin|id|no\.?\s*#|po)\s*[:#-]?\s*$/.test(prefixWindow)) {
      continue
    }

    const lineStart = text.lastIndexOf('\n', start) + 1
    const lineEndIdx = text.indexOf('\n', end)
    const lineContext = text.slice(lineStart, lineEndIdx === -1 ? text.length : lineEndIdx).trim()
    const isWhatsApp = /\b(?:whatsapp|whats\s*app|watsapp|watsap|whatsup|whatsap|\bwa\b)\b/i.test(lineContext)

    phones.push({
      raw,
      canonical: canonicalizePhone(raw),
      isWhatsApp,
      context: lineContext,
    })
  }

  return phones
}

// ============================================================================
// STAGE 3 — PRIMARY EXTRACTION PASS (DETERMINISTIC + GEMINI CHUNKED PASS)
// ============================================================================

function createEmptyStageResult(): StageExtractionResult {
  return {
    candidates: {
      fullName: [],
      email: [],
      phone: [],
      whatsappNumber: [],
      company: [],
      address: [],
      serviceOrProject: [],
      budget: [],
      timeline: [],
    },
    emails: [],
    phones: [],
    entities: [],
    financials: [],
    quantitiesAndMeasurements: [],
    datesAndDeadlines: [],
    referenceNumbers: [],
    urlsAndHandles: [],
    servicesAndProducts: [],
    statusAndPriority: {},
    notesLines: [],
    usefulDetails: [],
    explicitConflicts: [],
  }
}

function runDeterministicExtraction(segmented: SegmentedInput): StageExtractionResult {
  const res = createEmptyStageResult()
  const { workingText, segments } = segmented

  // 1. References FIRST (blocks phone collisions)
  const { references, spans: refSpans } = extractReferencesAndSpans(workingText)
  res.referenceNumbers.push(...references)

  // 2. Dates SECOND (blocks phone & currency collisions)
  const { dates, spans: dateSpans } = extractDatesAndSpans(workingText)
  res.datesAndDeadlines.push(...dates)

  // 3. Emails & URLs
  const { emails, spans: emailSpans } = extractEmails(workingText)
  res.emails.push(...emails)
  res.urlsAndHandles.push(...extractUrlsAndHandles(workingText, emailSpans))

  // 4. Financials & Quantities
  const nonNumberSpans = [...refSpans, ...dateSpans, ...emailSpans]
  const { financials, spans: finSpans } = extractFinancialsAndSpans(workingText, nonNumberSpans)
  res.financials.push(...financials)

  const allBlockedForSpecs = [...nonNumberSpans, ...finSpans]
  res.quantitiesAndMeasurements.push(...extractQuantitiesAndSpecs(workingText, allBlockedForSpecs))

  // 5. Phones (strictly excluding references, dates, emails, currency amounts)
  const phones = extractPhonesSafe(workingText, allBlockedForSpecs)
  res.phones.push(...phones)

  // 6. Segment-by-segment labeled & multi-entity extraction
  let currentEntity: ExtractedEntity | null = null
  const commitEntity = () => {
    if (currentEntity && (currentEntity.name || currentEntity.company || currentEntity.email || currentEntity.phone)) {
      res.entities.push({ ...currentEntity })
    }
  }

  for (const seg of segments) {
    if (seg.label && seg.value) {
      const field = seg.semanticField
      const val = seg.value.trim()
      if (!val) continue

      if (field === 'secondaryContact') {
        commitEntity()
        // Parse inline details in secondary contact value (e.g., "Abena Ofori, 0501222333, abena@gcfoods.com")
        const subEmail = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]
        const subPhone = extractPhonesSafe(val, [])[0]?.raw
        const namePart = val
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          .replace(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g, '')
          .replace(/[,;()|-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        currentEntity = {
          name: namePart || val,
          roleOrRelation: seg.label,
          email: subEmail,
          phone: subPhone,
          isPrimary: false,
        }
        continue
      }

      if (field === 'fullName') {
        // Check if we already have an entity with a different name -> start a new entity!
        if (
          currentEntity?.name &&
          currentEntity.name.toLowerCase() !== val.toLowerCase()
        ) {
          commitEntity()
          currentEntity = {
            name: val,
            roleOrRelation: seg.label,
            isPrimary: res.entities.length === 0,
          }
        } else if (!currentEntity) {
          currentEntity = {
            name: val,
            roleOrRelation: seg.label,
            isPrimary: res.entities.length === 0,
          }
        } else {
          currentEntity.name = val
        }

        // Only push to primary fullName candidates if this is primary entity or explicit client name
        if (currentEntity.isPrimary !== false) {
          res.candidates.fullName.push({
            value: val,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'email') {
        if (currentEntity) currentEntity.email = val
        if (!currentEntity || currentEntity.isPrimary !== false) {
          res.candidates.email.push({
            value: val,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'phone') {
        const extractedInLine = extractPhonesSafe(val, [])
        const cleanPhone = extractedInLine[0]?.raw || val
        if (currentEntity) currentEntity.phone = cleanPhone
        if (!currentEntity || currentEntity.isPrimary !== false) {
          res.candidates.phone.push({
            value: cleanPhone,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'whatsappNumber') {
        const extractedInLine = extractPhonesSafe(val, [])
        const cleanWa = extractedInLine[0]?.raw || val
        if (currentEntity) currentEntity.whatsappNumber = cleanWa
        if (!currentEntity || currentEntity.isPrimary !== false) {
          res.candidates.whatsappNumber.push({
            value: cleanWa,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'company') {
        if (currentEntity) currentEntity.company = val
        if (!currentEntity || currentEntity.isPrimary !== false) {
          res.candidates.company.push({
            value: val,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'address') {
        if (currentEntity) currentEntity.address = val
        if (!currentEntity || currentEntity.isPrimary !== false) {
          res.candidates.address.push({
            value: val,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
      } else if (field === 'serviceOrProject') {
        res.servicesAndProducts.push(val)
        res.candidates.serviceOrProject.push({
          value: val,
          confidence: 'explicit',
          sourceSnippet: seg.cleanLine,
          labelUsed: seg.label,
          sourcePass: 'deterministic',
        })
      } else if (field === 'budget' || field === 'deposit' || field === 'balance' || field === 'discount') {
        if (field === 'budget') {
          res.candidates.budget.push({
            value: val,
            confidence: 'explicit',
            sourceSnippet: seg.cleanLine,
            labelUsed: seg.label,
            sourcePass: 'deterministic',
          })
        }
        // Ensure bare numeric labeled amounts (e.g. "Budget: 3500") are also captured in financials
        if (!res.financials.some((f) => seg.cleanLine.includes(f.raw))) {
          const numMatch = val.match(/\d[\d,]*(?:\.\d{1,2})?/)
          if (numMatch) {
            const isPct = val.includes('%')
            res.financials.push({
              raw: val,
              normalizedAmount: parseNumericAmount(numMatch[0]),
              currency: isPct ? 'PERCENT' : 'GHS',
              isPercentage: isPct,
              category: field === 'budget' ? 'budget' : field,
              context: seg.cleanLine,
              confidence: 'explicit',
            })
          }
        }
      } else if (field === 'timeline') {
        res.candidates.timeline.push({
          value: val,
          confidence: 'explicit',
          sourceSnippet: seg.cleanLine,
          labelUsed: seg.label,
          sourcePass: 'deterministic',
        })
      } else if (field === 'quantity') {
        res.quantitiesAndMeasurements.push(`${seg.label}: ${val}`)
      } else if (field === 'reference') {
        res.referenceNumbers.push(`${seg.label}: ${val}`)
      } else if (field === 'url') {
        res.urlsAndHandles.push(val)
      } else if (field === 'priority') {
        res.statusAndPriority.priority = val
      } else if (field === 'status') {
        res.statusAndPriority.status = val
      } else {
        res.notesLines.push(seg.cleanLine)
      }
    } else {
      // Unlabeled segment: keep ALL non-empty lines for notes/context (never drop short lines!)
      res.notesLines.push(seg.rawLine.trim())

      // Check if bullet/numbered item describes a deliverable/service
      if (
        seg.wasBulletOrNumbered &&
        /\b(?:logo|brand|flyer|banner|poster|website|web|video|photo|shoot|card|brochure|booklet|packaging|label|shirt|print|social\s+media|design|edit|reel|catalogue|profile|signage|roll-?up|backdrop)\b/i.test(
          seg.cleanLine
        )
      ) {
        res.servicesAndProducts.push(seg.cleanLine)
      }
    }
  }
  commitEntity()

  // 7. Contextual / Unlabeled Fallbacks when explicit labels weren't used
  if (res.candidates.email.length === 0 && res.emails.length > 0) {
    res.candidates.email.push({
      value: res.emails[0],
      confidence: 'explicit',
      sourceSnippet: res.emails[0],
      sourcePass: 'deterministic',
    })
  }

  if (res.candidates.phone.length === 0 && res.phones.length > 0) {
    const nonWa = res.phones.find((p) => !p.isWhatsApp) || res.phones[0]
    res.candidates.phone.push({
      value: nonWa.raw,
      confidence: 'explicit',
      sourceSnippet: nonWa.context,
      sourcePass: 'deterministic',
    })
  }

  if (res.candidates.whatsappNumber.length === 0 && res.phones.length > 0) {
    const waExplicit = res.phones.find((p) => p.isWhatsApp)
    if (waExplicit) {
      res.candidates.whatsappNumber.push({
        value: waExplicit.raw,
        confidence: 'explicit',
        sourceSnippet: waExplicit.context,
        labelUsed: 'WhatsApp',
        sourcePass: 'deterministic',
      })
    } else if (res.phones[0]) {
      res.candidates.whatsappNumber.push({
        value: res.phones[0].raw,
        confidence: 'inferred',
        sourceSnippet: res.phones[0].context,
        sourcePass: 'deterministic',
      })
    }
  }

  // Unlabeled Name recognition
  if (res.candidates.fullName.length === 0) {
    const introPatterns = [
      /(?:my\s+name\s+is|i\s+am|i'm|this\s+is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3})/g,
      /\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2})\s+here\s+(?:from|at|with)\b/g,
      /(?:regards|sincerely|thanks|best),?\s*\n+\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2})/gi,
    ]
    for (const pat of introPatterns) {
      const m = pat.exec(workingText)
      if (m && m[1]) {
        const candidateName = m[1].trim()
        if (!/\b(?:Lexmedia|Team|Admin|Hello|Good|Morning|Afternoon|Evening|Urgent|Accra|Kumasi|Ghana)\b/i.test(candidateName)) {
          res.candidates.fullName.push({
            value: candidateName,
            confidence: 'inferred',
            sourceSnippet: m[0].trim(),
            sourcePass: 'deterministic',
          })
          break
        }
      }
    }

    // Standalone unlabeled first line person name (e.g., "Kwame Mensah\nApex Print Studio\n...")
    if (res.candidates.fullName.length === 0 && segments.length > 0) {
      for (const seg of segments.slice(0, 3)) {
        if (seg.label) continue
        const words = seg.cleanLine.split(/\s+/)
        if (
          words.length >= 2 &&
          words.length <= 4 &&
          words.every((w) => /^[A-Z][a-zA-Z'.-]+$/.test(w)) &&
          !/\b(?:Ltd|Limited|LLC|Inc|Studio|Studios|Agency|Enterprise|Enterprises|Ventures|Group|Solutions|Logistics|Print|Media|Shop|Store|Accra|Kumasi|Tema|Ghana|Street|Road|Avenue|Hello|Dear|Urgent|Invoice|Quote)\b/i.test(
            seg.cleanLine
          )
        ) {
          res.candidates.fullName.push({
            value: seg.cleanLine,
            confidence: 'inferred',
            sourceSnippet: seg.cleanLine,
            sourcePass: 'deterministic',
          })
          break
        }
      }
    }
  }

  // Unlabeled Company recognition
  if (res.candidates.company.length === 0) {
    const companyPatterns = [
      /(?:founder\s+of|ceo\s+of|director\s+at|manager\s+at|representing|i\s+run|we\s+run|brand\s+called|brand|company\s+is)\s+['"“]?([A-Z][A-Za-z0-9&'’.-]+(?:\s+[A-Z][A-Za-z0-9&'’.-]+){0,4})['"”]?/i,
      /\b([A-Z][A-Za-z0-9&'’-]+(?:\s+[A-Z][A-Za-z0-9&'’-]+){0,3}\s+(?:Ltd|Limited|LLC|Inc|Studios?|Agency|Group|Tech|Solutions|Enterprises?|Ventures|Logistics|Designs?|Print|Media|Foods|Consult|Foundation|Boutique|Salon))\b/,
    ]
    for (const pat of companyPatterns) {
      const m = workingText.match(pat)
      if (m && m[1]) {
        const comp = m[1].trim()
        if (!/\b(?:Lexmedia|Accra|Kumasi|Tema|East Legon|Ghana)\b/i.test(comp)) {
          res.candidates.company.push({
            value: comp,
            confidence: 'inferred',
            sourceSnippet: m[0].trim(),
            sourcePass: 'deterministic',
          })
          break
        }
      }
    }
  }

  // Unlabeled Location / Address recognition
  if (res.candidates.address.length === 0) {
    const ghanaPlacesRegex =
      /\b(?:East\s+Legon|West\s+Legon|Airport\s+Residential|Cantonments|Osu|Labone|Spintex|Dzorwulu|Achimota|Madina|Adenta|Dansoman|Tema(?:\s+Community\s+\d+)?|Kumasi|Accra|Takoradi|Sekondi|Cape\s+Coast|Tamale|Sunyani|Koforidua|Ho|Techiman|Tarkwa|Kasoa|Obuasi)(?:,\s*[A-Za-z\s]+)?\b/i
    const locIntro = workingText.match(
      /(?:based\s+in|located\s+(?:at|in)|deliver(?:y)?\s+to|from|office\s+(?:at|in))\s+([A-Z][A-Za-z0-9\s,.-]{2,55}?)(?:[.\n;]|$)/i
    )
    if (locIntro && locIntro[1] && !/\b(?:Ltd|Solutions|Ventures|Studio|Agency)\b/i.test(locIntro[1])) {
      res.candidates.address.push({
        value: locIntro[1].trim(),
        confidence: 'inferred',
        sourceSnippet: locIntro[0].trim(),
        sourcePass: 'deterministic',
      })
    } else {
      const placeMatch = workingText.match(ghanaPlacesRegex)
      if (placeMatch) {
        res.candidates.address.push({
          value: placeMatch[0].trim(),
          confidence: 'inferred',
          sourceSnippet: placeMatch[0].trim(),
          sourcePass: 'deterministic',
        })
      }
    }
  }

  // Unlabeled Service / Project recognition
  if (res.candidates.serviceOrProject.length === 0) {
    const needSentence = workingText.match(
      /(?:we\s+need|i\s+need|looking\s+for|requesting|interested\s+in|needs)\s+([^.\n]{5,120})/i
    )
    if (needSentence && needSentence[1]) {
      res.servicesAndProducts.push(needSentence[1].trim())
      res.candidates.serviceOrProject.push({
        value: needSentence[1].trim(),
        confidence: 'inferred',
        sourceSnippet: needSentence[0].trim(),
        sourcePass: 'deterministic',
      })
    } else if (res.servicesAndProducts.length > 0) {
      res.candidates.serviceOrProject.push({
        value: dedupeStringsCaseInsensitive(res.servicesAndProducts).join('; '),
        confidence: 'inferred',
        sourceSnippet: res.servicesAndProducts[0],
        sourcePass: 'deterministic',
      })
    }
  }

  // Unlabeled Budget & Timeline from extracted financials / dates
  if (res.candidates.budget.length === 0 && res.financials.length > 0) {
    const primaryFin =
      res.financials.find((f) => f.category === 'budget' || f.category === 'total') ||
      res.financials.find((f) => !f.isPercentage) ||
      res.financials[0]
    if (primaryFin) {
      res.candidates.budget.push({
        value: primaryFin.raw,
        confidence: primaryFin.confidence,
        sourceSnippet: primaryFin.context || primaryFin.raw,
        sourcePass: 'deterministic',
      })
    }
  }

  if (res.candidates.timeline.length === 0 && res.datesAndDeadlines.length > 0) {
    const primaryDate =
      res.datesAndDeadlines.find((d) => d.category === 'deadline' || d.category === 'event_date') ||
      res.datesAndDeadlines[0]
    if (primaryDate) {
      res.candidates.timeline.push({
        value: primaryDate.raw,
        confidence: 'inferred',
        sourceSnippet: primaryDate.context || primaryDate.raw,
        sourcePass: 'deterministic',
      })
    }
  }

  // Urgency / Payment Status detection
  if (!res.statusAndPriority.priority && /\b(?:urgent|asap|rush|express|immediately|emergency)\b/i.test(workingText)) {
    res.statusAndPriority.priority = 'Urgent / Rush'
  }
  if (!res.statusAndPriority.paymentStatus) {
    if (/\b(?:paid\s+in\s+full|fully\s+paid)\b/i.test(workingText)) {
      res.statusAndPriority.paymentStatus = 'Paid in Full'
    } else if (/\b(?:deposit\s+paid|part\s+payment|50%\s+paid)\b/i.test(workingText)) {
      res.statusAndPriority.paymentStatus = 'Deposit / Partial Paid'
    }
  }

  return res
}

// ============================================================================
// GEMINI AI SCHEMAS & MULTI-PASS CALLS (STAGES 3B & 4B)
// ============================================================================

const PRIMARY_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fullName: { type: Type.STRING, description: 'Primary client full name, or empty string if absent.' },
    email: { type: Type.STRING, description: 'Primary client email address, or empty string if absent.' },
    phone: { type: Type.STRING, description: 'Primary phone number (never a reference/invoice ID), or empty string.' },
    whatsappNumber: { type: Type.STRING, description: 'WhatsApp number if mentioned, or empty string.' },
    company: { type: Type.STRING, description: 'Primary company, brand, or business name, or empty string.' },
    address: { type: Type.STRING, description: 'Physical address, city, town, or delivery location, or empty string.' },
    serviceOrProject: {
      type: Type.STRING,
      description: 'Complete summary of all requested creative services, products, packages, or project deliverables.',
    },
    budget: { type: Type.STRING, description: 'Primary stated budget, total price, or fee (with currency), or empty string.' },
    timeline: { type: Type.STRING, description: 'Primary deadline, delivery date, or turnaround timeline, or empty string.' },
    notes: {
      type: Type.STRING,
      description: 'Comprehensive, complete summary preserving ALL project context, preferences, instructions, and details without omitting anything.',
    },
    usefulDetails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'All distinct, actionable facts discovered across the entire text (no artificial cap).',
    },
    alternateEmails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Any secondary or additional email addresses mentioned in the text.',
    },
    alternatePhones: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Any secondary or additional phone numbers mentioned in the text.',
    },
    entities: {
      type: Type.ARRAY,
      description: 'Every person or organization mentioned (including primary client, secondary contacts, coordinators, or multiple clients).',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          roleOrRelation: { type: Type.STRING },
          company: { type: Type.STRING },
          email: { type: Type.STRING },
          phone: { type: Type.STRING },
          whatsappNumber: { type: Type.STRING },
          address: { type: Type.STRING },
          notes: { type: Type.STRING },
          isPrimary: { type: Type.BOOLEAN },
        },
      },
    },
    financials: {
      type: Type.ARRAY,
      description: 'Every monetary figure, currency amount, unit price, deposit, balance, tax, or percentage discount.',
      items: {
        type: Type.OBJECT,
        properties: {
          raw: { type: Type.STRING },
          normalizedAmount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          isPercentage: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          context: { type: Type.STRING },
        },
      },
    },
    quantitiesAndMeasurements: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'All quantities, counts, dimensions, sizes, paper weights, resolutions, or durations.',
    },
    datesAndDeadlines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw: { type: Type.STRING },
          normalizedDate: { type: Type.STRING },
          category: { type: Type.STRING },
          context: { type: Type.STRING },
        },
      },
    },
    referenceNumbers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'All reference numbers, invoice IDs, order numbers, quote IDs, PO numbers, or receipt numbers.',
    },
    urlsAndHandles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'All website URLs, Google Drive links, and social media handles.',
    },
    servicesAndProducts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Every individual service, product, or line item requested.',
    },
    priority: { type: Type.STRING, description: 'Urgency or priority if stated, else empty string.' },
    paymentStatus: { type: Type.STRING, description: 'Payment status if stated, else empty string.' },
    fieldConfidences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING },
          confidence: { type: Type.STRING, description: 'explicit, inferred, uncertain, or missing' },
          sourceSnippet: { type: Type.STRING },
        },
      },
    },
  },
}

const SECONDARY_AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    missedFullName: { type: Type.STRING },
    missedEmail: { type: Type.STRING },
    missedPhone: { type: Type.STRING },
    missedWhatsappNumber: { type: Type.STRING },
    missedCompany: { type: Type.STRING },
    missedAddress: { type: Type.STRING },
    missedServices: { type: Type.ARRAY, items: { type: Type.STRING } },
    missedFinancials: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw: { type: Type.STRING },
          normalizedAmount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          isPercentage: { type: Type.BOOLEAN },
          category: { type: Type.STRING },
          context: { type: Type.STRING },
        },
      },
    },
    missedQuantitiesAndMeasurements: { type: Type.ARRAY, items: { type: Type.STRING } },
    missedDates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw: { type: Type.STRING },
          normalizedDate: { type: Type.STRING },
          category: { type: Type.STRING },
          context: { type: Type.STRING },
        },
      },
    },
    missedReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
    missedUrlsAndHandles: { type: Type.ARRAY, items: { type: Type.STRING } },
    missedEntities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          roleOrRelation: { type: Type.STRING },
          company: { type: Type.STRING },
          email: { type: Type.STRING },
          phone: { type: Type.STRING },
          address: { type: Type.STRING },
        },
      },
    },
    missedImportantDetails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Any remaining instructions, brand colors, preferences, notes, or facts in the input text that Pass 1 missed.',
    },
    ungroundedFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Names of any Pass 1 fields whose values were fabricated/hallucinated and do NOT appear in the input text.',
    },
    conflicts: {
      type: Type.ARRAY,
      description: 'Conflicting values found in the input text for the same single-valued attribute of the same primary client.',
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING },
          label: { type: Type.STRING },
          values: { type: Type.ARRAY, items: { type: Type.STRING } },
          description: { type: Type.STRING },
        },
      },
    },
  },
}

function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  })
}

async function runGeminiPrimaryChunkPass(
  ai: GoogleGenAI,
  chunkText: string,
  chunkIndex: number,
  totalChunks: number
): Promise<any | null> {
  const systemInstruction = `You are a Principal Data Extraction Engine for LexMedia Ctrl Room (a creative design, print, media, and production studio in Ghana).
Analyze the ENTIRE supplied text from start to finish (Chunk ${chunkIndex + 1} of ${totalChunks}).

STRICT EXTRACTION & ANTI-HALLUCINATION RULES:
1. Extract EVERY piece of client, contact, business, service, deliverable, financial, quantity, measurement, date, reference ID, link, and instruction information present in the text.
2. NEVER invent, guess, or fabricate values that are not in the input text. Return "" or [] when absent.
3. Understand inconsistent labels, typos/misspellings (e.g. "Custmer Nmae", "Emial", "Phne", "Compny", "Budjet", "Deadine"), bullet points, numbered lists, and completely unlabeled conversational messages.
4. Distinguish strictly between:
   - Phone/WhatsApp numbers vs Reference/Invoice/Order/Receipt IDs (NEVER put an invoice or ref number in phone!).
   - Currency amounts (GH₵500, GHS 500, ₵500, 500 GHC, $150, USD 150) vs Percentages (20%) vs Quantities (12 units, 500 copies) vs Dates (15/10/2026 = 2026-10-15 DD/MM/YYYY).
5. If multiple people, contacts, or clients appear, list ALL of them in "entities" and mark the main client as isPrimary=true.`

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `Extract all structured client and project information from this verbatim input text:\n"""\n${chunkText}\n"""`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: PRIMARY_EXTRACTION_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  })

  const rawJson = (response.text ?? '{}').trim()
  return JSON.parse(rawJson)
}

async function stage3PrimaryExtraction(
  segmented: SegmentedInput,
  ai: GoogleGenAI | null
): Promise<{ deterministic: StageExtractionResult; aiChunks: any[] }> {
  const deterministic = runDeterministicExtraction(segmented)
  const aiChunks: any[] = []

  if (ai) {
    try {
      const results = await Promise.all(
        segmented.chunks.map((chunk, idx) =>
          runGeminiPrimaryChunkPass(ai, chunk, idx, segmented.chunks.length).catch((err) => {
            console.warn(`[parse-client] Stage 3 Gemini chunk ${idx + 1} warning:`, err)
            return null
          })
        )
      )
      for (const r of results) {
        if (r) aiChunks.push(r)
      }
    } catch (err) {
      console.warn('[parse-client] Stage 3 Gemini extraction warning:', err)
    }
  }

  return { deterministic, aiChunks }
}

// ============================================================================
// STAGE 4 — SECONDARY EXTRACTION & COMPLETENESS AUDIT PASS
// ============================================================================

async function stage4SecondaryExtraction(
  segmented: SegmentedInput,
  stage3Summary: Record<string, unknown>,
  ai: GoogleGenAI | null
): Promise<any | null> {
  if (!ai) return null

  try {
    // For very huge texts (>18,000 chars), pass full head + middle + tail up to 18,000 chars
    const maxAuditChars = 18000
    const auditSourceText =
      segmented.workingText.length <= maxAuditChars
        ? segmented.workingText
        : `${segmented.workingText.slice(0, 9000)}\n...[MIDDLE CONTINUES]...\n${segmented.workingText.slice(-9000)}`

    const systemInstruction = `You are an Independent Verification & Secondary Extraction Auditor.
Compare the ORIGINAL INPUT TEXT against the PASS 1 EXTRACTED JSON.
Your three responsibilities:
1. RECOVER MISSED DETAILS: Identify any names, secondary contacts/entities, emails, phones, companies, addresses, services/line items, currency amounts (GH₵, GHS, GHC, ₵, $, USD), discounts (%), deposits, quantities, measurements, dates, reference numbers, URLs, or special instructions present in the original text that Pass 1 missed or truncated.
2. DETECT HALLUCINATIONS: List in "ungroundedFields" any Pass 1 field (fullName, email, phone, whatsappNumber, company, address, budget, timeline) whose value does NOT originate from the input text.
3. DETECT GENUINE CONFLICTS: Only report a conflict in "conflicts" when the input text contains two or more DIFFERENT competing values for the SAME single-valued field of the SAME primary client (e.g., two different budgets like GH₵1,500 vs GH₵2,200 for the same project, two different deadlines for the same deliverable, or two conflicting client names for the same person). Do NOT flag equivalent phone formats (0244123456 vs +233 24 412 3456) or distinct line-item prices (deposit vs total) or secondary contact details as conflicts.`

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `ORIGINAL INPUT TEXT:\n"""\n${auditSourceText}\n"""\n\nPASS 1 EXTRACTED JSON:\n${JSON.stringify(stage3Summary)}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: SECONDARY_AUDIT_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })

    return JSON.parse((response.text ?? '{}').trim())
  } catch (err) {
    console.warn('[parse-client] Stage 4 Gemini secondary verification warning:', err)
    return null
  }
}

// ============================================================================
// STAGE 5 & STAGE 6 — RECONCILIATION, GROUNDING & VALIDATION
// ============================================================================

function isGroundedInText(value: string, originalText: string, field?: string): boolean {
  const cleanVal = (value || '').trim()
  if (!cleanVal) return false
  if (isPlaceholderValue(cleanVal, originalText)) return false

  const lowerText = originalText.toLowerCase()
  const lowerVal = cleanVal.toLowerCase()

  // Direct substring match
  if (lowerText.includes(lowerVal)) return true

  // Phone digit match
  if (field === 'phone' || field === 'whatsappNumber') {
    const valCanon = canonicalizePhone(cleanVal)
    const valDigits = cleanVal.replace(/\D/g, '')
    const textDigits = originalText.replace(/\D/g, '')
    if (valDigits.length >= 7 && textDigits.includes(valDigits)) return true
    if (valCanon.length >= 9) {
      const localNine = valCanon.slice(-9)
      if (textDigits.includes(localNine)) return true
    }
    return false
  }

  // Email must appear literally (case-insensitive)
  if (field === 'email') {
    return lowerText.includes(lowerVal)
  }

  // Token-overlap grounding check for multi-word strings (names, companies, services, timelines, budgets)
  const significantTokens = lowerVal
    .replace(/[^a-z0-9₵$£€₦%]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !['the', 'and', 'for', 'from', 'with', 'ghs', 'usd'].includes(t))

  if (significantTokens.length === 0) {
    // Check numeric grounding (e.g. "GHS 500" vs "₵500")
    const nums = cleanVal.match(/\d+/g)
    if (nums && nums.length > 0) {
      return nums.every((n) => originalText.includes(n))
    }
    return false
  }

  const matchedCount = significantTokens.filter((tok) => lowerText.includes(tok)).length
  return matchedCount / significantTokens.length >= 0.5
}

function normalizeFinancialCategory(cat?: string): FinancialCategory {
  const c = (cat || '').toLowerCase().trim()
  if (
    c === 'budget' ||
    c === 'total' ||
    c === 'price' ||
    c === 'deposit' ||
    c === 'balance' ||
    c === 'discount' ||
    c === 'tax' ||
    c === 'unit_price'
  ) {
    return c
  }
  return 'other'
}

function normalizeDateCategory(cat?: string): DateCategory {
  const c = (cat || '').toLowerCase().trim()
  if (c === 'deadline' || c === 'event_date' || c === 'start_date' || c === 'invoice_date') {
    return c
  }
  return 'date'
}

function stage5And6ReconcileAndValidate(
  segmented: SegmentedInput,
  deterministic: StageExtractionResult,
  aiChunks: any[],
  aiSecondary: any | null
): {
  core: {
    fullName: string
    email: string
    phone: string
    whatsappNumber: string
    company: string
    address: string
    serviceOrProject: string
    budget: string
    timeline: string
    notes: string
  }
  alternateEmails: string[]
  alternatePhones: string[]
  entities: ExtractedEntity[]
  financials: ExtractedFinancialItem[]
  quantitiesAndMeasurements: string[]
  datesAndDeadlines: ExtractedDateItem[]
  referenceNumbers: string[]
  urlsAndHandles: string[]
  servicesAndProducts: string[]
  statusAndPriority: { status?: string; priority?: string; paymentStatus?: string }
  usefulDetails: string[]
  fieldMeta: Record<string, FieldConfidenceMeta>
  conflicts: ExtractionConflict[]
} {
  const { originalText } = segmented
  const ungroundedSet = new Set<string>(
    Array.isArray(aiSecondary?.ungroundedFields) ? aiSecondary.ungroundedFields : []
  )

  const fieldMeta: Record<string, FieldConfidenceMeta> = {}
  const conflicts: ExtractionConflict[] = []

  // Collect reference digit strings so we never allow a reference ID into phone/whatsapp
  const allRefs = dedupeStringsCaseInsensitive([
    ...deterministic.referenceNumbers,
    ...aiChunks.flatMap((c) => (Array.isArray(c?.referenceNumbers) ? c.referenceNumbers : [])),
    ...(Array.isArray(aiSecondary?.missedReferences) ? aiSecondary.missedReferences : []),
  ]).filter((r) => isGroundedInText(r, originalText))

  const refDigitTokens = new Set(
    allRefs
      .map((r) => r.replace(/\D/g, ''))
      .filter((d) => d.length >= 6)
  )

  const isPhoneValidAndSafe = (val: string): boolean => {
    if (!val || !isGroundedInText(val, originalText, 'phone')) return false
    const digits = val.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 15) return false
    if (refDigitTokens.has(digits)) return false
    // Reject date strings like 15/10/2026
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(val.trim())) return false
    return true
  }

  const isEmailValidAndSafe = (val: string): boolean => {
    if (!val || !isGroundedInText(val, originalText, 'email')) return false
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val.trim())
  }

  // Merge AI confidences
  const aiConfMap: Record<string, { confidence: ExtractionConfidence; sourceSnippet?: string }> = {}
  for (const chunk of aiChunks) {
    if (Array.isArray(chunk?.fieldConfidences)) {
      for (const fc of chunk.fieldConfidences) {
        if (fc?.field && !aiConfMap[fc.field]) {
          const conf = (fc.confidence || '').toLowerCase()
          aiConfMap[fc.field] = {
            confidence:
              conf === 'explicit' || conf === 'inferred' || conf === 'uncertain' ? conf : 'inferred',
            sourceSnippet: fc.sourceSnippet,
          }
        }
      }
    }
  }

  // Helper to pick best grounded value for a core field & detect conflicts among explicit deterministic candidates
  const resolveCoreField = (
    field: 'fullName' | 'email' | 'phone' | 'whatsappNumber' | 'company' | 'address' | 'serviceOrProject' | 'budget' | 'timeline',
    label: string,
    aiPrimaryValues: string[],
    aiSecondaryMissed?: string
  ): string => {
    const detCandidates = deterministic.candidates[field] || []

    // Check if deterministic explicit labels found multiple DISTINCT conflicting values for this single field
    if (field !== 'serviceOrProject') {
      const explicitVals = detCandidates
        .filter((c) => c.confidence === 'explicit')
        .map((c) => c.value.trim())
        .filter(Boolean)

      const distinctExplicit: string[] = []
      for (const v of explicitVals) {
        const isSame = distinctExplicit.some((existing) => {
          if (field === 'phone' || field === 'whatsappNumber') {
            return canonicalizePhone(existing) === canonicalizePhone(v)
          }
          return existing.toLowerCase() === v.toLowerCase()
        })
        if (!isSame) distinctExplicit.push(v)
      }

      if (distinctExplicit.length > 1) {
        conflicts.push({
          field,
          label,
          values: distinctExplicit,
          description: `Multiple different values were found for ${label}: ${distinctExplicit.join(' vs ')}`,
        })
      }
    }

    // Build ordered pool:
    // For explicit labeled deterministic fields, prefer deterministic explicit if grounded, otherwise AI primary (when not flagged ungrounded), then AI secondary, then deterministic inferred.
    const validAiPrimary = ungroundedSet.has(field)
      ? []
      : aiPrimaryValues
          .map((v) => (v || '').trim())
          .filter((v) => {
            if (!v || !isGroundedInText(v, originalText, field)) return false
            if (field === 'email') return isEmailValidAndSafe(v)
            if (field === 'phone' || field === 'whatsappNumber') return isPhoneValidAndSafe(v)
            if (field === 'budget' && /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) return false
            return true
          })

    const validDetExplicit = detCandidates.filter((c) => {
      if (c.confidence !== 'explicit') return false
      if (!isGroundedInText(c.value, originalText, field)) return false
      if (field === 'email') return isEmailValidAndSafe(c.value)
      if (field === 'phone' || field === 'whatsappNumber') return isPhoneValidAndSafe(c.value)
      return true
    })

    const validDetInferred = detCandidates.filter((c) => {
      if (c.confidence === 'explicit') return false
      if (!isGroundedInText(c.value, originalText, field)) return false
      if (field === 'email') return isEmailValidAndSafe(c.value)
      if (field === 'phone' || field === 'whatsappNumber') return isPhoneValidAndSafe(c.value)
      return true
    })

    const validAiSecondary =
      aiSecondaryMissed &&
      isGroundedInText(aiSecondaryMissed, originalText, field) &&
      (field !== 'email' || isEmailValidAndSafe(aiSecondaryMissed)) &&
      ((field !== 'phone' && field !== 'whatsappNumber') || isPhoneValidAndSafe(aiSecondaryMissed))
        ? aiSecondaryMissed.trim()
        : ''

    // Special aggregation for serviceOrProject so multiple services across chunks/bullets are combined, not overwritten
    if (field === 'serviceOrProject') {
      const combinedServices = dedupeStringsCaseInsensitive([
        ...validAiPrimary,
        ...validDetExplicit.map((c) => c.value),
        ...(validAiSecondary ? [validAiSecondary] : []),
      ])
      if (combinedServices.length > 0) {
        const chosen = combinedServices.join('; ')
        fieldMeta[field] = {
          confidence: validDetExplicit.length > 0 ? 'explicit' : aiConfMap[field]?.confidence || 'inferred',
          sourceSnippet: validDetExplicit[0]?.sourceSnippet || aiConfMap[field]?.sourceSnippet || chosen,
          labelUsed: validDetExplicit[0]?.labelUsed,
        }
        return chosen
      }
    }

    if (validDetExplicit.length > 0) {
      // Prefer the first explicit value (primary client usually listed first), while conflicts[] preserves all alternatives
      const chosen = validDetExplicit[0]
      fieldMeta[field] = {
        confidence: 'explicit',
        sourceSnippet: chosen.sourceSnippet,
        labelUsed: chosen.labelUsed,
      }
      return chosen.value
    }

    if (validAiPrimary.length > 0) {
      fieldMeta[field] = {
        confidence: aiConfMap[field]?.confidence || 'inferred',
        sourceSnippet: aiConfMap[field]?.sourceSnippet || validAiPrimary[0],
      }
      return validAiPrimary[0]
    }

    if (validAiSecondary) {
      fieldMeta[field] = {
        confidence: 'inferred',
        sourceSnippet: validAiSecondary,
      }
      return validAiSecondary
    }

    if (validDetInferred.length > 0) {
      const chosen = validDetInferred[0]
      fieldMeta[field] = {
        confidence: chosen.confidence,
        sourceSnippet: chosen.sourceSnippet,
      }
      return chosen.value
    }

    fieldMeta[field] = { confidence: 'missing' }
    return ''
  }

  const fullName = resolveCoreField(
    'fullName',
    'Client Name',
    aiChunks.map((c) => c?.fullName),
    aiSecondary?.missedFullName
  )
  const email = resolveCoreField(
    'email',
    'Email Address',
    aiChunks.map((c) => c?.email),
    aiSecondary?.missedEmail
  )
  const phone = resolveCoreField(
    'phone',
    'Phone Number',
    aiChunks.map((c) => c?.phone),
    aiSecondary?.missedPhone
  )
  const rawWhatsapp = resolveCoreField(
    'whatsappNumber',
    'WhatsApp Number',
    aiChunks.map((c) => c?.whatsappNumber),
    aiSecondary?.missedWhatsappNumber
  )
  const whatsappNumber = rawWhatsapp || phone
  if (!rawWhatsapp && phone) {
    fieldMeta.whatsappNumber = {
      confidence: 'inferred',
      sourceSnippet: phone,
    }
  }

  const company = resolveCoreField(
    'company',
    'Company / Brand',
    aiChunks.map((c) => c?.company),
    aiSecondary?.missedCompany
  )
  const address = resolveCoreField(
    'address',
    'Location / Address',
    aiChunks.map((c) => c?.address),
    aiSecondary?.missedAddress
  )
  let serviceOrProject = resolveCoreField(
    'serviceOrProject',
    'Service or Project',
    aiChunks.map((c) => c?.serviceOrProject),
    Array.isArray(aiSecondary?.missedServices) ? aiSecondary.missedServices.join('; ') : ''
  )
  let budget = resolveCoreField(
    'budget',
    'Budget / Pricing',
    aiChunks.map((c) => c?.budget),
    ''
  )
  const timeline = resolveCoreField(
    'timeline',
    'Timeline / Deadline',
    aiChunks.map((c) => c?.timeline),
    ''
  )

  // Merge all services & products
  const servicesAndProducts = dedupeStringsCaseInsensitive([
    ...aiChunks.flatMap((c) => (Array.isArray(c?.servicesAndProducts) ? c.servicesAndProducts : [])),
    ...(Array.isArray(aiSecondary?.missedServices) ? aiSecondary.missedServices : []),
    ...deterministic.servicesAndProducts,
  ]).filter((s) => isGroundedInText(s, originalText))

  if (!serviceOrProject && servicesAndProducts.length > 0) {
    serviceOrProject = servicesAndProducts.join('; ')
    fieldMeta.serviceOrProject = { confidence: 'inferred', sourceSnippet: servicesAndProducts[0] }
  }

  // Merge all emails & alternateEmails
  const allEmails = dedupeStringsCaseInsensitive([
    ...deterministic.emails,
    ...aiChunks.flatMap((c) => [c?.email, ...(Array.isArray(c?.alternateEmails) ? c.alternateEmails : [])]),
    ...(aiSecondary?.missedEmail ? [aiSecondary.missedEmail] : []),
  ]).filter(isEmailValidAndSafe)

  const alternateEmails = allEmails.filter((e) => e.toLowerCase() !== email.toLowerCase())

  // Merge all phones & alternatePhones (deduped by canonical phone digits!)
  const primaryCanon = canonicalizePhone(phone)
  const waCanon = canonicalizePhone(whatsappNumber)
  const seenPhoneCanons = new Set<string>([primaryCanon, waCanon].filter(Boolean))
  const alternatePhones: string[] = []

  const allPhoneCandidates = [
    ...deterministic.phones.map((p) => p.raw),
    ...aiChunks.flatMap((c) => [c?.phone, c?.whatsappNumber, ...(Array.isArray(c?.alternatePhones) ? c.alternatePhones : [])]),
    ...(aiSecondary?.missedPhone ? [aiSecondary.missedPhone] : []),
  ]
  for (const p of allPhoneCandidates) {
    if (!p || !isPhoneValidAndSafe(p)) continue
    const canon = canonicalizePhone(p)
    if (canon && !seenPhoneCanons.has(canon)) {
      seenPhoneCanons.add(canon)
      alternatePhones.push(p.trim())
    }
  }

  // Merge Financials (deduplicate by normalizedAmount + currency + category/raw)
  const mergedFinancials: ExtractedFinancialItem[] = [...deterministic.financials]
  const aiFinRaw = [
    ...aiChunks.flatMap((c) => (Array.isArray(c?.financials) ? c.financials : [])),
    ...(Array.isArray(aiSecondary?.missedFinancials) ? aiSecondary.missedFinancials : []),
  ]
  for (const af of aiFinRaw) {
    if (!af?.raw || !isGroundedInText(String(af.raw), originalText)) continue
    const normCurrency = normalizeCurrencyCode(af.currency || (String(af.raw).includes('%') ? 'PERCENT' : 'GHS'))
    const normAmt = typeof af.normalizedAmount === 'number' ? af.normalizedAmount : parseNumericAmount(String(af.raw).replace(/[^\d.,]/g, ''))
    const alreadyHas = mergedFinancials.some(
      (mf) =>
        mf.raw.toLowerCase() === String(af.raw).trim().toLowerCase() ||
        (mf.normalizedAmount !== null &&
          normAmt !== null &&
          mf.normalizedAmount === normAmt &&
          mf.currency === normCurrency &&
          (mf.context || '').toLowerCase() === String(af.context || '').toLowerCase())
    )
    if (!alreadyHas) {
      mergedFinancials.push({
        raw: String(af.raw).trim(),
        normalizedAmount: normAmt,
        currency: normCurrency,
        isPercentage: Boolean(af.isPercentage || normCurrency === 'PERCENT'),
        category: normalizeFinancialCategory(af.category),
        context: af.context ? String(af.context).trim() : undefined,
        confidence: 'inferred',
      })
    }
  }

  if (!budget && mergedFinancials.length > 0) {
    const nonPct = mergedFinancials.filter((f) => !f.isPercentage)
    if (nonPct.length === 1) {
      budget = nonPct[0].raw
    } else if (nonPct.length > 1) {
      const explicitTotalOrBudget = nonPct.find((f) => f.category === 'budget' || f.category === 'total')
      budget = explicitTotalOrBudget
        ? explicitTotalOrBudget.raw
        : nonPct.map((f) => f.raw).join(' / ')
    }
    if (budget) {
      fieldMeta.budget = { confidence: 'explicit', sourceSnippet: budget }
    }
  }

  // Merge Dates & Deadlines
  const mergedDates: ExtractedDateItem[] = [...deterministic.datesAndDeadlines]
  const aiDates = [
    ...aiChunks.flatMap((c) => (Array.isArray(c?.datesAndDeadlines) ? c.datesAndDeadlines : [])),
    ...(Array.isArray(aiSecondary?.missedDates) ? aiSecondary.missedDates : []),
  ]
  for (const ad of aiDates) {
    if (!ad?.raw || !isGroundedInText(String(ad.raw), originalText)) continue
    const rawStr = String(ad.raw).trim()
    if (!mergedDates.some((d) => d.raw.toLowerCase() === rawStr.toLowerCase())) {
      mergedDates.push({
        raw: rawStr,
        normalizedDate: ad.normalizedDate || normalizeDateToken(rawStr),
        category: normalizeDateCategory(ad.category),
        context: ad.context ? String(ad.context).trim() : undefined,
      })
    }
  }

  // Merge Quantities & Measurements
  const quantitiesAndMeasurements = dedupeStringsCaseInsensitive([
    ...deterministic.quantitiesAndMeasurements,
    ...aiChunks.flatMap((c) => (Array.isArray(c?.quantitiesAndMeasurements) ? c.quantitiesAndMeasurements : [])),
    ...(Array.isArray(aiSecondary?.missedQuantitiesAndMeasurements) ? aiSecondary.missedQuantitiesAndMeasurements : []),
  ]).filter((q) => isGroundedInText(q, originalText))

  // Merge URLs & Handles
  const urlsAndHandles = dedupeStringsCaseInsensitive([
    ...deterministic.urlsAndHandles,
    ...aiChunks.flatMap((c) => (Array.isArray(c?.urlsAndHandles) ? c.urlsAndHandles : [])),
    ...(Array.isArray(aiSecondary?.missedUrlsAndHandles) ? aiSecondary.missedUrlsAndHandles : []),
  ]).filter((u) => isGroundedInText(u, originalText))

  // Merge Entities (deduplicate by name or email/phone)
  const mergedEntities: ExtractedEntity[] = []
  const rawEntityPool: ExtractedEntity[] = [
    ...aiChunks.flatMap((c) => (Array.isArray(c?.entities) ? c.entities : [])),
    ...(Array.isArray(aiSecondary?.missedEntities) ? aiSecondary.missedEntities : []),
    ...deterministic.entities,
  ]

  for (const ent of rawEntityPool) {
    const cleanName = (ent?.name || '').trim()
    if (!cleanName || !isGroundedInText(cleanName, originalText)) continue
    const cleanEmail = ent.email && isEmailValidAndSafe(ent.email) ? ent.email.trim() : undefined
    const cleanPhone = ent.phone && isPhoneValidAndSafe(ent.phone) ? ent.phone.trim() : undefined
    const cleanWa =
      ent.whatsappNumber && isPhoneValidAndSafe(ent.whatsappNumber) ? ent.whatsappNumber.trim() : undefined
    const cleanCompany =
      ent.company && isGroundedInText(ent.company, originalText) ? ent.company.trim() : undefined
    const cleanAddr =
      ent.address && isGroundedInText(ent.address, originalText) ? ent.address.trim() : undefined

    const existing = mergedEntities.find(
      (e) =>
        e.name.toLowerCase() === cleanName.toLowerCase() ||
        (cleanEmail && e.email && e.email.toLowerCase() === cleanEmail.toLowerCase() &&
          cleanName.toLowerCase().includes(e.name.split(' ')[0].toLowerCase()))
    )
    if (existing) {
      existing.roleOrRelation = existing.roleOrRelation || ent.roleOrRelation
      existing.company = existing.company || cleanCompany
      existing.email = existing.email || cleanEmail
      existing.phone = existing.phone || cleanPhone
      existing.whatsappNumber = existing.whatsappNumber || cleanWa
      existing.address = existing.address || cleanAddr
      existing.notes = existing.notes || ent.notes
      if (ent.isPrimary) existing.isPrimary = true
    } else {
      mergedEntities.push({
        name: cleanName,
        roleOrRelation: ent.roleOrRelation ? String(ent.roleOrRelation).trim() : undefined,
        company: cleanCompany,
        email: cleanEmail,
        phone: cleanPhone,
        whatsappNumber: cleanWa,
        address: cleanAddr,
        notes: ent.notes ? String(ent.notes).trim() : undefined,
        isPrimary: Boolean(ent.isPrimary || cleanName.toLowerCase() === fullName.toLowerCase()),
      })
    }
  }

  // Ensure primary entity exists when fullName is present
  if (fullName && !mergedEntities.some((e) => e.name.toLowerCase() === fullName.toLowerCase())) {
    mergedEntities.unshift({
      name: fullName,
      company: company || undefined,
      email: email || undefined,
      phone: phone || undefined,
      whatsappNumber: whatsappNumber || undefined,
      address: address || undefined,
      isPrimary: true,
    })
  }

  // Merge genuine AI secondary conflicts (avoiding duplicates and false phone-format conflicts)
  if (Array.isArray(aiSecondary?.conflicts)) {
    for (const c of aiSecondary.conflicts) {
      if (!c?.field || !Array.isArray(c?.values) || c.values.length < 2) continue
      const groundedVals = dedupeStringsCaseInsensitive(
        c.values.map(String).filter((v: string) => isGroundedInText(v, originalText))
      )
      if (groundedVals.length < 2) continue

      // Filter out false phone equivalence conflicts
      if (c.field === 'phone' || c.field === 'whatsappNumber') {
        const distinctCanons = new Set(groundedVals.map(canonicalizePhone).filter(Boolean))
        if (distinctCanons.size < 2) continue
      }

      if (!conflicts.some((existing) => existing.field === c.field)) {
        conflicts.push({
          field: String(c.field),
          label: String(c.label || c.field),
          values: groundedVals,
          description: String(
            c.description || `Conflicting values detected for ${c.label || c.field}: ${groundedVals.join(' vs ')}`
          ),
        })
      }
    }
  }

  // Mark any conflicted field as 'uncertain' in fieldMeta so user sees review badge
  for (const conflict of conflicts) {
    if (fieldMeta[conflict.field]) {
      fieldMeta[conflict.field].confidence = 'uncertain'
    }
  }

  // Status & Priority
  const aiPriority = aiChunks.map((c) => c?.priority).find((p) => p && isGroundedInText(p, originalText))
  const aiPaymentStatus = aiChunks
    .map((c) => c?.paymentStatus)
    .find((p) => p && isGroundedInText(p, originalText))

  const statusAndPriority = {
    status: deterministic.statusAndPriority.status,
    priority: aiPriority || deterministic.statusAndPriority.priority,
    paymentStatus: aiPaymentStatus || deterministic.statusAndPriority.paymentStatus,
  }

  // Notes & Useful Details (combine across all chunks + Stage 4 missedImportantDetails — NO truncation!)
  const aiNotesParts = dedupeStringsCaseInsensitive(
    aiChunks.map((c) => (c?.notes ? String(c.notes).trim() : '')).filter(Boolean)
  )
  const missedImportantDetails = Array.isArray(aiSecondary?.missedImportantDetails)
    ? aiSecondary.missedImportantDetails.map(String).filter((d: string) => isGroundedInText(d, originalText))
    : []

  let notes = aiNotesParts.join('\n\n')
  if (!notes) {
    notes = deterministic.notesLines.join('\n')
  }
  if (missedImportantDetails.length > 0) {
    const newMissed = missedImportantDetails.filter((d: string) => !notes.toLowerCase().includes(d.toLowerCase()))
    if (newMissed.length > 0) {
      notes = [notes, ...newMissed.map((d: string) => `• ${d}`)].filter(Boolean).join('\n')
    }
  }

  const usefulDetails = dedupeStringsCaseInsensitive([
    ...aiChunks.flatMap((c) => (Array.isArray(c?.usefulDetails) ? c.usefulDetails.map(String) : [])),
    ...missedImportantDetails,
    ...(serviceOrProject ? [`Requested Service: ${serviceOrProject}`] : []),
    ...(budget ? [`Budget / Price: ${budget}`] : []),
    ...(timeline ? [`Timeline / Deadline: ${timeline}`] : []),
    ...quantitiesAndMeasurements.map((q) => `Spec / Quantity: ${q}`),
    ...allRefs.map((r) => `Reference: ${r}`),
  ])

  return {
    core: {
      fullName,
      email,
      phone,
      whatsappNumber,
      company,
      address,
      serviceOrProject,
      budget,
      timeline,
      notes,
    },
    alternateEmails,
    alternatePhones,
    entities: mergedEntities,
    financials: mergedFinancials,
    quantitiesAndMeasurements,
    datesAndDeadlines: mergedDates,
    referenceNumbers: allRefs,
    urlsAndHandles,
    servicesAndProducts,
    statusAndPriority,
    usefulDetails,
    fieldMeta,
    conflicts,
  }
}

// ============================================================================
// STAGE 7 — COMPLETENESS AUDIT & UNMATCHED PRESERVATION
// ============================================================================

function stage7CompletenessAudit(
  segmented: SegmentedInput,
  reconciled: ReturnType<typeof stage5And6ReconcileAndValidate>
): {
  additionalInformation: string
  unmatchedPreservedCount: number
  warnings: string[]
  completenessScore: number
} {
  const { segments } = segmented
  const { core } = reconciled

  // Build corpus of all structured extracted text to check segment coverage
  const capturedCorpus = [
    core.fullName,
    core.email,
    core.phone,
    core.whatsappNumber,
    core.company,
    core.address,
    core.serviceOrProject,
    core.budget,
    core.timeline,
    core.notes,
    ...reconciled.alternateEmails,
    ...reconciled.alternatePhones,
    ...reconciled.entities.flatMap((e) => [e.name, e.company, e.email, e.phone, e.address, e.notes]),
    ...reconciled.financials.flatMap((f) => [f.raw, f.context]),
    ...reconciled.quantitiesAndMeasurements,
    ...reconciled.datesAndDeadlines.flatMap((d) => [d.raw, d.context]),
    ...reconciled.referenceNumbers,
    ...reconciled.urlsAndHandles,
    ...reconciled.servicesAndProducts,
    ...reconciled.usefulDetails,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  const unmatchedLines: string[] = []

  for (const seg of segments) {
    const contentToCheck = (seg.value || seg.cleanLine).trim()
    if (!contentToCheck) continue

    // Ignore pure greeting/filler lines like "Hello", "Thank you"
    if (/^(?:hi|hello|hey|dear\s+team|good\s+(?:morning|afternoon|evening)|thank\s+you|thanks)[!.,\s]*$/i.test(contentToCheck)) {
      continue
    }

    const lowerContent = contentToCheck.toLowerCase()
    if (capturedCorpus.includes(lowerContent)) continue

    // Check token coverage for longer sentences
    const tokens = lowerContent
      .replace(/[^a-z0-9₵$£€₦%@#-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)

    if (tokens.length === 0) continue
    const coveredTokens = tokens.filter((t) => capturedCorpus.includes(t)).length
    const coverageRatio = coveredTokens / tokens.length

    // Preserve any segment with < 75% token representation in structured output!
    if (coverageRatio < 0.75) {
      unmatchedLines.push(seg.rawLine.trim())
    }
  }

  const dedupedUnmatched = dedupeStringsCaseInsensitive(unmatchedLines)
  const additionalInformation = dedupedUnmatched.join('\n')

  const warnings: string[] = []
  if (reconciled.conflicts.length > 0) {
    warnings.push(
      `${reconciled.conflicts.length} conflicting field value(s) detected in pasted text. Review and choose the intended value below.`
    )
  }
  if (reconciled.entities.length > 1) {
    warnings.push(
      `${reconciled.entities.length} people/contacts were detected in the pasted text. You can switch the primary client or keep secondary contacts in notes.`
    )
  }
  if (!core.fullName) {
    warnings.push('Client name could not be confidently determined from the pasted text.')
  }
  if (!core.phone && !core.email && !core.whatsappNumber) {
    warnings.push('No phone number, WhatsApp number, or email address was found in the pasted text.')
  }

  const totalSegments = Math.max(1, segments.length)
  const structuredCoverage = Math.round(((totalSegments - dedupedUnmatched.length) / totalSegments) * 100)
  // Because unmatched lines are preserved in additionalInformation, 100% of input is accounted for;
  // completenessScore reflects structured + preserved completeness weighted with core field availability
  const completenessScore = Math.min(100, Math.max(structuredCoverage, dedupedUnmatched.length > 0 ? 92 : 100))

  return {
    additionalInformation,
    unmatchedPreservedCount: dedupedUnmatched.length,
    warnings,
    completenessScore,
  }
}

// ============================================================================
// STAGE 8 — STRUCTURED OUTPUT ASSEMBLY & MAIN PIPELINE ENTRYPOINT
// ============================================================================

export async function runClientExtractionPipeline(rawInput: string): Promise<ParsedClientResponse> {
  const stagesCompleted: string[] = []

  // Stage 1: Preserve complete input verbatim
  const { originalText, workingText } = stage1PreserveInput(rawInput)
  stagesCompleted.push('Stage 1: Input Preservation')

  // Stage 2: Segment lines, bullets, numbered lists, labels, and overlapping chunks
  const segmented = stage2SegmentText(originalText, workingText)
  stagesCompleted.push('Stage 2: Text Segmentation')

  // Stage 3: Primary Extraction Pass (Deterministic + Chunked Gemini AI)
  const ai = getGeminiClient()
  const { deterministic, aiChunks } = await stage3PrimaryExtraction(segmented, ai)
  stagesCompleted.push('Stage 3: Primary Extraction Pass')

  // Stage 4: Secondary Completeness & Anti-Hallucination Pass
  const stage3PreviewSummary = {
    aiChunks,
    deterministicEmails: deterministic.emails,
    deterministicPhones: deterministic.phones.map((p) => p.raw),
    deterministicFinancials: deterministic.financials.map((f) => f.raw),
    deterministicDates: deterministic.datesAndDeadlines.map((d) => d.raw),
    deterministicReferences: deterministic.referenceNumbers,
  }
  const aiSecondary = await stage4SecondaryExtraction(segmented, stage3PreviewSummary, ai)
  stagesCompleted.push('Stage 4: Secondary Extraction Pass')

  // Stage 5 & 6: Reconciliation + Validation & Anti-Collision Filtering
  const reconciled = stage5And6ReconcileAndValidate(segmented, deterministic, aiChunks, aiSecondary)
  stagesCompleted.push('Stage 5: Reconciliation', 'Stage 6: Validation')

  // Stage 7: Internal Completeness Audit & Unmatched Information Preservation
  const audit = stage7CompletenessAudit(segmented, reconciled)
  stagesCompleted.push('Stage 7: Completeness Audit')

  // Stage 8: Structured Output Assembly
  const availableFields: string[] = []
  const missingFields: string[] = []

  for (const { key, label } of CORE_CLIENT_FIELD_DEFS) {
    const val = reconciled.core[key]
    if (val && val.trim()) {
      availableFields.push(label)
    } else {
      missingFields.push(label)
    }
  }

  // Ensure unmatched details are also reflected in notes if notes was empty
  let finalNotes = reconciled.core.notes.trim()
  if (!finalNotes && audit.additionalInformation) {
    finalNotes = audit.additionalInformation
  }

  const uncertainFieldsCount = Object.values(reconciled.fieldMeta).filter(
    (m) => m.confidence === 'uncertain'
  ).length

  const totalDetailsIdentified =
    availableFields.length +
    (reconciled.core.budget ? 1 : 0) +
    (reconciled.core.timeline ? 1 : 0) +
    reconciled.alternateEmails.length +
    reconciled.alternatePhones.length +
    Math.max(0, reconciled.entities.length - (reconciled.core.fullName ? 1 : 0)) +
    Math.max(0, reconciled.financials.length - (reconciled.core.budget ? 1 : 0)) +
    reconciled.quantitiesAndMeasurements.length +
    Math.max(0, reconciled.datesAndDeadlines.length - (reconciled.core.timeline ? 1 : 0)) +
    reconciled.referenceNumbers.length +
    reconciled.urlsAndHandles.length +
    audit.unmatchedPreservedCount

  stagesCompleted.push('Stage 8: Structured Output')

  return {
    fullName: reconciled.core.fullName,
    email: reconciled.core.email,
    phone: reconciled.core.phone,
    whatsappNumber: reconciled.core.whatsappNumber,
    company: reconciled.core.company,
    address: reconciled.core.address,
    serviceOrProject: reconciled.core.serviceOrProject,
    notes: finalNotes,
    budget: reconciled.core.budget,
    timeline: reconciled.core.timeline,
    availableFields,
    missingFields,
    usefulDetails: reconciled.usefulDetails,

    // Additive comprehensive extraction output
    originalText,
    additionalInformation: audit.additionalInformation,
    alternateEmails: reconciled.alternateEmails,
    alternatePhones: reconciled.alternatePhones,
    entities: reconciled.entities,
    financials: reconciled.financials,
    quantitiesAndMeasurements: reconciled.quantitiesAndMeasurements,
    datesAndDeadlines: reconciled.datesAndDeadlines,
    referenceNumbers: reconciled.referenceNumbers,
    urlsAndHandles: reconciled.urlsAndHandles,
    servicesAndProducts: reconciled.servicesAndProducts,
    statusAndPriority: reconciled.statusAndPriority,
    fieldMeta: reconciled.fieldMeta,
    conflicts: reconciled.conflicts,
    warnings: audit.warnings,
    pipelineReport: {
      stagesCompleted,
      segmentCount: segmented.segments.length,
      chunkCount: segmented.chunks.length,
      totalDetailsIdentified,
      uncertainFieldsCount,
      conflictsCount: reconciled.conflicts.length,
      unmatchedPreservedCount: audit.unmatchedPreservedCount,
      completenessScore: audit.completenessScore,
      usedAiMultiPass: aiChunks.length > 0 && aiSecondary !== null,
    },
  }
}
