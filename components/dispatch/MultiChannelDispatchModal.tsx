'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  Mail,
  MessageSquare,
  Smartphone,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Users,
  CheckSquare,
  Square,
  AlertCircle,
  ExternalLink,
  Plus,
  X,
  FolderKanban,
  Copy,
  Check,
  Eye,
  History,
  FileText,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react'
import {
  DEFAULT_DISPATCH_TEMPLATES,
  substitutePlaceholders,
  type MessageTemplate,
} from '@/lib/templates/dispatchTemplates'
import {
  renderDispatchEmailTemplate,
  type EmailBrandingOptions,
} from '@/lib/templates/dispatchEmailRenderer'
import { getAdminAuthHeaders } from '@/lib/firebase/auth'
import { getDocuments, COLLECTIONS } from '@/lib/firebase/firestore'
import {
  cn,
  copyToClipboard,
  fetchWithTimeout,
  formatActionError,
  formatCurrency,
  formatDateTime,
  formatWhatsAppPhone,
  getInitials,
  openExternalUrl,
} from '@/lib/utils'
import toast from 'react-hot-toast'

export interface ClientTarget {
  id: string
  name: string
  email?: string
  phone?: string
  companyName?: string
}

export interface DispatchProjectRecord {
  id: string
  clientId: string
  clientName?: string
  name: string
  serviceName?: string
  status?: string
  price?: number
  amountPaid?: number
  outstandingBalance?: number
  currency?: string
  invoiceId?: string
  invoiceNumber?: string
}

export interface DispatchResultItem {
  recipient: string
  recipientName: string
  clientId?: string
  channel?: 'email' | 'sms' | 'whatsapp'
  status: 'sent' | 'failed'
  provider?: string
  deliveryMode?: string
  portalUrl?: string
  projectName?: string
  messageId?: string
  waLink?: string
  error?: string
  logId?: string
  timestamp?: string
}

interface ChannelConfigInfo {
  available: boolean
  configured: boolean
  mode: string
  provider: string
  senderEmail?: string
  senderName?: string
}

interface DispatchWorkspaceStats {
  total: number
  sent: number
  failed: number
  pending: number
  emailSent: number
  smsSent: number
  whatsappSent: number
}

export interface MultiChannelDispatchWorkspaceProps {
  initialClient?: ClientTarget | null
  initialProjectId?: string
  clientList?: ClientTarget[]
  onSuccess?: () => void
  onClose?: () => void
  embeddedInModal?: boolean
}

export interface MultiChannelDispatchModalProps {
  isOpen: boolean
  onClose: () => void
  initialClient?: ClientTarget | null
  initialProjectId?: string
  clientList?: ClientTarget[]
  onSuccess?: () => void
}

const TEMPLATE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: '{{clientName}}', label: 'Client Name' },
  { token: '{{projectName}}', label: 'Project Name' },
  { token: '{{portalUrl}}', label: 'Portal Link' },
  { token: '{{invoiceNumber}}', label: 'Invoice #' },
  { token: '{{outstandingBalance}}', label: 'Balance Due' },
  { token: '{{companyName}}', label: 'Brand Name' },
]

export function MultiChannelDispatchWorkspace({
  initialClient,
  initialProjectId,
  clientList = [],
  onSuccess,
  onClose,
  embeddedInModal = false,
}: MultiChannelDispatchWorkspaceProps) {
  const [activeView, setActiveView] = useState<'workspace' | 'history'>('workspace')
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>('email')

  // Directory & Recipient State
  const [directoryClients, setDirectoryClients] = useState<ClientTarget[]>([])
  const [allProjects, setAllProjects] = useState<DispatchProjectRecord[]>([])
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true)

  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(() =>
    initialClient?.id ? [initialClient.id] : []
  )
  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'selected' | 'email' | 'phone'>(
    'all'
  )
  const [customRecipients, setCustomRecipients] = useState<ClientTarget[]>([])
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customEmail, setCustomEmail] = useState('')
  const [customPhone, setCustomPhone] = useState('')

  // Project & Portal Resolution State
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '')
  const [preferGeneralPortal, setPreferGeneralPortal] = useState(false)
  const [resolvedPortal, setResolvedPortal] = useState<{
    portalUrl: string
    portalPath: string
    portalType: string
    isResolving: boolean
    error?: string
  }>({
    portalUrl: '',
    portalPath: '',
    portalType: 'general_portal',
    isResolving: false,
  })
  const [copiedPortalLink, setCopiedPortalLink] = useState(false)

  // Live Branding & Production URL State
  const [productionBaseUrl, setProductionBaseUrl] = useState<{
    ok: boolean
    baseUrl: string
    error?: string
  }>({ ok: true, baseUrl: '' })

  const [branding, setBranding] = useState<EmailBrandingOptions>({
    businessName: 'lexmedia.gh',
    tagline: 'Professional Digital Services',
    logoUrl: '',
    logoLightUrl: '',
    primaryColor: '#0F172A',
    secondaryColor: '#1D63ED',
    accentColor: '#1D63ED',
    buttonColor: '#1D63ED',
    buttonTextColor: '#FFFFFF',
    supportEmail: '',
    supportPhone: '',
    businessAddress: '',
    website: '',
  })

  const [channelConfigs, setChannelConfigs] = useState<{
    email: ChannelConfigInfo
    sms: ChannelConfigInfo
    whatsapp: ChannelConfigInfo
  }>({
    email: {
      available: true,
      configured: false,
      mode: 'preview',
      provider: 'Brevo Email',
    },
    sms: {
      available: true,
      configured: false,
      mode: 'preview',
      provider: 'SMS Gateway',
    },
    whatsapp: {
      available: true,
      configured: false,
      mode: 'direct_link',
      provider: 'WhatsApp Direct',
    },
  })

  // Composer State
  const [templateCategory, setTemplateCategory] = useState<string>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialProjectId ? 'project-dispatch-ready' : 'welcome-onboarding'
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [buttonText, setButtonText] = useState('View Portal')
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0)
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Dispatch Lifecycle State: idle -> sending -> sent | error
  const [dispatchPhase, setDispatchPhase] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error'
    title: string
    detail?: string
  } | null>(null)
  const [latestResults, setLatestResults] = useState<DispatchResultItem[]>([])
  const sendingLockRef = useRef(false)

  // History & Stats State
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [stats, setStats] = useState<DispatchWorkspaceStats>({
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    emailSent: 0,
    smsSent: 0,
    whatsappSent: 0,
  })
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyChannelFilter, setHistoryChannelFilter] = useState<string>('all')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')

  // Merge initialClient + clientList + directoryClients + customRecipients without duplicates
  const allRecipientsPool = useMemo(() => {
    const map = new Map<string, ClientTarget>()
    if (initialClient?.id) {
      map.set(initialClient.id, {
        id: initialClient.id,
        name: initialClient.name || 'Valued Client',
        email: initialClient.email || '',
        phone: initialClient.phone || '',
        companyName: initialClient.companyName || '',
      })
    }
    for (const c of clientList) {
      if (!c?.id) continue
      const prev = map.get(c.id)
      map.set(c.id, {
        id: c.id,
        name: c.name || prev?.name || 'Valued Client',
        email: c.email || prev?.email || '',
        phone: c.phone || prev?.phone || '',
        companyName: c.companyName || prev?.companyName || '',
      })
    }
    for (const c of directoryClients) {
      if (!c?.id) continue
      const prev = map.get(c.id)
      map.set(c.id, {
        id: c.id,
        name: c.name || prev?.name || 'Valued Client',
        email: c.email || prev?.email || '',
        phone: c.phone || prev?.phone || '',
        companyName: c.companyName || prev?.companyName || '',
      })
    }
    for (const c of customRecipients) {
      map.set(c.id, c)
    }
    return Array.from(map.values())
  }, [initialClient, clientList, directoryClients, customRecipients])

  // Sync initialClient / initialProjectId if prop changes
  useEffect(() => {
    if (initialClient?.id) {
      setSelectedClientIds((prev) =>
        prev.includes(initialClient.id) ? prev : [initialClient.id]
      )
    }
  }, [initialClient?.id])

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId)
      setPreferGeneralPortal(false)
    }
  }, [initialProjectId])

  // Apply template content helper
  const applyTemplateById = useCallback((tplId: string) => {
    setSelectedTemplateId(tplId)
    const found = DEFAULT_DISPATCH_TEMPLATES.find((t) => t.id === tplId)
    if (found) {
      setSubject(found.subject)
      setBody(found.body)
      if (found.category === 'invoice' || found.category === 'payment_reminder') {
        setButtonText('View Portal')
      } else if (found.category === 'dispatch' || found.category === 'service_completion') {
        setButtonText('View Portal')
      } else {
        setButtonText('View Portal')
      }
    }
  }, [])

  // Initialize default template once
  const initializedTemplateRef = useRef(false)
  useEffect(() => {
    if (!initializedTemplateRef.current) {
      initializedTemplateRef.current = true
      applyTemplateById(initialProjectId ? 'project-dispatch-ready' : 'welcome-onboarding')
    }
  }, [applyTemplateById, initialProjectId])

  // Load workspace data (branding, production base URL, channel configs, history, clients, projects)
  const loadWorkspaceData = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingWorkspace(true)
    setIsLoadingHistory(true)
    try {
      const headers = await getAdminAuthHeaders()
      const res = await fetchWithTimeout('/api/dispatch?includeDirectory=true&limit=100', {
        headers,
        timeoutMs: 15000,
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data?.ok) {
        if (Array.isArray(data.history)) setHistoryLogs(data.history)
        if (data.stats) setStats(data.stats)
        if (data.productionUrl) setProductionBaseUrl(data.productionUrl)
        if (data.branding) setBranding(data.branding)
        if (data.channels) setChannelConfigs(data.channels)

        if (Array.isArray(data.clients) && data.clients.length > 0) {
          setDirectoryClients(data.clients)
        } else {
          // Fallback to client-side Firestore helper if needed
          try {
            const clientDocs = await getDocuments< any >(COLLECTIONS.CLIENTS)
            setDirectoryClients(
              clientDocs.map((c: any) => ({
                id: c.id,
                name: c.fullName || c.name || 'Unnamed Client',
                email: c.email || '',
                phone: c.phone || c.whatsappNumber || '',
                companyName: c.company || c.companyName || '',
              }))
            )
          } catch {}
        }

        if (Array.isArray(data.projects) && data.projects.length > 0) {
          setAllProjects(data.projects)
        } else {
          try {
            const projDocs = await getDocuments<any>(COLLECTIONS.PROJECTS)
            setAllProjects(
              projDocs.map((p: any) => ({
                id: p.id,
                clientId: p.clientId || '',
                clientName: p.clientName || '',
                name: p.name || 'Untitled Project',
                serviceName: p.serviceName || '',
                status: p.status || 'In Progress',
                price: Number(p.price || 0),
                amountPaid: Number(p.amountPaid || 0),
                outstandingBalance:
                  p.outstandingBalance !== undefined
                    ? Number(p.outstandingBalance)
                    : Math.max(0, Number(p.price || 0) - Number(p.amountPaid || 0)),
                currency: p.currency || 'GHS',
                invoiceId: p.invoiceId || '',
                invoiceNumber: p.invoiceNumber || '',
              }))
            )
          } catch {}
        }
      }
    } catch (err) {
      console.error('[Dispatch Workspace Load Error]:', err)
    } finally {
      setIsLoadingWorkspace(false)
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaceData()
  }, [loadWorkspaceData])

  // Active selected recipients
  const activeRecipients = useMemo(() => {
    return selectedClientIds
      .map((id) => allRecipientsPool.find((r) => r.id === id))
      .filter((r): r is ClientTarget => Boolean(r))
  }, [selectedClientIds, allRecipientsPool])

  // Keep previewRecipientIndex in bounds
  useEffect(() => {
    if (previewRecipientIndex >= activeRecipients.length) {
      setPreviewRecipientIndex(0)
    }
  }, [activeRecipients.length, previewRecipientIndex])

  const primaryPreviewRecipient = useMemo<ClientTarget>(
    () =>
      activeRecipients[previewRecipientIndex] ||
      activeRecipients[0] ||
      initialClient || {
        id: 'CLIENT',
        name: 'Select a Recipient',
        email: '',
        phone: '',
      },
    [activeRecipients, initialClient, previewRecipientIndex]
  )

  // Projects belonging to the currently selected client(s)
  const relevantProjects = useMemo(() => {
    if (selectedClientIds.length === 0) return allProjects
    const idSet = new Set(selectedClientIds)
    return allProjects.filter((p) => idSet.has(p.clientId))
  }, [allProjects, selectedClientIds])

  // Auto-select recipient's associated project when switching clients (unless user explicitly chose General Portal or initialProjectId matches)
  useEffect(() => {
    if (preferGeneralPortal) return
    if (selectedProjectId) {
      const stillValid = relevantProjects.some((p) => p.id === selectedProjectId)
      if (stillValid) return
    }
    if (relevantProjects.length > 0) {
      setSelectedProjectId(relevantProjects[0].id)
    } else {
      setSelectedProjectId('')
    }
  }, [relevantProjects, selectedProjectId, preferGeneralPortal])

  const selectedProjectObj = useMemo(
    () =>
      !preferGeneralPortal && selectedProjectId
        ? allProjects.find((p) => p.id === selectedProjectId) || null
        : null,
    [allProjects, preferGeneralPortal, selectedProjectId]
  )

  // Resolve real canonical Portal URL from backend whenever preview recipient / selected project changes
  const previewClientId = primaryPreviewRecipient?.id || ''
  const previewClientName = primaryPreviewRecipient?.name || ''
  const previewClientEmail = primaryPreviewRecipient?.email || ''
  const effectivePreviewProjectId = preferGeneralPortal ? '' : selectedProjectObj?.id || ''

  useEffect(() => {
    let active = true
    const resolvePortal = async () => {
      setResolvedPortal((prev) => ({ ...prev, isResolving: true, error: undefined }))
      try {
        const headers = await getAdminAuthHeaders()
        const qs = new URLSearchParams()
        if (previewClientId && previewClientId !== 'CLIENT') qs.set('clientId', previewClientId)
        if (previewClientName && previewClientName !== 'Select a Recipient') {
          qs.set('clientName', previewClientName)
        }
        if (previewClientEmail) qs.set('clientEmail', previewClientEmail)
        if (effectivePreviewProjectId) qs.set('projectId', effectivePreviewProjectId)
        if (preferGeneralPortal) qs.set('preferGeneral', 'true')

        const res = await fetchWithTimeout(`/api/dispatch/resolve-portal?${qs.toString()}`, {
          headers,
          timeoutMs: 10000,
        })
        const data = await res.json().catch(() => ({}))
        if (!active) return

        if (res.ok && data?.ok && data.portalUrl) {
          setResolvedPortal({
            portalUrl: data.portalUrl,
            portalPath: data.portalPath || '',
            portalType: data.portalType || 'general_portal',
            isResolving: false,
          })
        } else {
          setResolvedPortal({
            portalUrl: '',
            portalPath: '',
            portalType: 'general_portal',
            isResolving: false,
            error: data?.error || 'Unable to resolve production portal URL.',
          })
        }
      } catch (err) {
        if (!active) return
        setResolvedPortal({
          portalUrl: '',
          portalPath: '',
          portalType: 'general_portal',
          isResolving: false,
          error: formatActionError(err, 'Unable to resolve portal link.'),
        })
      }
    }

    resolvePortal()
    return () => {
      active = false
    }
  }, [
    previewClientId,
    previewClientName,
    previewClientEmail,
    effectivePreviewProjectId,
    preferGeneralPortal,
  ])

  // Filtered recipient directory for Section B
  const filteredDirectory = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase()
    return allRecipientsPool.filter((c) => {
      if (recipientFilter === 'selected' && !selectedClientIds.includes(c.id)) return false
      if (recipientFilter === 'email' && !c.email?.trim()) return false
      if (recipientFilter === 'phone' && !c.phone?.trim()) return false

      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.companyName || '').toLowerCase().includes(q)
      )
    })
  }, [allRecipientsPool, recipientFilter, recipientSearch, selectedClientIds])

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    if (templateCategory === 'all') return DEFAULT_DISPATCH_TEMPLATES
    if (templateCategory === 'onboarding') {
      return DEFAULT_DISPATCH_TEMPLATES.filter((t) =>
        ['welcome', 'credentials'].includes(t.category)
      )
    }
    if (templateCategory === 'projects') {
      return DEFAULT_DISPATCH_TEMPLATES.filter((t) =>
        ['new_project', 'project_update', 'dispatch', 'service_completion'].includes(t.category)
      )
    }
    if (templateCategory === 'billing') {
      return DEFAULT_DISPATCH_TEMPLATES.filter((t) =>
        ['invoice', 'payment_confirmation', 'payment_reminder'].includes(t.category)
      )
    }
    return DEFAULT_DISPATCH_TEMPLATES.filter((t) => t.category === 'announcement')
  }, [templateCategory])

  // Validation checks for selected recipients & channel
  const recipientWarnings = useMemo(() => {
    if (activeRecipients.length === 0) return []
    const issues: string[] = []
    if (channel === 'email') {
      const missingEmail = activeRecipients.filter(
        (r) => !r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())
      )
      if (missingEmail.length > 0) {
        issues.push(
          `${missingEmail.length} selected recipient(s) missing valid email: ${missingEmail
            .slice(0, 2)
            .map((m) => m.name)
            .join(', ')}${missingEmail.length > 2 ? '...' : ''}`
        )
      }
    } else {
      const missingPhone = activeRecipients.filter(
        (r) => !r.phone || r.phone.replace(/\D/g, '').length < 7
      )
      if (missingPhone.length > 0) {
        issues.push(
          `${missingPhone.length} selected recipient(s) missing valid phone number: ${missingPhone
            .slice(0, 2)
            .map((m) => m.name)
            .join(', ')}${missingPhone.length > 2 ? '...' : ''}`
        )
      }
    }
    return issues
  }, [activeRecipients, channel])

  const validRecipientCount = useMemo(() => {
    if (channel === 'email') {
      return activeRecipients.filter(
        (r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())
      ).length
    }
    return activeRecipients.filter((r) => r.phone && r.phone.replace(/\D/g, '').length >= 7).length
  }, [activeRecipients, channel])

  // Live substituted subject, body, and EXACT isomorphic Brevo HTML preview
  const previewSubstitutionContext = useMemo(() => {
    const currency = selectedProjectObj?.currency || 'GHS'
    const formattedTotal = selectedProjectObj?.price
      ? formatCurrency(selectedProjectObj.price, currency)
      : undefined
    const formattedPaid = selectedProjectObj?.amountPaid
      ? formatCurrency(selectedProjectObj.amountPaid, currency)
      : undefined
    const formattedBalance =
      selectedProjectObj?.outstandingBalance !== undefined
        ? formatCurrency(selectedProjectObj.outstandingBalance, currency)
        : undefined
    const paymentStatus = selectedProjectObj
      ? (selectedProjectObj.outstandingBalance || 0) <= 0 && (selectedProjectObj.price || 0) > 0
        ? 'Paid'
        : (selectedProjectObj.amountPaid || 0) > 0
        ? 'Partially Paid'
        : 'Pending'
      : undefined

    const activePortalUrl =
      resolvedPortal.portalUrl ||
      (productionBaseUrl.baseUrl ? `${productionBaseUrl.baseUrl}/delivery` : '')

    return {
      clientName: primaryPreviewRecipient.name || 'Valued Client',
      clientId:
        primaryPreviewRecipient.id && primaryPreviewRecipient.id !== 'CLIENT'
          ? primaryPreviewRecipient.id
          : 'CLIENT',
      clientEmail: primaryPreviewRecipient.email || '',
      clientPhone: primaryPreviewRecipient.phone || '',
      projectName: selectedProjectObj?.name,
      projectId: selectedProjectObj?.id,
      projectStatus: selectedProjectObj?.status,
      serviceName: selectedProjectObj?.serviceName,
      invoiceNumber: selectedProjectObj?.invoiceNumber || undefined,
      invoiceAmount: formattedTotal,
      amountPaid: formattedPaid,
      outstandingBalance: formattedBalance,
      paymentStatus,
      loginUrl: activePortalUrl,
      portalUrl: activePortalUrl,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      companyName: branding.businessName || 'lexmedia.gh',
    }
  }, [
    branding.businessName,
    branding.supportEmail,
    branding.supportPhone,
    primaryPreviewRecipient,
    productionBaseUrl.baseUrl,
    resolvedPortal.portalUrl,
    selectedProjectObj,
  ])

  const previewSubject = useMemo(
    () =>
      substitutePlaceholders(
        subject || `${branding.businessName || 'lexmedia.gh'} Notification`,
        previewSubstitutionContext
      ),
    [branding.businessName, previewSubstitutionContext, subject]
  )

  const previewBodyText = useMemo(
    () => substitutePlaceholders(body, previewSubstitutionContext),
    [body, previewSubstitutionContext]
  )

  const liveEmailHtml = useMemo(() => {
    return renderDispatchEmailTemplate({
      recipientName: primaryPreviewRecipient.name || 'Valued Client',
      subject: previewSubject,
      bodyText: previewBodyText,
      portalUrl: previewSubstitutionContext.portalUrl,
      buttonText: buttonText || 'View Portal',
      branding,
      projectName: selectedProjectObj?.name,
      projectStatus: selectedProjectObj?.status,
      serviceName: selectedProjectObj?.serviceName,
      invoiceNumber: selectedProjectObj?.invoiceNumber,
      invoiceAmount: previewSubstitutionContext.invoiceAmount,
      amountPaid: previewSubstitutionContext.amountPaid,
      outstandingBalance: previewSubstitutionContext.outstandingBalance,
      baseUrl: productionBaseUrl.baseUrl,
    })
  }, [
    branding,
    buttonText,
    previewBodyText,
    previewSubject,
    previewSubstitutionContext,
    primaryPreviewRecipient.name,
    productionBaseUrl.baseUrl,
    selectedProjectObj,
  ])

  // SMS / WhatsApp length & segment metrics
  const charCount = previewBodyText.length
  const smsSegments = charCount === 0 ? 0 : Math.ceil(charCount / 160)

  // Handlers
  const toggleRecipient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
    if (dispatchPhase === 'sent' || dispatchPhase === 'error') {
      setDispatchPhase('idle')
    }
  }

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredDirectory.map((c) => c.id)
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedClientIds.includes(id))
    if (allSelected) {
      setSelectedClientIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
    } else {
      setSelectedClientIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
    }
  }

  const handleAddCustomRecipient = () => {
    const name = customName.trim() || 'External Recipient'
    const email = customEmail.trim()
    const phone = customPhone.trim()
    if (!email && !phone) {
      toast.error('Provide an email address or phone number for the custom recipient.')
      return
    }
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const entry: ClientTarget = { id, name, email, phone, companyName: 'External' }
    setCustomRecipients((prev) => [entry, ...prev])
    setSelectedClientIds((prev) => [...prev, id])
    setCustomName('')
    setCustomEmail('')
    setCustomPhone('')
    setShowCustomForm(false)
    toast.success(`Added ${name} to dispatch targets.`)
  }

  const insertVariableAtCursor = (token: string) => {
    const el = bodyTextareaRef.current
    if (!el) {
      setBody((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${token}`)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + token + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + token.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  const handleCopyPortalUrl = async () => {
    if (!resolvedPortal.portalUrl) return
    const ok = await copyToClipboard(resolvedPortal.portalUrl)
    if (ok) {
      setCopiedPortalLink(true)
      toast.success('Portal URL copied to clipboard.')
      setTimeout(() => setCopiedPortalLink(false), 2000)
    }
  }

  const handleDispatch = async () => {
    if (sendingLockRef.current || dispatchPhase === 'sending') return

    if (!productionBaseUrl.ok || !productionBaseUrl.baseUrl) {
      const msg =
        productionBaseUrl.error ||
        'Production base URL (APP_URL) is missing or resolves to localhost.'
      setDispatchPhase('error')
      setFeedbackBanner({
        type: 'error',
        title: 'Configuration Error',
        detail: msg,
      })
      toast.error(msg)
      return
    }

    if (activeRecipients.length === 0) {
      toast.error('Select at least one recipient before dispatching.')
      return
    }

    if (validRecipientCount === 0) {
      const errText =
        channel === 'email'
          ? 'None of the selected recipients have a valid email address.'
          : `None of the selected recipients have a valid phone number for ${channel.toUpperCase()}.`
      setDispatchPhase('error')
      setFeedbackBanner({ type: 'error', title: 'Validation Error', detail: errText })
      toast.error(errText)
      return
    }

    if (!body.trim()) {
      toast.error('Message body cannot be empty.')
      return
    }

    if (channel === 'email' && !subject.trim()) {
      toast.error('Email subject line is required.')
      return
    }

    sendingLockRef.current = true
    setDispatchPhase('sending')
    setFeedbackBanner(null)
    setLatestResults([])

    try {
      const headers = await getAdminAuthHeaders()
      const res = await fetchWithTimeout('/api/dispatch', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel,
          templateId: selectedTemplateId,
          subject: subject.trim(),
          body: body.trim(),
          buttonText: buttonText.trim() || 'View Portal',
          projectId: preferGeneralPortal ? '' : selectedProjectObj?.id || '',
          preferGeneralPortal,
          projectName: selectedProjectObj?.name || '',
          serviceName: selectedProjectObj?.serviceName || '',
          invoiceNumber: selectedProjectObj?.invoiceNumber || '',
          recipients: activeRecipients.map((r) => ({
            clientId: r.id,
            recipientName: r.name,
            recipientEmail: r.email || '',
            recipientPhone: r.phone || '',
          })),
        }),
        timeoutMs: 30000,
      })

      const data = await res.json().catch(() => ({}))

      if (Array.isArray(data?.results)) {
        setLatestResults(data.results)
      }

      if (!res.ok || !data?.ok || (data?.sentCount ?? 0) === 0) {
        const reason =
          data?.error ||
          data?.results?.find((r: any) => r.error)?.error ||
          'Dispatch failed. Verify recipient details and provider configuration.'
        setDispatchPhase('error')
        setFeedbackBanner({
          type: 'error',
          title: 'Dispatch Failed',
          detail: reason,
        })
        toast.error(reason)
        await loadWorkspaceData(true)
        return
      }

      // Provider accepted at least 1 message -> transition to SENT state
      setDispatchPhase('sent')
      const batchSummary =
        data.failedCount > 0
          ? `Delivered to ${data.sentCount} of ${data.totalDispatched} recipient(s). ${data.failedCount} failed — inspect details below.`
          : `Delivered to ${data.sentCount} recipient${data.sentCount === 1 ? '' : 's'} via ${
              channel === 'email' ? 'Brevo Email' : channel === 'sms' ? 'SMS' : 'WhatsApp'
            }.`

      setFeedbackBanner({
        type: 'success',
        title: 'Message Sent Successfully',
        detail: batchSummary,
      })
      toast.success('Message Sent Successfully')

      // If single WhatsApp direct link mode, open WhatsApp composer in new tab cleanly
      if (
        channel === 'whatsapp' &&
        data.results?.length === 1 &&
        data.results[0]?.waLink
      ) {
        openExternalUrl(data.results[0].waLink)
      }

      await loadWorkspaceData(true)
      onSuccess?.()
    } catch (err) {
      const errMsg = formatActionError(
        err,
        'Network error while communicating with dispatch service.'
      )
      setDispatchPhase('error')
      setFeedbackBanner({
        type: 'error',
        title: 'Dispatch Error',
        detail: errMsg,
      })
      toast.error(errMsg)
    } finally {
      sendingLockRef.current = false
      // Guarantee loading never remains stuck if an unexpected path exits early
      setDispatchPhase((prev) => (prev === 'sending' ? 'idle' : prev))
    }
  }

  // Filtered history logs for Section G
  const visibleHistoryLogs = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    return historyLogs.filter((log) => {
      if (historyChannelFilter !== 'all' && log.channel !== historyChannelFilter) return false
      if (historyStatusFilter !== 'all' && log.status !== historyStatusFilter) return false
      if (!q) return true
      return (
        (log.recipientName || '').toLowerCase().includes(q) ||
        (log.recipientEmail || '').toLowerCase().includes(q) ||
        (log.recipientPhone || '').toLowerCase().includes(q) ||
        (log.subject || '').toLowerCase().includes(q) ||
        (log.projectName || '').toLowerCase().includes(q)
      )
    })
  }, [historyChannelFilter, historyLogs, historySearch, historyStatusFilter])

  const isSending = dispatchPhase === 'sending'
  const canDispatch =
    !isSending &&
    productionBaseUrl.ok &&
    activeRecipients.length > 0 &&
    validRecipientCount > 0 &&
    body.trim().length > 0 &&
    (channel !== 'email' || subject.trim().length > 0)

  return (
    <div className="space-y-5">
      {/* SECTION A: WORKSPACE HEADER */}
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-gray-100">
                Multi-Channel Dispatch Workspace
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border',
                  dispatchPhase === 'sending'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    : dispatchPhase === 'sent'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : dispatchPhase === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    : 'bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-700'
                )}
              >
                {dispatchPhase === 'sending' && <RefreshCw size={12} className="animate-spin" />}
                {dispatchPhase === 'sent' && <CheckCircle2 size={12} />}
                {dispatchPhase === 'error' && <AlertCircle size={12} />}
                <span>
                  {dispatchPhase === 'sending'
                    ? 'Sending...'
                    : dispatchPhase === 'sent'
                    ? 'Message Sent Successfully'
                    : dispatchPhase === 'error'
                    ? 'Action Required'
                    : 'Ready'}
                </span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400">
              Compose branded Brevo emails, SMS, and WhatsApp dispatches with verified production client portal links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Compact KPI Strip */}
            <div className="flex items-center divide-x divide-slate-200 dark:divide-gray-800 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-800 rounded-lg px-1 py-1.5 text-xs">
              <div className="px-2.5">
                <span className="text-slate-500 dark:text-gray-400">Targets </span>
                <strong className="font-semibold text-slate-900 dark:text-gray-100 tabular-nums">
                  {activeRecipients.length}
                </strong>
              </div>
              <div className="px-2.5">
                <span className="text-slate-500 dark:text-gray-400">Sent </span>
                <strong className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {stats.sent}
                </strong>
              </div>
              <div className="px-2.5">
                <span className="text-slate-500 dark:text-gray-400">Failed </span>
                <strong className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {stats.failed}
                </strong>
              </div>
            </div>

            {/* View Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/70 p-0.5">
              <button
                type="button"
                onClick={() => setActiveView('workspace')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5',
                  activeView === 'workspace'
                    ? 'bg-white dark:bg-gray-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200'
                )}
              >
                <Send size={13} />
                <span>Composer & Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('history')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5',
                  activeView === 'history'
                    ? 'bg-white dark:bg-gray-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200'
                )}
              >
                <History size={13} />
                <span className="tabular-nums">History ({stats.total})</span>
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadWorkspaceData(false)}
              loading={isLoadingHistory}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>

            {embeddedInModal && onClose && (
              <Button type="button" variant="ghost" size="sm" onClick={onClose} icon={<X size={15} />}>
                Close
              </Button>
            )}
          </div>
        </div>

        {/* Production Base URL Alert if misconfigured */}
        {!productionBaseUrl.ok && (
          <div className="mt-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="font-semibold">Production Base URL Required</p>
              <p className="mt-0.5 text-rose-700 dark:text-rose-300">{productionBaseUrl.error}</p>
            </div>
          </div>
        )}

        {/* Action Feedback Banner (Sent / Error + Per-Recipient Breakdown) */}
        {feedbackBanner && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'mt-4 rounded-lg border p-3.5',
              feedbackBanner.type === 'success'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70 text-rose-900 dark:text-rose-100'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {feedbackBanner.type === 'success' ? (
                  <CheckCircle2
                    size={18}
                    className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
                  />
                ) : (
                  <XCircle
                    size={18}
                    className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400"
                  />
                )}
                <div>
                  <p className="text-sm font-bold">{feedbackBanner.title}</p>
                  {feedbackBanner.detail && (
                    <p className="text-xs mt-0.5 opacity-90">{feedbackBanner.detail}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 p-1 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>

            {latestResults.length > 0 && (
              <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {latestResults.map((resItem, idx) => (
                  <div
                    key={resItem.logId || `${resItem.recipient}_${idx}`}
                    className="rounded-md bg-white/80 dark:bg-gray-900/70 border border-slate-200/80 dark:border-gray-800 px-3 py-2 text-xs flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-gray-100 truncate">
                        {resItem.recipientName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                        {resItem.recipient}
                      </p>
                      {resItem.error && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          {resItem.error}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded',
                        resItem.status === 'sent'
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                      )}
                    >
                      {resItem.status === 'sent' ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeView === 'workspace' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* SECTION B: RECIPIENT SELECTOR (3 cols) */}
          <section className="lg:col-span-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[#1D63ED]" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">
                    Recipients
                  </h2>
                </div>
                <span className="text-xs font-semibold text-[#1D63ED] dark:text-blue-400 tabular-nums">
                  {selectedClientIds.length} selected
                </span>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search name, email, phone..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/70 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 focus:outline-none focus:border-[#1D63ED]"
                />
              </div>

              {/* Quick Filter Row */}
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <div className="flex items-center gap-1">
                  {(['all', 'selected', 'email', 'phone'] as const).map((fKey) => (
                    <button
                      key={fKey}
                      type="button"
                      onClick={() => setRecipientFilter(fKey)}
                      className={cn(
                        'px-2 py-1 rounded font-medium capitalize transition-colors cursor-pointer',
                        recipientFilter === fKey
                          ? 'bg-slate-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800'
                      )}
                    >
                      {fKey}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomForm((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[#1D63ED] dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Custom</span>
                </button>
              </div>

              {/* Custom Recipient Form */}
              {showCustomForm && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-gray-800/80 border border-slate-200 dark:border-gray-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-gray-200">
                      Add External Recipient
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-100"
                  />
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-100"
                  />
                  <input
                    type="tel"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="Phone (e.g. 024XXXXXXX)"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-900 dark:text-gray-100"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={handleAddCustomRecipient}
                  >
                    Add & Select
                  </Button>
                </div>
              )}

              {/* Batch Selection Bar */}
              {filteredDirectory.length > 0 && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer"
                  >
                    {filteredDirectory.every((c) => selectedClientIds.includes(c.id))
                      ? 'Deselect visible'
                      : `Select visible (${filteredDirectory.length})`}
                  </button>
                  {selectedClientIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedClientIds([])}
                      className="text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Recipient Directory List */}
            <div className="divide-y divide-slate-100 dark:divide-gray-800/80 max-h-[520px] overflow-y-auto">
              {isLoadingWorkspace && allRecipientsPool.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-gray-400">
                  Loading client directory...
                </div>
              ) : filteredDirectory.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-gray-300">
                    No matching recipients found.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCustomForm(true)}
                    className="text-xs font-semibold text-[#1D63ED] hover:underline cursor-pointer"
                  >
                    + Add custom recipient
                  </button>
                </div>
              ) : (
                filteredDirectory.map((client) => {
                  const isSelected = selectedClientIds.includes(client.id)
                  const missingChannelContact =
                    channel === 'email'
                      ? !client.email?.includes('@')
                      : !client.phone || client.phone.replace(/\D/g, '').length < 7

                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => toggleRecipient(client.id)}
                      className={cn(
                        'w-full text-left px-3.5 py-3 flex items-start gap-2.5 transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-[#EFF6FF] dark:bg-blue-950/35'
                          : 'hover:bg-slate-50 dark:hover:bg-gray-800/50'
                      )}
                    >
                      <div className="mt-0.5 shrink-0 text-[#1D63ED] dark:text-blue-400">
                        {isSelected ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Square size={16} className="text-slate-300 dark:text-gray-600" />
                        )}
                      </div>
                      <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {getInitials(client.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold text-slate-900 dark:text-gray-100 truncate">
                            {client.name}
                          </p>
                          {isSelected && missingChannelContact && (
                            <AlertCircle
                              size={13}
                              className="shrink-0 text-amber-500"
                              aria-label="Missing contact detail for selected channel"
                            />
                          )}
                        </div>
                        {client.companyName && (
                          <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                            {client.companyName}
                          </p>
                        )}
                        <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-gray-400">
                          {client.email ? (
                            <p className="truncate flex items-center gap-1">
                              <Mail size={10} className="shrink-0" />
                              <span className="truncate">{client.email}</span>
                            </p>
                          ) : null}
                          {client.phone ? (
                            <p className="truncate flex items-center gap-1 font-mono tabular-nums">
                              <Smartphone size={10} className="shrink-0" />
                              <span>{client.phone}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* SECTION C + D + F: CHANNEL SELECTOR, COMPOSER, AND DISPATCH CONTROLS (5 cols) */}
          <section className="lg:col-span-5 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-200 dark:divide-gray-800">
            {/* SECTION C: CHANNEL SELECTION */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  1. Delivery Channel
                </label>
                <span className="text-[11px] text-slate-500 dark:text-gray-400">
                  {channelConfigs[channel]?.provider} ·{' '}
                  <strong className="text-slate-700 dark:text-gray-200">
                    {channelConfigs[channel]?.mode === 'live'
                      ? 'Live API'
                      : channelConfigs[channel]?.mode === 'direct_link'
                      ? 'Direct Launch'
                      : 'Preview Mode'}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      id: 'email',
                      label: 'Email',
                      sub: 'Brevo Branded',
                      icon: Mail,
                      cfg: channelConfigs.email,
                    },
                    {
                      id: 'sms',
                      label: 'SMS',
                      sub: 'Transactional',
                      icon: Smartphone,
                      cfg: channelConfigs.sms,
                    },
                    {
                      id: 'whatsapp',
                      label: 'WhatsApp',
                      sub: channelConfigs.whatsapp.configured ? 'Cloud API' : 'Direct Chat',
                      icon: MessageSquare,
                      cfg: channelConfigs.whatsapp,
                    },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon
                  const isActive = channel === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setChannel(item.id)}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all cursor-pointer',
                        isActive
                          ? 'border-[#1D63ED] bg-[#EFF6FF]/80 dark:bg-blue-950/40 ring-1 ring-[#1D63ED]'
                          : 'border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Icon
                          size={16}
                          className={
                            isActive
                              ? 'text-[#1D63ED] dark:text-blue-400'
                              : 'text-slate-500 dark:text-gray-400'
                          }
                        />
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            item.cfg.configured ? 'bg-emerald-500' : 'bg-amber-400'
                          )}
                          title={
                            item.cfg.configured
                              ? `${item.cfg.provider} Live`
                              : `${item.cfg.provider} (${item.cfg.mode})`
                          }
                        />
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-900 dark:text-gray-100">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                        {item.sub}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* SECTION D: PROJECT & PORTAL ROUTING + MESSAGE COMPOSER */}
            <div className="p-4 space-y-4">
              {/* Project & View Portal Destination Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
                    <FolderKanban size={13} className="text-[#1D63ED]" />
                    <span>2. Associated Project & Portal Link</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-gray-400">
                    {resolvedPortal.portalType === 'project_portal'
                      ? 'Project Portal'
                      : 'General Client Portal'}
                  </span>
                </div>

                <select
                  value={preferGeneralPortal ? '__GENERAL_PORTAL__' : selectedProjectId}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '__GENERAL_PORTAL__') {
                      setPreferGeneralPortal(true)
                      setSelectedProjectId('')
                    } else {
                      setPreferGeneralPortal(false)
                      setSelectedProjectId(val)
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED]"
                >
                  {relevantProjects.length > 0 ? (
                    <optgroup label="Associated Client Projects">
                      {relevantProjects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name} ({proj.status || 'Active'}
                          {proj.outstandingBalance
                            ? ` · Bal ${formatCurrency(proj.outstandingBalance, proj.currency || 'GHS')}`
                            : ''}
                          )
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <option value="__GENERAL_PORTAL__">
                    General Client Portal (No specific project)
                  </option>
                </select>

                {/* Live Verified Portal URL Strip */}
                <div className="rounded-lg bg-slate-50 dark:bg-gray-800/70 border border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      View Portal Destination
                    </p>
                    {resolvedPortal.isResolving ? (
                      <p className="text-slate-500 dark:text-gray-400 truncate">
                        Resolving secure portal URL...
                      </p>
                    ) : resolvedPortal.portalUrl ? (
                      <p className="font-mono text-[11px] text-slate-700 dark:text-gray-200 truncate">
                        {resolvedPortal.portalUrl}
                      </p>
                    ) : (
                      <p className="text-rose-600 dark:text-rose-400 text-[11px]">
                        {resolvedPortal.error || 'Production URL unavailable'}
                      </p>
                    )}
                  </div>
                  {resolvedPortal.portalUrl && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyPortalUrl}
                        className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-300 cursor-pointer"
                        title="Copy Portal URL"
                      >
                        {copiedPortalLink ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      </button>
                      <a
                        href={resolvedPortal.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-[11px] font-semibold text-[#1D63ED] dark:text-blue-400 hover:bg-slate-50"
                        title="Open generated portal in new tab"
                      >
                        <span>Open</span>
                        <ArrowUpRight size={12} />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Template Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
                    <FileText size={13} className="text-[#1D63ED]" />
                    <span>3. Message Template</span>
                  </label>
                  <div className="flex items-center gap-1 text-[11px]">
                    {(['all', 'onboarding', 'projects', 'billing'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTemplateCategory(cat)}
                        className={cn(
                          'px-2 py-0.5 rounded capitalize font-medium cursor-pointer',
                          templateCategory === cat
                            ? 'bg-slate-900 text-white dark:bg-gray-100 dark:text-gray-900'
                            : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <select
                  value={selectedTemplateId}
                  onChange={(e) => applyTemplateById(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED]"
                >
                  {filteredTemplates.map((tpl: MessageTemplate) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject & CTA Label (for Email) */}
              {channel === 'email' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300">
                      Email Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300">
                      Portal Button Text
                    </label>
                    <input
                      type="text"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      placeholder="View Portal"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED]"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Variable Insertion Chips */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
                    Message Content
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-gray-400 tabular-nums">
                    {charCount} chars
                    {channel !== 'email' ? ` · ${smsSegments} segment${smsSegments === 1 ? '' : 's'}` : ''}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pb-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariableAtCursor(v.token)}
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 hover:border-[#1D63ED] text-[11px] font-mono text-slate-700 dark:text-gray-300 transition-colors cursor-pointer"
                      title={`Insert ${v.token}`}
                    >
                      +{v.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={bodyTextareaRef}
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your client message here..."
                  className="w-full px-3 py-2.5 text-xs sm:text-sm leading-relaxed rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED] resize-y"
                />
              </div>

              {/* Validation Warnings */}
              {recipientWarnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                  {recipientWarnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1.5">
                      <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION F: DISPATCH CONTROLS */}
            <div className="p-4 bg-slate-50/70 dark:bg-gray-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-b-xl">
              <div className="text-xs text-slate-600 dark:text-gray-300 space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-gray-100 tabular-nums">
                  {validRecipientCount} valid target{validRecipientCount === 1 ? '' : 's'} ·{' '}
                  <span className="uppercase">{channel}</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate max-w-[260px]">
                  {selectedProjectObj
                    ? `Project: ${selectedProjectObj.name}`
                    : 'Portal: General Client Portal'}
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                loading={isSending}
                disabled={!canDispatch}
                onClick={handleDispatch}
                icon={
                  dispatchPhase === 'sent' ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Send size={16} />
                  )
                }
              >
                {isSending
                  ? 'Sending...'
                  : dispatchPhase === 'error'
                  ? `Retry Dispatch (${validRecipientCount})`
                  : `Dispatch Message${validRecipientCount > 1 ? ` (${validRecipientCount})` : ''}`}
              </Button>
            </div>
          </section>

          {/* SECTION E: LIVE MESSAGE PREVIEW (4 cols) */}
          <section className="lg:col-span-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-[#1D63ED]" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">
                    Live Outgoing Preview
                  </h2>
                </div>
                {activeRecipients.length > 1 && (
                  <select
                    value={previewRecipientIndex}
                    onChange={(e) => setPreviewRecipientIndex(Number(e.target.value))}
                    className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-800 dark:text-gray-200"
                  >
                    {activeRecipients.map((r, idx) => (
                      <option key={r.id} value={idx}>
                        Preview: {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Envelope Metadata */}
              <div className="rounded-lg bg-slate-50 dark:bg-gray-800/70 border border-slate-200 dark:border-gray-700 px-3 py-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-gray-400">Brand:</span>
                  <span className="font-semibold text-slate-900 dark:text-gray-100 truncate">
                    {branding.businessName}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-gray-400">To:</span>
                  <span className="font-medium text-slate-800 dark:text-gray-200 truncate">
                    {primaryPreviewRecipient.name}
                    {channel === 'email' && primaryPreviewRecipient.email
                      ? ` <${primaryPreviewRecipient.email}>`
                      : channel !== 'email' && primaryPreviewRecipient.phone
                      ? ` (${formatWhatsAppPhone(primaryPreviewRecipient.phone).displayFormatted || primaryPreviewRecipient.phone})`
                      : ''}
                  </span>
                </div>
                {channel === 'email' && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-gray-400">Subject:</span>
                    <span className="font-semibold text-slate-900 dark:text-gray-100 truncate">
                      {previewSubject}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {channel === 'email' ? (
              <div className="bg-slate-100 dark:bg-gray-950 flex-1 min-h-[520px] flex flex-col">
                <iframe
                  title="Branded Brevo Email Preview"
                  srcDoc={liveEmailHtml}
                  sandbox="allow-same-origin"
                  className="w-full flex-1 min-h-[520px] border-0 bg-slate-100"
                />
              </div>
            ) : (
              <div className="p-5 bg-slate-50 dark:bg-gray-950 min-h-[380px] flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                    <span className="font-semibold uppercase tracking-wider">
                      {channel === 'sms' ? 'SMS Payload' : 'WhatsApp Message'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {charCount} chars · {smsSegments} segment{smsSegments === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'rounded-2xl p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words border shadow-xs',
                      channel === 'whatsapp'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-slate-900 dark:text-gray-100'
                        : 'bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-800 text-slate-900 dark:text-gray-100'
                    )}
                  >
                    {previewBodyText || 'Type your message to preview...'}
                  </div>
                </div>

                {resolvedPortal.portalUrl && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-gray-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-gray-400 truncate">
                      Portal Link Verified
                    </span>
                    <a
                      href={resolvedPortal.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#1D63ED] dark:text-blue-400 hover:underline shrink-0"
                    >
                      <span>Test Link</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* SECTION G: DISPATCH RESULTS & HISTORY */}
      {(activeView === 'history' || !embeddedInModal) && (
        <section className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History size={16} className="text-[#1D63ED]" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">
                Dispatch History & Delivery Log
              </h2>
              <span className="text-xs text-slate-500 dark:text-gray-400 tabular-nums">
                ({visibleHistoryLogs.length})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filter recipient or project..."
                  className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-900 dark:text-gray-100 focus:outline-none focus:border-[#1D63ED]"
                />
              </div>

              <select
                value={historyChannelFilter}
                onChange={(e) => setHistoryChannelFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-800 dark:text-gray-200"
              >
                <option value="all">All Channels</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>

              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-800 dark:text-gray-200"
              >
                <option value="all">All Statuses</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="sending">Pending</option>
              </select>
            </div>
          </div>

          {isLoadingHistory && historyLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-gray-400">
              Loading dispatch history...
            </div>
          ) : visibleHistoryLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-gray-400">
              No dispatch records match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-gray-800 bg-slate-50/80 dark:bg-gray-800/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Channel</th>
                    <th className="py-2.5 px-4">Subject / Project</th>
                    <th className="py-2.5 px-4">Portal Link</th>
                    <th className="py-2.5 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800/80">
                  {visibleHistoryLogs.slice(0, 50).map((log) => {
                    const isSent = log.status === 'sent'
                    const isFailed = log.status === 'failed'
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-[11px]',
                              isSent
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : isFailed
                                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                            )}
                          >
                            {isSent ? (
                              <CheckCircle2 size={12} />
                            ) : isFailed ? (
                              <XCircle size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            <span className="capitalize">
                              {isSent ? 'Sent' : isFailed ? 'Failed' : 'Pending'}
                            </span>
                          </span>
                          {log.deliveryMode === 'preview' && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              Preview Mode
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top">
                          <p className="font-semibold text-slate-900 dark:text-gray-100">
                            {log.recipientName || 'Client'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-gray-400">
                            {log.channel === 'email'
                              ? log.recipientEmail
                              : log.recipientPhone || log.recipientEmail}
                          </p>
                        </td>

                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-gray-300 uppercase text-[11px]">
                            {log.channel === 'email' ? (
                              <Mail size={12} className="text-[#1D63ED]" />
                            ) : log.channel === 'sms' ? (
                              <Smartphone size={12} className="text-slate-500" />
                            ) : (
                              <MessageSquare size={12} className="text-emerald-600" />
                            )}
                            <span>{log.channel || 'email'}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 align-top max-w-[280px]">
                          {log.subject && (
                            <p className="font-medium text-slate-900 dark:text-gray-100 truncate">
                              {log.subject}
                            </p>
                          )}
                          {log.projectName && (
                            <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                              Project: {log.projectName}
                            </p>
                          )}
                          {log.error && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                              Error: {log.error}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          {log.portalUrl && log.portalUrl.startsWith('http') ? (
                            <a
                              href={log.portalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D63ED] dark:text-blue-400 hover:underline"
                            >
                              <ShieldCheck size={12} />
                              <span>View Portal</span>
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top text-right whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-gray-400 tabular-nums">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export function MultiChannelDispatchModal({
  isOpen,
  onClose,
  initialClient,
  initialProjectId,
  clientList = [],
  onSuccess,
}: MultiChannelDispatchModalProps) {
  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      hideClose
      className="max-w-7xl w-full p-0 overflow-hidden"
    >
      <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-gray-950">
        <MultiChannelDispatchWorkspace
          initialClient={initialClient}
          initialProjectId={initialProjectId}
          clientList={clientList}
          onSuccess={onSuccess}
          onClose={onClose}
          embeddedInModal
        />
      </div>
    </Modal>
  )
}
