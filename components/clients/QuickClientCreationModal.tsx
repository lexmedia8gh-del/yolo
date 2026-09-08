'use client'

import React, { useState } from 'react'
import {
  Sparkles,
  ClipboardPaste,
  ArrowRight,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { QuickInfoCheckCard } from '@/components/clients/QuickInfoCheckCard'
import { ClientInformationTemplatesModal } from '@/components/clients/ClientInformationTemplatesModal'
import type { ParsedClientResponse } from '@/app/api/admin/parse-client/route'
import toast from 'react-hot-toast'

interface QuickClientCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onApplyToNormalForm: (data: {
    fullName: string
    email: string
    phone: string
    whatsappNumber: string
    company: string
    address: string
    notes: string
    serviceOrProject?: string
  }) => void
  onClientCreatedDirectly?: (newClientId: string) => void
  saveClientDirectly?: (data: any) => Promise<string>
}

const SAMPLE_MESSAGES = [
  {
    title: 'WhatsApp Inquiry',
    text: `Hello Lexmedia team! My name is Kwame Boateng. I run K-Tech Solutions (info@ktech.com, 0244123456). We are based in Kumasi and need a full brand identity and logo design for our upcoming launch. Looking to finalize by end of next month. Stated budget is around GHS 4,500. Let me know the next steps!`,
  },
  {
    title: 'Instagram DM / Note',
    text: `Ama Serwaa here from Accra (East Legon). WhatsApp is +233 55 987 6543, email is amaserwaa.design@gmail.com. We need 10 social media flyers and product banners for our beauty brand 'Glow Essence'. Deadline is November 15th. Please send invoice details.`,
  },
  {
    title: 'Phone Call Scratchpad',
    text: `Client: David Osei
Phone: 0208112233
Company: Apex Logistics Ghana
Location: Tema Harbour Road
Needs corporate website design and company profile booklet.
Urgent: Launching in 2 weeks. Budget ~ $1,200.`,
  },
]

export function QuickClientCreationModal({
  isOpen,
  onClose,
  onApplyToNormalForm,
  onClientCreatedDirectly,
  saveClientDirectly,
}: QuickClientCreationModalProps) {
  const [rawText, setRawText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedClientResponse | null>(null)
  const [isSubmittingDirect, setIsSubmittingDirect] = useState(false)

  // Template follow-up modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setRawText(text)
        toast.success('Pasted from clipboard')
      }
    } catch {
      toast.error('Could not access clipboard. Please paste manually.')
    }
  }

  const handleAnalyze = async (textToAnalyze?: string) => {
    const targetText = (textToAnalyze || rawText).trim()
    if (!targetText) {
      toast.error('Please paste or type client information first')
      return
    }

    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/admin/parse-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetText }),
      })

      if (!res.ok) {
        throw new Error('Failed to analyze client text')
      }

      const data: ParsedClientResponse = await res.json()
      setParsedData(data)
      toast.success('Information analyzed successfully!')
    } catch (err: any) {
      console.error('Error analyzing text:', err)
      toast.error('Could not analyze information automatically.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleUpdateField = (field: keyof ParsedClientResponse, value: string) => {
    if (!parsedData) return
    const updated = { ...parsedData, [field]: value }

    // Recompute available/missing fields dynamically
    const coreFields: Array<{ key: keyof ParsedClientResponse; label: string }> = [
      { key: 'fullName', label: 'Client Name' },
      { key: 'phone', label: 'Phone Number' },
      { key: 'whatsappNumber', label: 'WhatsApp Number' },
      { key: 'email', label: 'Email Address' },
      { key: 'company', label: 'Company / Brand' },
      { key: 'address', label: 'Location / Address' },
      { key: 'serviceOrProject', label: 'Service or Project' },
    ]

    const available: string[] = []
    const missing: string[] = []

    coreFields.forEach(({ key, label }) => {
      const val = updated[key]
      if (typeof val === 'string' && val.trim()) {
        available.push(label)
      } else {
        missing.push(label)
      }
    })

    updated.availableFields = available
    updated.missingFields = missing

    setParsedData(updated)
  }

  const handleApplyToForm = () => {
    if (!parsedData) return
    onApplyToNormalForm({
      fullName: parsedData.fullName,
      email: parsedData.email,
      phone: parsedData.phone,
      whatsappNumber: parsedData.whatsappNumber || parsedData.phone,
      company: parsedData.company,
      address: parsedData.address,
      notes: parsedData.notes,
      serviceOrProject: parsedData.serviceOrProject,
    })
    onClose()
  }

  const handleDirectCreate = async () => {
    if (!parsedData || !saveClientDirectly) return
    if (!parsedData.fullName.trim()) {
      toast.error('Client name is required')
      return
    }

    setIsSubmittingDirect(true)
    try {
      const clientPayload = {
        fullName: parsedData.fullName.trim(),
        email: parsedData.email.trim() || `${parsedData.fullName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}@example.com`,
        phone: parsedData.phone.trim(),
        whatsappNumber: parsedData.whatsappNumber.trim() || parsedData.phone.trim(),
        company: parsedData.company.trim(),
        address: parsedData.address.trim(),
        notes: parsedData.notes.trim(),
        status: 'active',
        projectCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        createdBy: 'admin',
      }

      const newId = await saveClientDirectly(clientPayload)
      toast.success('Client created successfully!')
      onClose()

      // Attempt Welcome SMS if phone number is present
      const targetPhone = clientPayload.phone || clientPayload.whatsappNumber
      if (targetPhone) {
        try {
          const smsRes = await fetch('/api/sms/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: targetPhone,
              clientName: clientPayload.fullName,
              clientId: newId,
            }),
          })
          const smsData = await smsRes.json()
          if (smsRes.ok && smsData.success === true) {
            toast.success(smsData.message || 'Welcome SMS request accepted by provider')
          } else if (smsData?.error) {
            toast.error(`Welcome SMS notice: ${smsData.error}`, { duration: 5000 })
          }
        } catch (smsErr) {
          console.warn('Welcome SMS dispatch error:', smsErr)
        }
      }

      if (onClientCreatedDirectly) {
        onClientCreatedDirectly(newId)
      }
    } catch (err: any) {
      console.error('Direct creation failed:', err)
      toast.error('Failed to create client record')
    } finally {
      setIsSubmittingDirect(false)
    }
  }

  const handleReset = () => {
    setParsedData(null)
    setRawText('')
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Quick Client Creation"
        size="xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted -mt-2">
            Paste unstructured notes, WhatsApp messages, or conversations. The system automatically extracts contact details, project needs, and identifies missing information.
          </p>

          {!parsedData ? (
            /* Input State */
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardPaste size={15} className="text-accent-600" />
                    Paste Unstructured Client Information
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="text-xs font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1"
                  >
                    Paste from Clipboard
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Paste text here, for example:\n"Hi Lexmedia, this is Ama Mensah from Kumasi (0244123456, ama@company.com). We need a logo and branding for our new retail shop. Budget is 3500 GHS, needed by end of month."`}
                  className="w-full p-4 rounded-xl border border-border bg-gray-50/50 hover:bg-gray-50 focus:bg-white text-xs font-sans focus:ring-2 focus:ring-accent-500 outline-none leading-relaxed transition-all"
                />
              </div>

              {/* Sample Templates Quick-Load */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                  Or load a sample inquiry:
                </span>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_MESSAGES.map((sample) => (
                    <button
                      key={sample.title}
                      type="button"
                      onClick={() => {
                        setRawText(sample.text)
                        handleAnalyze(sample.text)
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-white hover:border-accent-400 hover:bg-accent-50/30 text-xs text-gray-700 transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles size={12} className="text-accent-600" />
                      {sample.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  disabled={!rawText.trim() || isAnalyzing}
                  loading={isAnalyzing}
                  onClick={() => handleAnalyze()}
                  icon={<Sparkles size={15} />}
                >
                  Analyze & Extract Information
                </Button>
              </div>
            </div>
          ) : (
            /* Results & Quick Info Check State */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-accent-50/60 p-3 rounded-xl border border-accent-200/80">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent-600" />
                  <span className="text-xs font-bold text-gray-900">Extracted Information Overview</span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-accent-700 hover:text-accent-900 font-medium flex items-center gap-1"
                >
                  <RefreshCw size={13} />
                  Analyze Different Text
                </button>
              </div>

              {/* Quick Information Check & Field Reviews */}
              <QuickInfoCheckCard
                parsedData={parsedData}
                onUpdateField={handleUpdateField}
                onRequestMissingInfo={() => setIsTemplateModalOpen(true)}
                onApplyToForm={handleApplyToForm}
                onDirectCreate={saveClientDirectly ? handleDirectCreate : undefined}
                isSubmitting={isSubmittingDirect}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Reusable Information Templates Modal for Follow-ups */}
      {isTemplateModalOpen && parsedData && (
        <ClientInformationTemplatesModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          defaultClientName={parsedData.fullName}
          defaultPhoneNumber={parsedData.whatsappNumber || parsedData.phone}
          missingFields={parsedData.missingFields}
        />
      )}
    </>
  )
}
