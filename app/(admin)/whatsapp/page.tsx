'use client'

import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  Send,
  CheckCircle2,
  PhoneCall,
  Clock,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  FileText,
  CreditCard,
  User,
  Phone,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { getDocuments, COLLECTIONS } from '@/lib/firebase/firestore'
import type { Client } from '@/lib/types'
import { generateWhatsAppLink, formatWhatsAppPhone, copyToClipboard } from '@/lib/utils'
import { CLIENT_TEMPLATES, formatTemplateForClient } from '@/lib/templates/clientTemplates'
import toast from 'react-hot-toast'

export default function WhatsAppPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [clientName, setClientName] = useState('Kwame Mensah')
  const [phoneNumber, setPhoneNumber] = useState('+233241234567')
  const [selectedTemplateId, setSelectedTemplateId] = useState('standard-intake')
  const [customMessage, setCustomMessage] = useState('')
  const [copied, setCopied] = useState(false)

  // Load existing clients
  useEffect(() => {
    getDocuments<Client>(COLLECTIONS.CLIENTS).then((data) => {
      if (data && data.length > 0) {
        setClients(data)
      }
    })
  }, [])

  // When client selection changes
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId)
    const c = clients.find((item) => item.id === clientId)
    if (c) {
      setClientName(c.fullName)
      setPhoneNumber(c.whatsappNumber || c.phone || '')
    }
  }

  // Update message when template or name changes
  useEffect(() => {
    const tpl = CLIENT_TEMPLATES.find((t) => t.id === selectedTemplateId) || CLIENT_TEMPLATES[0]
    setCustomMessage(formatTemplateForClient(tpl.text, { clientName: clientName || 'Valued Client' }))
  }, [selectedTemplateId, clientName])

  const phoneValidation = formatWhatsAppPhone(phoneNumber)

  const handleCopy = async () => {
    if (!customMessage.trim()) return
    const ok = await copyToClipboard(customMessage)
    if (ok) {
      setCopied(true)
      toast.success('Message copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenWhatsApp = () => {
    if (!customMessage.trim()) {
      toast.error('Message is empty')
      return
    }

    const phoneToUse = phoneNumber.trim()
    const url = generateWhatsAppLink(phoneToUse, customMessage)

    if (phoneToUse && !phoneValidation.isValid) {
      toast(`Note: "${phoneToUse}" might be invalid. Opening WhatsApp...`, { icon: '⚠️' })
    } else if (phoneToUse && phoneValidation.isValid) {
      toast.success(`Opening WhatsApp chat with ${phoneValidation.displayFormatted}...`)
    } else {
      toast('Opening WhatsApp with contact picker...', { icon: '💬' })
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <PageHeader
        title="WhatsApp Communication Hub"
        subtitle="Prepare client intake questionnaires, project briefs, and payment requests with ready-to-send WhatsApp links."
      />

      {/* Overview Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-800 to-emerald-900 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
            <Sparkles size={14} />
            <span>Direct WhatsApp Link Engine</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Seamless Manual-Send WhatsApp Integration
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed">
            Generate properly formatted <code className="bg-emerald-950/60 px-1.5 py-0.5 rounded text-emerald-300 font-mono">wa.me</code> links with pre-filled messages and payment links.
            Links launch WhatsApp or WhatsApp Web instantly, leaving you in complete control to review, edit, and send each message manually.
          </p>
        </div>
      </div>

      {/* Interactive Live Message Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 space-y-4 border-border bg-white rounded-2xl shadow-card">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <User size={16} className="text-emerald-600" />
              Recipient & Details
            </h3>

            {clients.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">Quick Select Existing Client</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">-- Custom / Manual Entry --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.whatsappNumber || c.phone || 'No phone'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Input
              label="Recipient Client Name"
              placeholder="e.g. Kwame Mensah"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              leftIcon={<User size={14} className="text-gray-400" />}
            />

            <div className="space-y-1">
              <Input
                label="WhatsApp Phone Number"
                placeholder="e.g. +233241234567 or 0241234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                leftIcon={<Phone size={14} className="text-gray-400" />}
              />
              {phoneNumber ? (
                <div className="text-[11px] pt-0.5">
                  {phoneValidation.isValid ? (
                    <span className="text-emerald-700 font-medium">
                      ✓ Valid: {phoneValidation.displayFormatted}
                    </span>
                  ) : (
                    <span className="text-amber-700">
                      ⚠️ {phoneValidation.error || 'Check country code prefix'}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 pt-0.5">
                  Leave empty to choose recipient directly inside WhatsApp.
                </p>
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-gray-700">Message Template</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {CLIENT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all ${
                      selectedTemplateId === tpl.id
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-950 font-semibold ring-1 ring-emerald-500'
                        : 'border-border bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{tpl.title}</span>
                      <Badge variant="muted" size="sm">{tpl.category}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Preview & Send */}
        <div className="lg:col-span-7">
          <Card className="p-5 space-y-4 border-border bg-white rounded-2xl shadow-card flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-emerald-600" />
                  <h3 className="font-bold text-gray-900 text-sm">Message Content (Editable)</h3>
                </div>
                <Badge variant="muted" size="sm">Ready to Send</Badge>
              </div>

              <textarea
                rows={11}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-300 bg-gray-50/60 focus:bg-white text-xs font-sans leading-relaxed focus:ring-2 focus:ring-emerald-500 outline-none transition-colors resize-none text-gray-800"
                placeholder="Type your WhatsApp message..."
              />
            </div>

            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <span className="text-[11px] text-muted truncate">
                  {phoneNumber ? (
                    phoneValidation.isValid ? (
                      <span className="text-emerald-700 font-medium">To: {phoneValidation.displayFormatted}</span>
                    ) : (
                      <span className="text-amber-700">To: {phoneNumber}</span>
                    )
                  ) : (
                    'Will open WhatsApp contact picker'
                  )}
                </span>

                <div className="flex items-center gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    icon={copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}
                  >
                    {copied ? 'Copied!' : 'Copy Text'}
                  </Button>

                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={handleOpenWhatsApp}
                    icon={<ExternalLink size={14} />}
                  >
                    Open in WhatsApp
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 italic">
                * Clicking &quot;Open in WhatsApp&quot; launches WhatsApp with this pre-filled message for you to review and send manually.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Feature capabilities */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Send size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">Direct wa.me Link Architecture</h4>
          <p className="text-xs text-muted">
            Zero API fees, setup tokens, or complex webhooks. Works instantly on mobile WhatsApp and desktop WhatsApp Web.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">Pre-Filled Intake & Quotes</h4>
          <p className="text-xs text-muted">
            Intake forms, missing client info requests, and project briefs are dynamically populated with client names.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CreditCard size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">Payment Links & Receipts</h4>
          <p className="text-xs text-muted">
            Prepared messages automatically embed secure tokenized Paystack payment links and direct Bank/MoMo merchant details.
          </p>
        </div>
      </div>
    </div>
  )
}

