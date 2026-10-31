'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  User,
  FileText,
  Search,
  Users,
  CheckSquare,
  Square,
  AlertCircle,
  ExternalLink,
  Plus,
  X,
  Sparkles,
  Building2,
  FolderKanban,
} from 'lucide-react'
import { DEFAULT_DISPATCH_TEMPLATES, substitutePlaceholders, type MessageTemplate } from '@/lib/templates/dispatchTemplates'
import { getAdminAuthHeaders } from '@/lib/firebase/auth'
import { getDocuments, COLLECTIONS } from '@/lib/firebase/firestore'
import { fetchWithTimeout, formatActionError } from '@/lib/utils'
import type { Project } from '@/lib/types'
import toast from 'react-hot-toast'

export interface ClientTarget {
  id: string
  name: string
  email?: string
  phone?: string
  companyName?: string
}

export interface DispatchResultItem {
  recipient: string
  recipientName: string
  status: 'sent' | 'failed'
  messageId?: string
  error?: string
}

interface MultiChannelDispatchModalProps {
  isOpen: boolean
  onClose: () => void
  initialClient?: ClientTarget | null
  clientList?: ClientTarget[]
  onSuccess?: () => void
}

export function MultiChannelDispatchModal({
  isOpen,
  onClose,
  initialClient,
  clientList = [],
  onSuccess,
}: MultiChannelDispatchModalProps) {
  const [activeTab, setActiveTab] = useState<'compose' | 'preview' | 'history'>('compose')
  const [channel, setChannel] = useState<'email' | 'sms'>('email')

  // Recipient Selection state
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [customRecipients, setCustomRecipients] = useState<
    Array<{ id: string; name: string; email: string; phone: string }>
  >([])
  
  // Custom manual recipient form inputs
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customEmail, setCustomEmail] = useState('')
  const [customPhone, setCustomPhone] = useState('')

  // Projects for selected client(s)
  const [clientProjects, setClientProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  // Branding settings state for live preview
  const [brandingSettings, setBrandingSettings] = useState<{
    businessName: string
    logoUrl: string
    primaryColor: string
    secondaryColor: string
    accentColor: string
  }>({
    businessName: 'LEXMEDIA.GH',
    logoUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e293b',
    accentColor: '#38bdf8',
  })

  // Template & Content state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('welcome-onboarding')
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [portalPath, setPortalPath] = useState('/login')
  const [projectName, setProjectName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [outstandingBalance, setOutstandingBalance] = useState('')

  // Status & Results state
  const [isSending, setIsSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dispatchResults, setDispatchResults] = useState<DispatchResultItem[]>([])
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Initialize selected client when modal opens or initialClient prop changes
  useEffect(() => {
    if (!isOpen) {
      setIsSending(false)
      return
    }
    if (initialClient?.id) {
      setSelectedClientIds([initialClient.id])
    } else if (clientList.length > 0) {
      setSelectedClientIds([clientList[0].id])
    }
  }, [initialClient?.id, isOpen, clientList])

  // Fetch branding settings & projects when modal opens or client selection changes
  useEffect(() => {
    if (!isOpen) return

    async function loadWorkspaceData() {
      try {
        const authHeaders = await getAdminAuthHeaders()
        const brandingRes = await fetchWithTimeout('/api/branding', {
          headers: authHeaders,
          timeoutMs: 10000,
        }).catch(() => null)
        if (brandingRes?.ok) {
          const brandingJson = await brandingRes.json().catch(() => null)
          if (brandingJson?.branding) {
            const b = brandingJson.branding
            setBrandingSettings((prev) => ({
              businessName: b.businessName || prev.businessName,
              logoUrl: b.logoUrl || b.logoLightUrl || prev.logoUrl,
              primaryColor: b.buttonColor || b.primaryColor || prev.primaryColor,
              secondaryColor: b.secondaryColor || prev.secondaryColor,
              accentColor: b.accentColor || prev.accentColor,
            }))
          }
        }

        const fetchedProjects = await getDocuments<Project>(COLLECTIONS.PROJECTS)
        if (Array.isArray(fetchedProjects)) {
          const primaryId = selectedClientIds[0]
          if (primaryId) {
            const filtered = fetchedProjects.filter((p: any) => p.clientId === primaryId)
            setClientProjects(filtered)
          } else {
            setClientProjects(fetchedProjects)
          }
        }
      } catch (err) {
        console.warn('Could not load workspace auxiliary data:', err)
      }
    }

    void loadWorkspaceData()
  }, [isOpen, selectedClientIds])

  // Load selected template content
  useEffect(() => {
    if (selectedTemplateId) {
      const tmpl = DEFAULT_DISPATCH_TEMPLATES.find((t) => t.id === selectedTemplateId)
      if (tmpl) {
        setSubject(tmpl.subject)
        setBody(tmpl.body)
      }
    }
  }, [selectedTemplateId])

  // Filtered Client List
  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return clientList
    const q = clientSearchQuery.toLowerCase()
    return clientList.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q)
    )
  }, [clientList, clientSearchQuery])

  // Toggle client selection
  const toggleClientSelect = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleSelectAllClients = () => {
    if (selectedClientIds.length === filteredClients.length) {
      setSelectedClientIds([])
    } else {
      setSelectedClientIds(filteredClients.map((c) => c.id))
    }
  }

  const handleAddCustomRecipient = () => {
    if (!customName.trim()) return
    if (channel === 'email' && (!customEmail || !customEmail.includes('@'))) return
    if (channel === 'sms' && !customPhone.trim()) return

    const newCustom = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: customName.trim(),
      email: customEmail.trim(),
      phone: customPhone.trim(),
    }

    setCustomRecipients((prev) => [...prev, newCustom])
    setSelectedClientIds((prev) => [...prev, newCustom.id])
    setCustomName('')
    setCustomEmail('')
    setCustomPhone('')
    setShowAddCustom(false)
  }

  const handleRemoveCustomRecipient = (id: string) => {
    setCustomRecipients((prev) => prev.filter((c) => c.id !== id))
    setSelectedClientIds((prev) => prev.filter((i) => i !== id))
  }

  // Handle Project Selection -> Auto-populate portal link and project details
  const handleProjectSelect = (projId: string) => {
    setSelectedProjectId(projId)
    const found: any = clientProjects.find((p) => p.id === projId)
    if (found) {
      setProjectName(found.name || '')
      if (found.deliveryAccessToken) {
        setPortalPath(`/delivery/${found.deliveryAccessToken}`)
      } else if (found.id) {
        setPortalPath(`/projects/${found.id}`)
      }
      if (found.totalAmount) {
        setOutstandingBalance(`GH₵${found.totalAmount}`)
      }
    }
  }

  // Active target recipient objects
  const activeRecipients = useMemo(() => {
    const list: Array<{ recipientName: string; recipientEmail: string; recipientPhone: string; clientId: string }> = []
    
    selectedClientIds.forEach((id) => {
      const foundClient = clientList.find((c) => c.id === id)
      if (foundClient) {
        list.push({
          recipientName: foundClient.name || 'Valued Client',
          recipientEmail: foundClient.email || '',
          recipientPhone: foundClient.phone || '',
          clientId: foundClient.id,
        })
      } else {
        const foundCustom = customRecipients.find((c) => c.id === id)
        if (foundCustom) {
          list.push({
            recipientName: foundCustom.name,
            recipientEmail: foundCustom.email,
            recipientPhone: foundCustom.phone,
            clientId: foundCustom.id,
          })
        }
      }
    })

    return list
  }, [selectedClientIds, clientList, customRecipients])

  // Fetch History
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const authHeaders = await getAdminAuthHeaders()
      const primaryClientId = selectedClientIds[0] || ''
      const url = primaryClientId
        ? `/api/dispatch?clientId=${encodeURIComponent(primaryClientId)}`
        : '/api/dispatch?limit=15'
      const res = await fetchWithTimeout(url, { headers: authHeaders, timeoutMs: 12000 })
      if (res.ok) {
        const json = await res.json()
        if (json?.ok && Array.isArray(json.history)) {
          setRecentLogs(json.history)
        }
      }
    } catch {
      // Non-blocking history fetch
    } finally {
      setIsLoadingHistory(false)
    }
  }, [selectedClientIds])

  useEffect(() => {
    if (isOpen) {
      void fetchHistory()
    }
  }, [isOpen, fetchHistory])

  // Variable Substitutions Preview
  const sampleRecipient = activeRecipients[0] || { recipientName: 'Valued Client', clientId: 'LM-001' }

  const absolutePortalUrl = portalPath.startsWith('http')
    ? portalPath
    : typeof window !== 'undefined'
    ? `${window.location.origin}${portalPath.startsWith('/') ? '' : '/'}${portalPath}`
    : `https://lexmedia.gh${portalPath.startsWith('/') ? '' : '/'}${portalPath}`

  const previewSubject = substitutePlaceholders(subject, {
    clientName: sampleRecipient.recipientName,
    clientId: sampleRecipient.clientId,
    projectName: projectName || 'Media Production Project',
    invoiceNumber: invoiceNumber || 'INV-1001',
    outstandingBalance: outstandingBalance || 'GH₵0.00',
    loginUrl: absolutePortalUrl,
    companyName: brandingSettings.businessName,
  })

  const previewBody = substitutePlaceholders(body, {
    clientName: sampleRecipient.recipientName,
    clientId: sampleRecipient.clientId,
    projectName: projectName || 'Media Production Project',
    invoiceNumber: invoiceNumber || 'INV-1001',
    outstandingBalance: outstandingBalance || 'GH₵0.00',
    loginUrl: absolutePortalUrl,
    companyName: brandingSettings.businessName,
  })

  // Insert Variable helper
  const insertVariable = (varName: string) => {
    setBody((prev) => `${prev} {{${varName}}}`)
  }

  // Execute Batch Dispatch with Guaranteed finally loading reset
  const handleSendDispatch = async () => {
    if (isSending) return
    setStatusMessage(null)
    setDispatchResults([])

    if (activeRecipients.length === 0) {
      const msg = 'Please select at least one recipient.'
      setStatusMessage({ type: 'error', text: msg })
      toast.error(msg)
      return
    }

    if (!body.trim()) {
      const msg = 'Message body content cannot be empty.'
      setStatusMessage({ type: 'error', text: msg })
      toast.error(msg)
      return
    }

    if (channel === 'email') {
      const missingEmails = activeRecipients.filter((r) => !r.recipientEmail || !r.recipientEmail.includes('@'))
      if (missingEmails.length === activeRecipients.length) {
        const msg = 'All selected recipients lack a valid email address.'
        setStatusMessage({ type: 'error', text: msg })
        toast.error(msg)
        return
      }
    }

    if (channel === 'sms') {
      const missingPhones = activeRecipients.filter((r) => !r.recipientPhone)
      if (missingPhones.length === activeRecipients.length) {
        const msg = 'All selected recipients lack a phone number for SMS.'
        setStatusMessage({ type: 'error', text: msg })
        toast.error(msg)
        return
      }
    }

    setIsSending(true)

    try {
      const authHeaders = await getAdminAuthHeaders()
      const res = await fetchWithTimeout('/api/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          channel,
          recipients: activeRecipients,
          templateId: selectedTemplateId,
          subject,
          body,
          portalUrl: portalPath,
          projectName,
          invoiceNumber,
          outstandingBalance,
        }),
        timeoutMs: 25000,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete dispatch request.')
      }

      if (Array.isArray(data.results)) {
        setDispatchResults(data.results)
      }

      const sentCount = data.sentCount ?? (data.ok ? activeRecipients.length : 0)
      const failedCount = data.failedCount ?? 0

      if (sentCount > 0 && failedCount === 0) {
        const msg = `Message dispatched successfully to ${sentCount} recipient${sentCount === 1 ? '' : 's'}!`
        setStatusMessage({ type: 'success', text: msg })
        toast.success(msg)
      } else if (sentCount > 0 && failedCount > 0) {
        const msg = `Partial dispatch: ${sentCount} sent, ${failedCount} failed. Review recipient results below.`
        setStatusMessage({ type: 'success', text: msg })
        toast.error(msg)
      } else {
        const msg = `Dispatch failed for all recipients.${data.error ? ` ${data.error}` : ''}`
        setStatusMessage({ type: 'error', text: msg })
        toast.error(msg)
      }

      void fetchHistory()
      if (onSuccess && sentCount > 0) onSuccess()
    } catch (err: any) {
      const msg = formatActionError(err, 'Failed to process dispatch delivery.')
      setStatusMessage({ type: 'error', text: msg })
      toast.error(msg)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSending) onClose()
      }}
      preventClose={isSending}
      title="Multi-Channel Dispatch Workspace"
      size="xl"
    >
      <div className="space-y-5">
        {/* Workspace Top Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('compose')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'compose'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-blue-400" />
              <span>Compose &amp; Dispatch</span>
              {activeRecipients.length > 0 && (
                <Badge className="bg-blue-900 text-blue-300 text-[10px] px-1.5 py-0 ml-1">
                  {activeRecipients.length}
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'preview'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Live Branded Preview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dispatch History</span>
            </button>
          </div>

          {/* Delivery Channel Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                channel === 'email'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Brevo Email</span>
            </button>
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                channel === 'sms'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>SMS</span>
            </button>
          </div>
        </div>

        {/* TAB 1: COMPOSE & DISPATCH */}
        {activeTab === 'compose' && (
          <div className="space-y-4">
            {/* Recipient Selection Section */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Select Target Recipients ({activeRecipients.length} Selected)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllClients}
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {selectedClientIds.length === filteredClients.length ? 'Deselect All' : 'Select All Filtered'}
                  </button>
                  <span className="text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => setShowAddCustom(!showAddCustom)}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Custom Recipient
                  </button>
                </div>
              </div>

              {/* Client Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <Input
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  placeholder="Search client directory by name, company, or email..."
                  className="pl-8 bg-slate-900 border-slate-800 text-slate-200 text-xs h-8 focus:border-blue-500"
                />
              </div>

              {/* Custom Manual Recipient Drawer */}
              {showAddCustom && (
                <div className="bg-slate-900/90 border border-emerald-800/60 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-medium text-emerald-300 flex items-center justify-between">
                    <span>Add Manual / Unregistered Recipient</span>
                    <button type="button" onClick={() => setShowAddCustom(false)}>
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Name (e.g. John Mensah)"
                      className="bg-slate-950 border-slate-800 text-xs h-8"
                    />
                    <Input
                      type="email"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="Email (e.g. john@example.com)"
                      className="bg-slate-950 border-slate-800 text-xs h-8"
                    />
                    <Input
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="Phone (+233 24 000 0000)"
                      className="bg-slate-950 border-slate-800 text-xs h-8"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddCustomRecipient}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-3 rounded-md"
                  >
                    Add Recipient To Batch
                  </Button>
                </div>
              )}

              {/* Client List Selector */}
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {filteredClients.map((client) => {
                  const isChecked = selectedClientIds.includes(client.id)
                  return (
                    <div
                      key={client.id}
                      onClick={() => toggleClientSelect(client.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border text-xs ${
                        isChecked
                          ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                          : 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span className="font-medium text-slate-200 truncate">
                          {client.name} {client.companyName ? `(${client.companyName})` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono shrink-0">
                        {channel === 'email' ? client.email || 'No Email' : client.phone || 'No Phone'}
                      </div>
                    </div>
                  )
                })}

                {customRecipients.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-xs text-emerald-200"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-medium">{c.name} (Custom)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-emerald-400">
                        {channel === 'email' ? c.email : c.phone}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveCustomRecipient(c.id)
                        }}
                      >
                        <X className="w-3.5 h-3.5 text-red-400 hover:text-red-300" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Project Association Picker (Crucial for View Portal navigation) */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-indigo-400" />
                Associated Project (For Secure Portal Link &amp; View Portal Button)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={selectedProjectId}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- General Portal / Login URL --</option>
                  {clientProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.status || 'Active'}]
                    </option>
                  ))}
                </select>
                <Input
                  value={portalPath}
                  onChange={(e) => setPortalPath(e.target.value)}
                  placeholder="Portal URL path (e.g. /delivery/token)"
                  className="bg-slate-900 border-slate-800 text-xs h-9 font-mono"
                />
              </div>
            </div>

            {/* Template Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Select Reusable Message Template
                </label>
                <div className="flex items-center gap-1 text-[10px]">
                  {['all', 'welcome', 'dispatch', 'invoice', 'payment_reminder'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTemplateCategoryFilter(cat)}
                      className={`px-2 py-0.5 rounded-full capitalize border transition-all ${
                        templateCategoryFilter === cat
                          ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {DEFAULT_DISPATCH_TEMPLATES.filter(
                  (t) => templateCategoryFilter === 'all' || t.category === templateCategoryFilter
                ).map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all text-xs ${
                      selectedTemplateId === tmpl.id
                        ? 'bg-blue-600/20 border-blue-500 text-white font-semibold shadow-sm'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <div className="truncate font-semibold">{tmpl.name}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{tmpl.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Composer Editor */}
            <div className="space-y-3">
              {channel === 'email' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Subject Line</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject line..."
                    className="bg-slate-950 border-slate-800 text-slate-100 text-xs font-medium h-9 focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400 block">
                    Message Body Content
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span>Insert Variable:</span>
                    {['clientName', 'projectName', 'invoiceNumber', 'outstandingBalance', 'loginUrl'].map(
                      (v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVariable(v)}
                          className="bg-slate-900 border border-slate-800 hover:border-blue-500 hover:text-blue-300 px-1.5 py-0.5 rounded text-slate-400 font-mono"
                        >
                          {`{{${v}}}`}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={channel === 'sms' ? 4 : 5}
                  placeholder="Write your message here..."
                  className="w-full rounded-xl border p-3 bg-slate-950 border-slate-800 text-slate-100 text-xs font-mono leading-relaxed focus:border-blue-500 outline-none"
                />
              </div>

              {/* Optional Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                <div>
                  <span className="text-[11px] font-medium text-slate-400 block mb-1">
                    Project Name
                  </span>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Corporate Documentary"
                    className="bg-slate-900 border-slate-800 text-xs h-8 focus:border-blue-500"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-medium text-slate-400 block mb-1">
                    Invoice # / Outstanding Balance
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="INV-001"
                      className="bg-slate-900 border-slate-800 text-xs h-8"
                    />
                    <Input
                      value={outstandingBalance}
                      onChange={(e) => setOutstandingBalance(e.target.value)}
                      placeholder="GH₵500"
                      className="bg-slate-900 border-slate-800 text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Message Banner */}
            {statusMessage && (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                    : 'bg-red-950/80 border-red-700 text-red-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-medium">{statusMessage.text}</span>
                </div>
              </div>
            )}

            {/* Per Recipient Results Table */}
            {dispatchResults.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Dispatch Delivery Results
                </div>
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {dispatchResults.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{r.recipientName}</span>
                        <span className="text-slate-500 font-mono text-[11px]">({r.recipient})</span>
                      </div>
                      <Badge
                        className={`text-[10px] capitalize ${
                          r.status === 'sent'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-red-950 text-red-300 border-red-800'
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isSending}
                onClick={onClose}
                className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
              >
                Close
              </Button>

              <Button
                type="button"
                onClick={handleSendDispatch}
                loading={isSending}
                loadingText={`Dispatching (${activeRecipients.length})...`}
                disabled={isSending || activeRecipients.length === 0}
                icon={<Send className="w-4 h-4" />}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-blue-600/20"
              >
                Dispatch Message ({activeRecipients.length} Target{activeRecipients.length === 1 ? '' : 's'})
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE BRANDED PREVIEW */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Live Substituted Email Card Preview (Branding Settings &amp; Project Linked)
                </span>
                <Badge className="bg-blue-950 text-blue-400 border-blue-800/60 text-[10px]">
                  BREVO HTML TEMPLATE
                </Badge>
              </div>

              {/* Mock HTML Email Frame matching backend renderDispatchEmailTemplate */}
              <div className="bg-[#0b1329] p-6 rounded-xl border border-slate-800 flex justify-center">
                <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-left border border-slate-200">
                  {/* Header */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-center text-white">
                    {brandingSettings.logoUrl ? (
                      <img
                        src={brandingSettings.logoUrl}
                        alt={brandingSettings.businessName}
                        className="max-h-12 mx-auto mb-2 object-contain"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-blue-500/20 border border-blue-400/40 rounded-xl flex items-center justify-center font-bold text-blue-400 mx-auto mb-2 text-lg">
                        LM
                      </div>
                    )}
                    <h1 className="text-lg font-bold tracking-tight text-white">{brandingSettings.businessName}</h1>
                    <p className="text-[11px] text-sky-400 uppercase tracking-wider font-semibold mt-0.5">
                      Client Notification &amp; Dispatch Portal
                    </p>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-4">
                    {channel === 'email' && (
                      <div className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                        Subject: <span className="font-normal text-slate-700">{previewSubject}</span>
                      </div>
                    )}

                    <div className="text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap">
                      {previewBody}
                    </div>

                    {/* Metadata Summary Box if available */}
                    {(projectName || invoiceNumber || outstandingBalance) && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                        {projectName && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Project:</span>
                            <span className="font-bold text-slate-900">{projectName}</span>
                          </div>
                        )}
                        {invoiceNumber && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Invoice #:</span>
                            <span className="font-bold text-slate-900">{invoiceNumber}</span>
                          </div>
                        )}
                        {outstandingBalance && (
                          <div className="flex justify-between text-rose-700">
                            <span className="font-medium">Balance Due:</span>
                            <span className="font-bold">{outstandingBalance}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CTA Button */}
                    <div className="pt-2 text-center">
                      <div
                        className="inline-block text-white text-xs font-bold px-6 py-3 rounded-lg shadow-md"
                        style={{ backgroundColor: brandingSettings.primaryColor }}
                      >
                        Access Client Portal &rarr;
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 truncate">
                        Link: <span className="font-mono text-blue-600">{absolutePortalUrl}</span>
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-slate-50 border-t border-slate-200 p-4 text-center text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    &copy; {brandingSettings.businessName} &bull; Digital Media Production
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DISPATCH HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                Recent Multi-Channel Communication History
              </span>
              <button
                type="button"
                disabled={isLoadingHistory}
                onClick={fetchHistory}
                className="text-[11px] text-slate-400 hover:text-white disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                {isLoadingHistory ? 'Refreshing...' : 'Refresh Logs'}
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-950/40 rounded-xl border border-slate-800">
                No dispatch logs found in database.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="default"
                          className={`text-[10px] uppercase font-mono ${
                            log.channel === 'sms'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : 'bg-blue-950 text-blue-400 border-blue-800'
                          }`}
                        >
                          {log.channel}
                        </Badge>
                        <span className="font-semibold text-slate-200">
                          {log.recipientName || log.recipientEmail || log.recipientPhone}
                        </span>
                      </div>
                      <Badge
                        className={`text-[10px] capitalize ${
                          log.status === 'sent' || log.status === 'delivered'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-red-950 text-red-300 border-red-800'
                        }`}
                      >
                        {log.status || 'sent'}
                      </Badge>
                    </div>

                    <p className="text-slate-400 text-[11px] line-clamp-2">{log.subject || log.body}</p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">
                      <span>Target: {log.recipientEmail || log.recipientPhone}</span>
                      <span>
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
