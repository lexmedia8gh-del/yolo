'use client'

import { useState, useEffect, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  User,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { DEFAULT_DISPATCH_TEMPLATES, substitutePlaceholders, type MessageTemplate } from '@/lib/templates/dispatchTemplates'
import { getAdminAuthHeaders } from '@/lib/firebase/auth'

export interface ClientTarget {
  id: string
  name: string
  email?: string
  phone?: string
  companyName?: string
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
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [selectedClient, setSelectedClient] = useState<ClientTarget | null>(initialClient || null)
  const [recipientEmail, setRecipientEmail] = useState(initialClient?.email || '')
  const [recipientPhone, setRecipientPhone] = useState(initialClient?.phone || '')
  const [recipientName, setRecipientName] = useState(initialClient?.name || '')

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('welcome-onboarding')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [isSending, setIsSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Update recipient when initialClient changes or selectedClient changes
  useEffect(() => {
    if (initialClient) {
      setSelectedClient(initialClient)
      setRecipientEmail(initialClient.email || '')
      setRecipientPhone(initialClient.phone || '')
      setRecipientName(initialClient.name || '')
    }
  }, [initialClient])

  const handleClientSelect = (clientId: string) => {
    const found = clientList.find((c) => c.id === clientId)
    if (found) {
      setSelectedClient(found)
      setRecipientEmail(found.email || '')
      setRecipientPhone(found.phone || '')
      setRecipientName(found.name || '')
    } else {
      setSelectedClient(null)
    }
  }

  // Load template when selectedTemplateId changes
  useEffect(() => {
    if (selectedTemplateId) {
      const tmpl = DEFAULT_DISPATCH_TEMPLATES.find((t) => t.id === selectedTemplateId)
      if (tmpl) {
        setSubject(tmpl.subject)
        setBody(tmpl.body)
      }
    }
  }, [selectedTemplateId])

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const authHeaders = await getAdminAuthHeaders()
      const url = selectedClient?.id
        ? `/api/dispatch?clientId=${encodeURIComponent(selectedClient.id)}`
        : '/api/dispatch?limit=10'
      const res = await fetch(url, { headers: authHeaders })
      if (res.ok) {
        const json = await res.json()
        if (json?.ok && Array.isArray(json.history)) {
          setRecentLogs(json.history)
        }
      }
    } catch {
    } finally {
      setIsLoadingHistory(false)
    }
  }, [selectedClient?.id])

  // Load dispatch history when modal opens or client changes
  useEffect(() => {
    if (isOpen) {
      void fetchHistory()
    }
  }, [isOpen, fetchHistory])

  const substitutedSubject = substitutePlaceholders(subject, {
    clientName: recipientName || 'Valued Client',
    clientId: selectedClient?.id || 'LM-CLIENT',
  })

  const substitutedBody = substitutePlaceholders(body, {
    clientName: recipientName || 'Valued Client',
    clientId: selectedClient?.id || 'LM-CLIENT',
    loginUrl: typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://lexmedia.gh/login',
  })

  const handleSendDispatch = async () => {
    setStatusMessage(null)
    if (channel === 'email' && (!recipientEmail || !recipientEmail.includes('@'))) {
      setStatusMessage({ type: 'error', text: 'A valid recipient email address is required.' })
      return
    }
    if (channel === 'sms' && !recipientPhone) {
      setStatusMessage({ type: 'error', text: 'A recipient phone number is required for SMS.' })
      return
    }
    if (!body.trim()) {
      setStatusMessage({ type: 'error', text: 'Message body content cannot be empty.' })
      return
    }

    setIsSending(true)
    try {
      const authHeaders = await getAdminAuthHeaders()
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          channel,
          recipientEmail,
          recipientPhone,
          recipientName,
          clientId: selectedClient?.id,
          templateId: selectedTemplateId,
          subject,
          body,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Dispatch sending failed.')
      }

      setStatusMessage({
        type: 'success',
        text: `Message successfully dispatched via ${channel.toUpperCase()} to ${
          channel === 'email' ? recipientEmail : recipientPhone
        }`,
      })

      void fetchHistory()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to deliver dispatch message.' })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Multi-Channel Dispatch Engine"
      size="xl"
    >
      <div className="space-y-6">
        <p className="text-xs text-slate-400 -mt-2">
          Send notifications, credentials, project updates, and payment links via Brevo Email &amp; SMS
        </p>
          {/* Channel Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Select Delivery Channel
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border text-sm font-medium transition-all ${
                  channel === 'email'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-lg shadow-blue-500/10'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Mail className="w-4 h-4 text-blue-400" />
                <span>Brevo Transactional Email</span>
              </button>
              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border text-sm font-medium transition-all ${
                  channel === 'sms'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Transactional SMS Gateway</span>
              </button>
            </div>
          </div>

          {/* Recipient Information */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-blue-400" />
                Target Recipient
              </label>
              {clientList.length > 0 && (
                <select
                  value={selectedClient?.id || ''}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select Existing Client --</option>
                  {clientList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ''} [{c.id}]
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Full Name</span>
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g. Ama Mensah"
                  className="bg-slate-900 border-slate-800 text-slate-200 text-xs h-9 focus:border-blue-500"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Email Address</span>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. client@example.com"
                  className="bg-slate-900 border-slate-800 text-slate-200 text-xs h-9 focus:border-blue-500"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Phone Number (SMS)</span>
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="e.g. +233 24 000 0000"
                  className="bg-slate-900 border-slate-800 text-slate-200 text-xs h-9 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Reusable Template Picker */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2 flex items-center justify-between">
              <span>Reusable Message Template</span>
              <span className="text-[11px] text-blue-400 font-normal">Dynamic Placeholders Auto-Filled</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {DEFAULT_DISPATCH_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(tmpl.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all text-xs ${
                    selectedTemplateId === tmpl.id
                      ? 'bg-blue-600/20 border-blue-500 text-white font-medium'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <div className="truncate font-semibold">{tmpl.name}</div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{tmpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Subject & Body Editor */}
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
              <label className="text-xs font-medium text-slate-400 mb-1 block">
                Message Body Content {channel === 'sms' && <span className="text-slate-500">(Keep under 160 chars for 1 SMS)</span>}
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={channel === 'sms' ? 4 : 6}
                placeholder="Write your message here..."
                className="w-full rounded-xl border p-3 bg-slate-950 border-slate-800 text-slate-100 text-xs font-mono leading-relaxed focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Variable Preview Card */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                Live Substituted Output Preview
              </span>
              <Badge className="bg-blue-950 text-blue-400 border-blue-800/60 text-[10px]">
                {channel.toUpperCase()} PREVIEW
              </Badge>
            </div>
            {channel === 'email' && (
              <div className="text-xs font-semibold text-slate-200">
                Subject: <span className="text-blue-300 font-normal">{substitutedSubject}</span>
              </div>
            )}
            <div className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 leading-relaxed max-h-36 overflow-y-auto">
              {substitutedBody}
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-3 text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                  : 'bg-red-950/60 border-red-800/80 text-red-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Send CTA Button */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendDispatch}
              disabled={isSending}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-6 py-2 rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Dispatch Message ({channel.toUpperCase()})</span>
                </>
              )}
            </Button>
          </div>

          {/* Recent Communication History */}
          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                Recent Communication History
              </span>
              <button
                type="button"
                onClick={fetchHistory}
                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No previous dispatch history found.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {recentLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate">
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
                      <div className="truncate">
                        <span className="font-semibold text-slate-200">
                          {log.recipientName || log.recipientEmail || log.recipientPhone}
                        </span>
                        <p className="text-[11px] text-slate-400 truncate">{log.subject || log.body}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
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
                  </div>
                ))}
              </div>
            )}
          </div>
      </div>
    </Modal>
  )
}
