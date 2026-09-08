'use client'

import React, { useState, useEffect } from 'react'
import {
  FileText,
  Copy,
  Check,
  Send,
  Plus,
  Trash2,
  Phone,
  User,
  Sparkles,
  ExternalLink,
  MessageCircle,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { copyToClipboard, generateWhatsAppLink, formatWhatsAppPhone } from '@/lib/utils'
import {
  ClientTemplate,
  getStoredClientTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  formatTemplateForClient,
} from '@/lib/templates/clientTemplates'
import toast from 'react-hot-toast'

interface ClientInformationTemplatesModalProps {
  isOpen: boolean
  onClose: () => void
  defaultClientName?: string
  defaultPhoneNumber?: string
  missingFields?: string[]
}

export function ClientInformationTemplatesModal({
  isOpen,
  onClose,
  defaultClientName = '',
  defaultPhoneNumber = '',
  missingFields = [],
}: ClientInformationTemplatesModalProps) {
  const [templates, setTemplates] = useState<ClientTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('standard-intake')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [recipientPhone, setRecipientPhone] = useState<string>(defaultPhoneNumber)
  const [recipientName, setRecipientName] = useState<string>(defaultClientName)
  const [customText, setCustomText] = useState<string>('')
  const [copied, setCopied] = useState(false)

  // Custom template creation state
  const [isCreatingCustom, setIsCreatingCustom] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<'intake' | 'followup' | 'brief' | 'billing'>('intake')
  const [newDescription, setNewDescription] = useState('')
  const [newBody, setNewBody] = useState('')

  // Live phone validation
  const phoneValidation = formatWhatsAppPhone(recipientPhone)

  // Sync recipient props
  useEffect(() => {
    if (defaultPhoneNumber) setRecipientPhone(defaultPhoneNumber)
    if (defaultClientName) setRecipientName(defaultClientName)
  }, [defaultPhoneNumber, defaultClientName])

  // Load templates on open
  useEffect(() => {
    if (isOpen) {
      const loaded = getStoredClientTemplates()
      setTemplates(loaded)

      // If missingFields provided, prefer missing-info-followup
      const initialId = missingFields.length > 0 ? 'missing-info-followup' : 'standard-intake'
      setSelectedTemplateId(initialId)

      const target = loaded.find((t) => t.id === initialId) || loaded[0]
      if (target) {
        setCustomText(
          formatTemplateForClient(target.text, {
            clientName: defaultClientName,
            missingFields,
          })
        )
      }
    }
  }, [isOpen, defaultClientName, missingFields])

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0]

  // Update editor text when template selection changes
  const handleSelectTemplate = (tpl: ClientTemplate) => {
    setSelectedTemplateId(tpl.id)
    setCustomText(
      formatTemplateForClient(tpl.text, {
        clientName: recipientName,
        missingFields,
      })
    )
  }

  // Copy template text
  const handleCopy = async () => {
    if (!customText.trim()) {
      toast.error('Message text is empty.')
      return
    }
    const ok = await copyToClipboard(customText)
    if (ok) {
      setCopied(true)
      toast.success('Template copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Open WhatsApp with prefilled message
  const handleSendWhatsApp = () => {
    if (!customText.trim()) {
      toast.error('Template message is empty. Please enter some text.')
      return
    }

    const phoneToUse = recipientPhone.trim()
    const url = generateWhatsAppLink(phoneToUse, customText)
    
    if (phoneToUse && !phoneValidation.isValid) {
      toast(
        `Note: "${phoneToUse}" might be an incomplete phone number. Opening WhatsApp...`,
        { icon: '⚠️' }
      )
    } else if (phoneToUse && phoneValidation.isValid) {
      toast.success(`Opening WhatsApp chat with ${phoneValidation.displayFormatted}...`)
    } else {
      toast('Opening WhatsApp with contact picker...', { icon: '💬' })
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Save new custom template
  const handleSaveNewTemplate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error('Please enter a template title and message text')
      return
    }

    const saved = saveCustomTemplate({
      title: newTitle.trim(),
      category: newCategory,
      description: newDescription.trim() || 'Custom user template',
      text: newBody.trim(),
    })

    const updatedList = getStoredClientTemplates()
    setTemplates(updatedList)
    setSelectedTemplateId(saved.id)
    setCustomText(saved.text)
    setIsCreatingCustom(false)
    setNewTitle('')
    setNewDescription('')
    setNewBody('')
    toast.success('Custom template saved!')
  }

  // Delete custom template
  const handleDeleteTemplate = (id: string) => {
    deleteCustomTemplate(id)
    const updatedList = getStoredClientTemplates()
    setTemplates(updatedList)
    if (selectedTemplateId === id) {
      const fallback = updatedList[0]
      setSelectedTemplateId(fallback?.id || '')
      setCustomText(fallback?.text || '')
    }
    toast.success('Template deleted')
  }

  const filteredTemplates = templates.filter((t) => {
    if (activeCategory === 'all') return true
    if (activeCategory === 'custom') return t.isCustom
    return t.category === activeCategory
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Client Information Templates"
      size="xl"
    >
      <div className="space-y-5">
        <p className="text-xs text-muted -mt-2">
          Use pre-built or custom intake templates to request client information, project scopes, or missing contact details via WhatsApp or copyable text.
        </p>

        {/* Recipient Quick Context Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-border">
          <Input
            label="Client Name (optional)"
            placeholder="e.g. Kwame Mensah"
            value={recipientName}
            onChange={(e) => {
              setRecipientName(e.target.value)
              if (selectedTemplate) {
                setCustomText(
                  formatTemplateForClient(selectedTemplate.text, {
                    clientName: e.target.value,
                    missingFields,
                  })
                )
              }
            }}
            leftIcon={<User size={15} className="text-gray-400" />}
          />
          <div className="space-y-1">
            <Input
              label="Recipient Phone / WhatsApp"
              placeholder="e.g. +233 24 123 4567 or 0241234567"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              leftIcon={<Phone size={15} className="text-gray-400" />}
            />
            {recipientPhone ? (
              <div className="text-[11px] flex items-center gap-1.5 pt-0.5">
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
                Leave blank to choose recipient directly in WhatsApp.
              </p>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border pb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'All Templates' },
              { id: 'intake', label: 'Intake Forms' },
              { id: 'followup', label: 'Follow-ups' },
              { id: 'brief', label: 'Project Briefs' },
              { id: 'billing', label: 'Billing' },
              { id: 'custom', label: 'Custom' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-accent-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreatingCustom(!isCreatingCustom)}
            icon={<Plus size={14} />}
          >
            {isCreatingCustom ? 'Cancel' : 'New Template'}
          </Button>
        </div>

        {/* Custom Template Form */}
        {isCreatingCustom && (
          <form onSubmit={handleSaveNewTemplate} className="p-4 bg-accent-50/50 rounded-xl border border-accent-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Sparkles size={16} className="text-accent-600" />
                Create Custom Reusable Template
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Template Title *"
                  placeholder="e.g. Photography Session Questionnaire"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">Category</label>
                <select
                  value={newCategory}
                  onChange={(e: any) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium focus:ring-2 focus:ring-accent-500 outline-none"
                >
                  <option value="intake">Intake</option>
                  <option value="followup">Follow-up</option>
                  <option value="brief">Project Brief</option>
                  <option value="billing">Billing</option>
                </select>
              </div>
            </div>
            <Input
              label="Short Description"
              placeholder="Brief summary of when to use this template..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">
                Template Message (Supports <span className="font-mono text-accent-700">{'{clientName}'}</span> variable) *
              </label>
              <textarea
                rows={4}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Type your WhatsApp/message template here..."
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs focus:ring-2 focus:ring-accent-500 outline-none font-sans"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setIsCreatingCustom(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary">
                Save Template
              </Button>
            </div>
          </form>
        )}

        {/* Template Selection Grid & Message Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Template List */}
          <div className="lg:col-span-5 space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted border border-dashed rounded-xl">
                No templates found in this category.
              </div>
            ) : (
              filteredTemplates.map((tpl) => {
                const isSelected = tpl.id === selectedTemplateId
                return (
                  <div
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-accent-500 bg-accent-50/40 ring-1 ring-accent-500'
                        : 'border-border bg-white hover:border-gray-300 hover:bg-gray-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-xs text-gray-900 flex items-center gap-1.5">
                        <FileText size={14} className={isSelected ? 'text-accent-600' : 'text-gray-400'} />
                        <span className="truncate">{tpl.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {tpl.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteTemplate(tpl.id)
                            }}
                            className="text-gray-400 hover:text-danger-600 p-1 rounded-md transition-colors"
                            title="Delete custom template"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <Badge
                          variant={
                            tpl.category === 'intake'
                              ? 'default'
                              : tpl.category === 'followup'
                              ? 'warning'
                              : tpl.category === 'brief'
                              ? 'accent'
                              : 'muted'
                          }
                          size="sm"
                        >
                          {tpl.category}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted mt-1 line-clamp-2">{tpl.description}</p>
                  </div>
                )
              })
            )}
          </div>

          {/* Right Column: Live Message Preview & Customizer */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-border p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <h4 className="text-xs font-bold text-gray-900">{selectedTemplate?.title}</h4>
                <p className="text-[11px] text-muted">Review and customize the message before sending</p>
              </div>
              <Badge variant="muted" size="sm">Editable</Badge>
            </div>

            <textarea
              rows={11}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full p-3 text-xs bg-gray-50/60 rounded-xl border border-border font-sans focus:bg-white focus:ring-2 focus:ring-accent-500 outline-none resize-none leading-relaxed text-gray-800"
              placeholder="Template message text..."
            />

            {/* Actions Bar */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <span className="text-[11px] text-muted truncate">
                  {recipientPhone ? (
                    phoneValidation.isValid ? (
                      <span className="text-emerald-700 font-medium">To: {phoneValidation.displayFormatted}</span>
                    ) : (
                      <span className="text-amber-700">To: {recipientPhone}</span>
                    )
                  ) : (
                    'No phone specified (WhatsApp contact selector will open)'
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
                    onClick={handleSendWhatsApp}
                    icon={<MessageCircle size={15} />}
                  >
                    Open in WhatsApp
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 italic">
                * Clicking &quot;Open in WhatsApp&quot; launches WhatsApp with this pre-filled message for you to review and send manually.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
