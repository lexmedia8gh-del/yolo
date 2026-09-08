import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"

export const dynamic = "force-dynamic"

export interface ParsedClientResponse {
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
}

// Fallback rule-based extractor when AI API is unavailable or returns an error
function fallbackExtract(text: string): ParsedClientResponse {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  let fullName = ""
  let email = ""
  let phone = ""
  let whatsappNumber = ""
  let company = ""
  let address = ""
  let serviceOrProject = ""
  let budget = ""
  let timeline = ""
  const extractedNotes: string[] = []
  const usefulDetails: string[] = []

  // 1. Extract Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) {
    email = emailMatch[0].trim()
  }

  // 2. Extract Phone numbers
  const phoneMatches = text.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g)
  if (phoneMatches) {
    const validPhones = phoneMatches.map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 9)
    if (validPhones.length > 0) {
      phone = validPhones[0]
      whatsappNumber = validPhones.length > 1 ? validPhones[1] : validPhones[0]
    }
  }

  // Look for explicit WhatsApp mention
  const waMatch = text.match(/(?:whatsapp|wa|watsap)[:\s-]*([+\d\s()-]{9,20})/i)
  if (waMatch) {
    whatsappNumber = waMatch[1].trim()
  }

  // 3. Scan line-by-line for labeled keys
  for (const line of lines) {
    const lower = line.toLowerCase()

    if (/^(?:name|client|full name|contact person)[:\s-]+/i.test(line)) {
      fullName = line.replace(/^(?:name|client|full name|contact person)[:\s-]+/i, "").trim()
    } else if (/^(?:company|brand|business|organization|org)[:\s-]+/i.test(line)) {
      company = line.replace(/^(?:company|brand|business|organization|org)[:\s-]+/i, "").trim()
    } else if (/^(?:address|location|city|town|based in)[:\s-]+/i.test(line)) {
      address = line.replace(/^(?:address|location|city|town|based in)[:\s-]+/i, "").trim()
    } else if (/^(?:service|project|requirement|package|scope)[:\s-]+/i.test(line)) {
      serviceOrProject = line.replace(/^(?:service|project|requirement|package|scope)[:\s-]+/i, "").trim()
    } else if (/^(?:budget|cost|price|fee)[:\s-]+/i.test(line)) {
      budget = line.replace(/^(?:budget|cost|price|fee)[:\s-]+/i, "").trim()
    } else if (/^(?:timeline|deadline|date|delivery date)[:\s-]+/i.test(line)) {
      timeline = line.replace(/^(?:timeline|deadline|date|delivery date)[:\s-]+/i, "").trim()
    } else if (!line.includes("@") && !phoneMatches?.some((p) => line.includes(p))) {
      // Potentially conversational text or note
      if (line.length > 15) {
        extractedNotes.push(line)
      }
    }
  }

  // 4. Conversational extraction if Name is still empty
  if (!fullName) {
    const namePatterns = [
      /(?:i am|i'm|my name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
      /(?:client|contact)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    ]
    for (const pat of namePatterns) {
      const match = text.match(pat)
      if (match) {
        fullName = match[1].trim()
        break
      }
    }
    if (!fullName && lines.length > 0) {
      // First line if 2-3 capitalized words
      const words = lines[0].split(/\s+/)
      if (words.length >= 2 && words.length <= 4 && /^[A-Z]/.test(words[0]) && !/^(hi|hello|dear|good)/i.test(words[0])) {
        fullName = lines[0]
      }
    }
  }

  // 5. Conversational Company extraction
  if (!company) {
    const compMatch = text.match(/(?:from|founder of|ceo of|representing|run|running)\s+([A-Z][A-Za-z0-9\s&'-]+?(?:\s+(?:Ltd|LLC|Inc|Studios|Agency|Group|Tech|Store|Shop|Solutions|Enterprises|Logistics|Designs))?)(?:[,.\n]|$)/i)
    if (compMatch) {
      company = compMatch[1].trim()
    }
  }

  // 6. Conversational Address / Location extraction
  if (!address) {
    const locMatch = text.match(/(?:based in|located at|located in|living in|from)\s+([A-Z][a-zA-Z\s,]+?(?:Accra|Kumasi|Tema|Takoradi|Cape Coast|Tamale|East Legon|Airport|Osu|Spintex|Ghana|Nigeria|UK|USA|London|New York|[A-Z][a-z]+))(?:[,.\n]|$)/i)
    if (locMatch) {
      address = locMatch[1].trim()
    }
  }

  // 7. Conversational Service / Project extraction
  if (!serviceOrProject) {
    const serviceKeywords = [
      "logo design", "brand identity", "branding", "flyer design", "flyer",
      "social media design", "social media", "website design", "website",
      "video production", "video editing", "photography", "photoshoot",
      "retouching", "packaging", "brochure", "business cards"
    ]
    for (const kw of serviceKeywords) {
      if (new RegExp(`\\b${kw}\\b`, "i").test(text)) {
        serviceOrProject = kw.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
        break
      }
    }
  }

  // 8. Budget extraction
  if (!budget) {
    const budgetMatch = text.match(/(?:GHS|GH₵|\$|£|€|USD)\s*[\d,]+(?:\.\d{2})?|\b[\d,]+\s*(?:GHS|cedis|dollars|pounds)/i)
    if (budgetMatch) {
      budget = budgetMatch[0].trim()
    }
  }

  // 9. Timeline extraction
  if (!timeline) {
    const timelineMatch = text.match(/(?:by|before|deadline|timeline|needed)\s+([a-zA-Z0-9\s,]+?(?:next week|end of month|this week|friday|monday|urgent|asap|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+))/i)
    if (timelineMatch) {
      timeline = timelineMatch[1].trim()
    }
  }

  // Build useful details
  if (serviceOrProject) usefulDetails.push(`Requested Service: ${serviceOrProject}`)
  if (budget) usefulDetails.push(`Stated Budget: ${budget}`)
  if (timeline) usefulDetails.push(`Timeline / Deadline: ${timeline}`)
  if (company) usefulDetails.push(`Brand / Organization: ${company}`)
  if (address) usefulDetails.push(`Location: ${address}`)

  const combinedNotes = [
    serviceOrProject ? `Service requested: ${serviceOrProject}` : null,
    budget ? `Budget: ${budget}` : null,
    timeline ? `Timeline: ${timeline}` : null,
    ...extractedNotes.slice(0, 3),
  ].filter(Boolean).join("\n")

  const availableFields: string[] = []
  const missingFields: string[] = []

  if (fullName) availableFields.push("Client Name")
  else missingFields.push("Client Name")

  if (phone) availableFields.push("Phone Number")
  else missingFields.push("Phone Number")

  if (whatsappNumber) availableFields.push("WhatsApp Number")
  else missingFields.push("WhatsApp Number")

  if (email) availableFields.push("Email Address")
  else missingFields.push("Email Address")

  if (company) availableFields.push("Company / Brand")
  else missingFields.push("Company / Brand")

  if (address) availableFields.push("Location / Address")
  else missingFields.push("Location / Address")

  if (serviceOrProject) availableFields.push("Service or Project")
  else missingFields.push("Service or Project")

  return {
    fullName,
    email,
    phone,
    whatsappNumber: whatsappNumber || phone,
    company,
    address,
    serviceOrProject,
    notes: combinedNotes || text.slice(0, 200),
    budget,
    timeline,
    availableFields,
    missingFields,
    usefulDetails,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 })
    }

    const trimmedText = text.trim()
    let result: ParsedClientResponse = fallbackExtract(trimmedText)

    // Try Gemini AI if API key is present
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const prompt = `You are a smart client intake assistant for a creative design and media agency.
Analyze this unstructured text (which may be a WhatsApp message, email, meeting note, or client conversation) and extract structured client details.

Return a JSON object with strictly these keys:
- fullName: string (The person's full name, or empty string if not found)
- email: string (Valid email address, or empty string if not found)
- phone: string (Primary contact phone number, or empty string)
- whatsappNumber: string (WhatsApp number if specified or primary phone, or empty string)
- company: string (Business, company, or brand name, or empty string)
- address: string (City, town, physical address, or location, or empty string)
- serviceOrProject: string (The specific creative service, project, or package requested, e.g., Logo Design, Social Media Flyers, Brand Identity, etc., or empty string)
- budget: string (Stated budget or price if mentioned, e.g., "GHS 3,000" or "$500", or empty string)
- timeline: string (Stated deadline or timeline if mentioned, e.g., "2 weeks" or "Urgent by Friday", or empty string)
- notes: string (A concise professional summary of the client's request, context, specific preferences, and requirements)
- usefulDetails: string[] (A list of 2 to 4 concise bullet points of useful information discovered in the message)

Input Text:
"""
${trimmedText}
"""`

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        })

        const resultText = response.text || "{}"
        const parsed = JSON.parse(resultText)

        // Merge AI findings, falling back to regex when AI returns empty
        const fullName = (parsed.fullName && parsed.fullName.trim()) || result.fullName
        const email = (parsed.email && parsed.email.trim()) || result.email
        const phone = (parsed.phone && parsed.phone.trim()) || result.phone
        const whatsappNumber = (parsed.whatsappNumber && parsed.whatsappNumber.trim()) || result.whatsappNumber || phone
        const company = (parsed.company && parsed.company.trim()) || result.company
        const address = (parsed.address && parsed.address.trim()) || result.address
        const serviceOrProject = (parsed.serviceOrProject && parsed.serviceOrProject.trim()) || result.serviceOrProject
        const budget = (parsed.budget && parsed.budget.trim()) || result.budget
        const timeline = (parsed.timeline && parsed.timeline.trim()) || result.timeline

        let notes = (parsed.notes && parsed.notes.trim()) || result.notes
        if (serviceOrProject && !notes.toLowerCase().includes(serviceOrProject.toLowerCase())) {
          notes = `Requested: ${serviceOrProject}\n${notes}`
        }

        const availableFields: string[] = []
        const missingFields: string[] = []

        if (fullName) availableFields.push("Client Name")
        else missingFields.push("Client Name")

        if (phone) availableFields.push("Phone Number")
        else missingFields.push("Phone Number")

        if (whatsappNumber) availableFields.push("WhatsApp Number")
        else missingFields.push("WhatsApp Number")

        if (email) availableFields.push("Email Address")
        else missingFields.push("Email Address")

        if (company) availableFields.push("Company / Brand")
        else missingFields.push("Company / Brand")

        if (address) availableFields.push("Location / Address")
        else missingFields.push("Location / Address")

        if (serviceOrProject) availableFields.push("Service or Project")
        else missingFields.push("Service or Project")

        let usefulDetails: string[] = Array.isArray(parsed.usefulDetails) && parsed.usefulDetails.length > 0
          ? parsed.usefulDetails
          : result.usefulDetails

        if (usefulDetails.length === 0) {
          if (serviceOrProject) usefulDetails.push(`Requested Service: ${serviceOrProject}`)
          if (budget) usefulDetails.push(`Budget: ${budget}`)
          if (timeline) usefulDetails.push(`Timeline: ${timeline}`)
        }

        result = {
          fullName,
          email,
          phone,
          whatsappNumber,
          company,
          address,
          serviceOrProject,
          notes,
          budget,
          timeline,
          availableFields,
          missingFields,
          usefulDetails,
        }
      } catch (geminiError) {
        console.warn("[parse-client] Gemini extraction warning, using deterministic fallback:", geminiError)
        // Fallback result is already populated
      }
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[parse-client] Error:", error)
    return NextResponse.json({ error: error.message || "Failed to parse client info" }, { status: 500 })
  }
}

