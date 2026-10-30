'use client'

import React, { useState, useEffect } from 'react'
import {
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  RefreshCw,
  FileText,
  Copy,
  Plus,
  Save,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { DEFAULT_DISPATCH_TEMPLATES, MessageTemplate, substitutePlaceholders, validateTemplateVariables } from '@/lib/templates/dispatchTemplates'
import toast from 'react-hot-toast'

export function EmailSettingsTab() {
  const [brevoStatus, setBrevoStatus] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Settings state
  const [autoWelcomeEnabled, setAutoWelcomeEnabled] = useState(true)
  const [emailFooter, setEmailFooter] = useState(
    '© LEXMEDIA.GH — Professional Digital Media Production\nAccra, Ghana • Support: lexmedia8gh@gmail.com'
  )
  const [savingSettings, setSavingSettings] = useState(false)

  // Test Email state
  const [testEmailRecipient, setTestEmailRecipient] = useState('')
  const [testEmailSubject, setTestEmailSubject] = useState('LEXMEDIA.GH — System Integration Test Email')
  const [testEmailBody, setTestEmailBody] = useState(
    'Hello {{clientName}},\n\nThis is a test email sent from LEXMEDIA Ctrl Room via Brevo integration.\n\nAll transactional systems are working normally.\n\nBest regards,\n{{companyName}}'
  )
  const [sendingTest, setSendingTest] = useState(false)

  // Templates state
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_DISPATCH_TEMPLATES)
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate>(DEFAULT_DISPATCH_TEMPLATES[0])
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate>(DEFAULT_DISPATCH_TEMPLATES[0])
  const [searchQuery, setSearchQuery] = useState('')

  const fetchBrevoStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch('/api/admin/brevo/status')
      const data = await res.json()
      setBrevoStatus(data)
    } catch {
      setBrevoStatus({ ok: false, error: 'Failed to connect to status endpoint' })
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    fetchBrevoStatus()
  }, [])

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      toast.error('Please enter a valid test recipient email address.')
      return
    }

    setSendingTest(true)
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          recipientEmail: testEmailRecipient,
          recipientName: 'Test Recipient',
          subject: testEmailSubject,
          body: testEmailBody,
          companyName: 'LEXMEDIA.GH',
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(`Test email successfully sent to ${testEmailRecipient}!`)
      } else {
        toast.error(data.error || 'Failed to send test email.')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error executing test dispatch.')
    } finally {
      setSendingTest(false)
    }
  }

  const handleSaveTemplate = () => {
    const updated = templates.map((t) => (t.id === editingTemplate.id ? editingTemplate : t))
    setTemplates(updated)
    setSelectedTemplate(editingTemplate)
    toast.success(`Template "${editingTemplate.name}" updated!`)
  }

  const handleRestoreDefaults = () => {
    setTemplates(DEFAULT_DISPATCH_TEMPLATES)
    setSelectedTemplate(DEFAULT_DISPATCH_TEMPLATES[0])
    setEditingTemplate(DEFAULT_DISPATCH_TEMPLATES[0])
    toast.success('Restored default dispatch templates.')
  }

  const insertVariable = (varName: string) => {
    const tag = `{{${varName}}}`
    setEditingTemplate((prev) => ({
      ...prev,
      body: prev.body + (prev.body.endsWith(' ') || prev.body.endsWith('\n') ? '' : ' ') + tag,
    }))
  }

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const validation = validateTemplateVariables(editingTemplate.body, {
    clientName: 'Kofi Mensah',
    clientId: 'LM-C-901',
    clientEmail: 'kofi@example.com',
    projectName: 'Corporate Brand Video',
    projectId: 'PRJ-2026',
    invoiceNumber: 'INV-1024',
    invoiceAmount: 'GH₵4,500.00',
    amountPaid: 'GH₵2,000.00',
    outstandingBalance: 'GH₵2,500.00',
    paymentStatus: 'Partial',
    serviceName: '4K Videography',
    loginUrl: 'https://lexmedia.gh/login',
    supportEmail: 'lexmedia8gh@gmail.com',
    companyName: 'LEXMEDIA.GH',
  })

  return (
    <div className="space-y-6">
      {/* 1. API Status & Configuration Card */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="text-indigo-600 dark:text-indigo-400" size={20} />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Brevo Email Integration Status
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Transactional email delivery, template rendering, and client communication gateway.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={fetchBrevoStatus} loading={loadingStatus}>
              Check Connection
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Connection Mode</p>
            {loadingStatus ? (
              <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
            ) : brevoStatus?.configured && brevoStatus?.ok ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                <CheckCircle2 size={16} /> Live Transactional API
              </div>
            ) : brevoStatus?.configured && !brevoStatus?.ok ? (
              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-sm">
                <XCircle size={16} /> Connection Error
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                <AlertCircle size={16} /> Preview / Simulated
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Verified Sender Identity</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {brevoStatus?.senderName || 'LEXMEDIA'} &lt;{brevoStatus?.senderEmail || 'lexmedia8gh@gmail.com'}&gt;
            </p>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Auto Welcome Email</p>
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={autoWelcomeEnabled}
                onChange={(e) => setAutoWelcomeEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
              />
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                Send welcome email on new client creation
              </span>
            </label>
          </div>
        </div>

        {brevoStatus?.error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
            <strong>Error details:</strong> {brevoStatus.error}
          </div>
        )}
      </Card>

      {/* 2. Test Email Dispatch Utility */}
      <Card>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Send Test Email
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Test real-time email dispatch using your Brevo transactional sender identity.
        </p>

        <div className="space-y-4">
          <Input
            label="Recipient Email Address"
            type="email"
            value={testEmailRecipient}
            onChange={(e) => setTestEmailRecipient(e.target.value)}
            placeholder="e.g. administrator@lexmedia.gh"
          />

          <Input
            label="Subject"
            value={testEmailSubject}
            onChange={(e) => setTestEmailSubject(e.target.value)}
          />

          <Textarea
            label="Test Message Body"
            value={testEmailBody}
            onChange={(e) => setTestEmailBody(e.target.value)}
            rows={4}
          />

          <div className="flex justify-end">
            <Button
              variant="primary"
              icon={<Send size={15} />}
              onClick={handleSendTestEmail}
              loading={sendingTest}
            >
              Dispatch Test Email
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Template Management & Live Preview */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
              Email Dispatch Template Library (10 Active)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Customize automated messages for client onboarding, project updates, invoices, and payment receipts.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={handleRestoreDefaults}
          >
            Restore Defaults
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Template Selector Column */}
          <div className="lg:col-span-4 space-y-3">
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredTemplates.map((t) => {
                const isSelected = editingTemplate.id === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTemplate(t)
                      setEditingTemplate(t)
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100 shadow-sm'
                        : 'border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{t.name}</span>
                      <Badge variant="default">{t.category}</Badge>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                      {t.subject}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Template Editor Column */}
          <div className="lg:col-span-8 space-y-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Editing: {editingTemplate.name}
                </span>
                <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSaveTemplate}>
                  Save Template
                </Button>
              </div>

              <Input
                label="Template Name"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
              />

              <Input
                label="Email Subject Line"
                value={editingTemplate.subject}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
              />

              {/* Dynamic Variables helper toolbar */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Insert System Variables
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'clientName',
                    'clientId',
                    'clientEmail',
                    'projectName',
                    'projectId',
                    'invoiceNumber',
                    'invoiceAmount',
                    'amountPaid',
                    'outstandingBalance',
                    'paymentStatus',
                    'serviceName',
                    'loginUrl',
                    'supportEmail',
                    'companyName',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 transition-colors"
                    >
                      +{`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                label="Template Content Body"
                value={editingTemplate.body}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                rows={8}
              />

              {/* Live Preview Panel */}
              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-indigo-400" /> Live Substitution Preview
                  </span>
                  <span>{validation.isComplete ? 'All Variables Populated' : 'Unpopulated Placeholders Present'}</span>
                </div>

                <div className="font-semibold text-slate-200">
                  Subject: {substitutePlaceholders(editingTemplate.subject, { clientName: 'Kofi Mensah', companyName: 'LEXMEDIA.GH' })}
                </div>

                <div className="whitespace-pre-wrap font-sans text-slate-300 leading-relaxed pt-2">
                  {substitutePlaceholders(editingTemplate.body, {
                    clientName: 'Kofi Mensah',
                    clientId: 'LM-C-901',
                    clientEmail: 'kofi@example.com',
                    projectName: 'Corporate Brand Video',
                    projectId: 'PRJ-2026',
                    invoiceNumber: 'INV-1024',
                    invoiceAmount: 'GH₵4,500.00',
                    amountPaid: 'GH₵2,000.00',
                    outstandingBalance: 'GH₵2,500.00',
                    paymentStatus: 'Partial',
                    serviceName: '4K Videography',
                    loginUrl: 'https://lexmedia.gh/login',
                    supportEmail: 'lexmedia8gh@gmail.com',
                    companyName: 'LEXMEDIA.GH',
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
