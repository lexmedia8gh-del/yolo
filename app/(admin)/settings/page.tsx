'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Building2,
  CreditCard,
  FileText,
  MessageSquare,
  User,
  Save,
  Lock,
  Palette,
  RotateCcw,
  Layers,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DataResetManager } from '@/components/settings/DataResetManager'
import { LogoUploadField } from '@/components/branding/LogoUploadField'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import { useAuth } from '@/lib/hooks/useAuth'
import { getDocument, setDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import { changePassword } from '@/lib/firebase/auth'
import type { BusinessSettings, BrandingSettings } from '@/lib/types'
import toast from 'react-hot-toast'

type SettingsTab = 'business' | 'invoice' | 'payment' | 'messages' | 'sms' | 'account' | 'branding' | 'data_reset'

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'business', label: 'Business Info', icon: Building2 },
  { id: 'invoice', label: 'Invoice Settings', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'messages', label: 'Messages & Terms', icon: MessageSquare },
  { id: 'sms', label: 'SMS Settings', icon: MessageSquare },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'account', label: 'My Account', icon: User },
  { id: 'data_reset', label: 'Data & Reset', icon: RotateCcw },
]

const DEFAULT_SETTINGS: Partial<BusinessSettings> = {
  businessName: 'lexmedia.gh',
  currency: 'GHS',
  currencySymbol: 'GH₵',
  invoicePrefix: 'LM-INV',
  invoiceStartNumber: 1,
  defaultTaxRate: 0,
  defaultWhatsAppMessage:
    'Hello {{clientName}}, your lexmedia.gh package is ready. Please review the details and complete your payment here: {{link}}',
  defaultWelcomeSmsTemplate:
    'Hello {clientName}, welcome to lexmedia.gh. We are happy to have you as our client.',
}

const DEFAULT_BRANDING: BrandingSettings = {
  businessName: 'lexmedia.gh',
  shortName: 'lex',
  tagline: 'Professional Digital Services',
  logoUrl: '',
  logoStoragePath: '',
  logoLightUrl: '',
  logoLightStoragePath: '',
  faviconUrl: '',
  faviconStoragePath: '',
  primaryColor: '#0F172A',
  secondaryColor: '#6366F1',
  accentColor: '#4F46E5',
  backgroundColor: '#F8F9FC',
  surfaceColor: '#FFFFFF',
  textColor: '#111827',
  mutedTextColor: '#6B7280',
  buttonColor: '#0A0A0A',
  buttonTextColor: '#FFFFFF',
}

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (val: string) => void
}) {
  const [hexInput, setHexInput] = useState(value)
  const [hexError, setHexError] = useState('')

  useEffect(() => {
    setHexInput(value)
  }, [value])

  const handleHexBlur = () => {
    if (!HEX_REGEX.test(hexInput)) {
      setHexError('Invalid hex color (e.g. #4F46E5)')
    } else {
      setHexError('')
      onChange(hexInput)
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_REGEX.test(value) ? value : '#000000'}
          onChange={(e) => {
            onChange(e.target.value)
            setHexInput(e.target.value)
            setHexError('')
          }}
          className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
        />
        <div className="flex-1">
          <input
            type="text"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={handleHexBlur}
            className={`w-full px-3 py-2 rounded-lg border text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none ${
              hexError ? 'border-danger-500 focus:ring-danger-500' : 'border-gray-200'
            }`}
            placeholder="#000000"
          />
          {hexError && <p className="text-xs text-danger-600 mt-0.5">{hexError}</p>}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user, lexUser } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('business')
  const [settings, setSettings] = useState<Partial<BusinessSettings>>(DEFAULT_SETTINGS)
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    let active = true
    async function loadAllSettings() {
      try {
        const [bizDoc, brandDoc] = await Promise.all([
          getDocument<BusinessSettings>(COLLECTIONS.SETTINGS, 'business').catch(() => null),
          getDocument<BrandingSettings>(COLLECTIONS.SETTINGS, 'branding').catch(() => null),
        ])

        let apiBranding: Partial<BrandingSettings> | null = null
        let apiBusiness: Partial<BusinessSettings> | null = null
        if (!bizDoc && !brandDoc) {
          try {
            const res = await fetch('/api/branding', { cache: 'no-store' })
            if (res.ok) {
              const json = await res.json()
              apiBranding = json.branding || null
              apiBusiness = json.business || null
            }
          } catch {}
        }

        if (!active) return

        const effectiveBiz = bizDoc || apiBusiness || {}
        const effectiveBrand = brandDoc || apiBranding || {}

        const cleanLogoUrl =
          sanitizeBrandingLogoUrl(effectiveBrand.logoUrl) ||
          sanitizeBrandingLogoUrl(effectiveBiz.logoURL)
        const cleanLogoPath =
          (cleanLogoUrl &&
            (effectiveBrand.logoStoragePath || effectiveBiz.logoStoragePath)) ||
          ''

        setSettings({
          ...DEFAULT_SETTINGS,
          ...effectiveBiz,
          logoURL: cleanLogoUrl,
          logoStoragePath: cleanLogoPath,
        })

        setBranding((prev) => ({
          ...prev,
          ...effectiveBrand,
          logoUrl: cleanLogoUrl,
          logoStoragePath: cleanLogoPath,
          logoLightUrl: sanitizeBrandingLogoUrl(effectiveBrand.logoLightUrl),
          faviconUrl: sanitizeBrandingLogoUrl(effectiveBrand.faviconUrl),
        }))
      } finally {
        if (active) setLoading(false)
      }
    }
    loadAllSettings()
    return () => {
      active = false
    }
  }, [])

  const handleMainLogoUploaded = ({
    downloadUrl,
    storagePath,
  }: {
    downloadUrl: string
    storagePath: string
  }) => {
    setBranding((prev) => ({ ...prev, logoUrl: downloadUrl, logoStoragePath: storagePath }))
    setSettings((prev) => ({ ...prev, logoURL: downloadUrl, logoStoragePath: storagePath }))
  }

  const handleMainLogoRemoved = () => {
    setBranding((prev) => ({ ...prev, logoUrl: '', logoStoragePath: '' }))
    setSettings((prev) => ({ ...prev, logoURL: '', logoStoragePath: '' }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const syncedSettings: Partial<BusinessSettings> = {
        ...settings,
        logoURL: sanitizeBrandingLogoUrl(settings.logoURL || branding.logoUrl),
        logoStoragePath: settings.logoStoragePath || branding.logoStoragePath || '',
      }
      await setDocument(COLLECTIONS.SETTINGS, 'business', syncedSettings, true)
      if (syncedSettings.businessName) {
        await setDocument(
          COLLECTIONS.SETTINGS,
          'branding',
          {
            businessName: syncedSettings.businessName,
            tagline: syncedSettings.tagline ?? branding.tagline,
            logoUrl: syncedSettings.logoURL || '',
            logoStoragePath: syncedSettings.logoStoragePath || '',
          },
          true
        )
      }
      fetch('/api/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: syncedSettings }),
      }).catch(() => {})
      toast.success('Settings saved successfully!')
    } catch {
      toast.error('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBranding = async () => {
    setSaving(true)
    try {
      await setDocument(COLLECTIONS.SETTINGS, 'branding', branding, true)
      await setDocument(
        COLLECTIONS.SETTINGS,
        'business',
        {
          businessName: branding.businessName || settings.businessName,
          logoURL: branding.logoUrl || '',
          logoStoragePath: branding.logoStoragePath || '',
        },
        true
      )
      fetch('/api/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branding,
          business: {
            logoURL: branding.logoUrl || '',
            logoStoragePath: branding.logoStoragePath || '',
          },
        }),
      }).catch(() => {})
      toast.success('Branding saved successfully!')
    } catch {
      toast.error('Failed to save branding. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match.'); return }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters.'); return }
    if (!user) return
    setPasswordLoading(true)
    try {
      await changePassword(user, currentPassword, newPassword)
      toast.success('Password changed successfully!')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      toast.error(code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Failed to change password. Please try again.')
    } finally { setPasswordLoading(false) }
  }

  const update = (key: keyof BusinessSettings, value: string | number) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const updateBranding = (key: keyof BrandingSettings, value: string) =>
    setBranding((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Configure system settings"
        action={
          <Button
            variant="primary"
            icon={<Save size={16} />}
            onClick={activeTab === 'branding' ? handleSaveBranding : handleSave}
            loading={saving}
            disabled={activeTab === 'account' || activeTab === 'data_reset'}
          >
            Save Changes
          </Button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6 mt-2">
        <div className="lg:w-52 shrink-0">
          <Card padding="sm">
            <nav className="space-y-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      size={16}
                      className={
                        isActive
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }
                    />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          {loading ? (
            <Card>
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
                    <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <>
              {activeTab === 'business' && (
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 mb-6">Business Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Business Name" value={settings.businessName ?? ''} onChange={(e) => update('businessName', e.target.value)} required />
                    <Input label="Tagline" value={settings.tagline ?? ''} onChange={(e) => update('tagline', e.target.value)} placeholder="Creative agency for brands that matter" />
                    <Input label="Email Address" type="email" value={settings.email ?? ''} onChange={(e) => update('email', e.target.value)} required />
                    <Input label="Phone Number" value={settings.phone ?? ''} onChange={(e) => update('phone', e.target.value)} placeholder="+233 XX XXX XXXX" />
                    <Input label="WhatsApp Number" value={settings.whatsapp ?? ''} onChange={(e) => update('whatsapp', e.target.value)} placeholder="+233XXXXXXXXX (with country code)" />
                    <Input label="Website" value={settings.website ?? ''} onChange={(e) => update('website', e.target.value)} placeholder="https://lexmedia.com" />
                    <Textarea label="Business Address" value={settings.address ?? ''} onChange={(e) => update('address', e.target.value)} rows={3} wrapperClassName="sm:col-span-2" placeholder="Accra, Ghana" />
                  </div>
                </Card>
              )}

              {activeTab === 'invoice' && (
                <div className="space-y-6">
                  <Card>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Invoice Brand Logo</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Displayed in the invoice header, print preview, and downloaded PDFs. Stored persistently in cloud storage.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('branding')}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0 self-start sm:self-auto"
                      >
                        Customize Brand Colors →
                      </button>
                    </div>
                    <LogoUploadField
                      label="Invoice & Brand Logo"
                      currentUrl={settings.logoURL || branding.logoUrl}
                      currentStoragePath={settings.logoStoragePath || branding.logoStoragePath}
                      fieldKey="logo"
                      maxMB={5}
                      persistSettings={true}
                      adminId={user?.uid}
                      onUploaded={handleMainLogoUploaded}
                      onRemoved={handleMainLogoRemoved}
                    />
                  </Card>

                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-6">Invoice Numbering & Defaults</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Invoice Number Prefix" value={settings.invoicePrefix ?? 'LM-INV'} onChange={(e) => update('invoicePrefix', e.target.value)} helperText="e.g. LM-INV → LM-INV-0001" required />
                      <Input label="Starting Invoice Number" type="number" min={1} value={String(settings.invoiceStartNumber ?? 1)} onChange={(e) => update('invoiceStartNumber', parseInt(e.target.value) || 1)} helperText="First invoice will use this number" />
                      <Select label="Currency" value={settings.currency ?? 'GHS'} onChange={(e) => update('currency', e.target.value)} options={[{ value: 'GHS', label: 'Ghana Cedi (GHS)' }, { value: 'USD', label: 'US Dollar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }, { value: 'GBP', label: 'British Pound (GBP)' }, { value: 'NGN', label: 'Nigerian Naira (NGN)' }]} />
                      <Input label="Currency Symbol" value={settings.currencySymbol ?? 'GH₵'} onChange={(e) => update('currencySymbol', e.target.value)} />
                      <Input label="Default Tax Rate (%)" type="number" min={0} max={100} step={0.5} value={String(settings.defaultTaxRate ?? 0)} onChange={(e) => update('defaultTaxRate', parseFloat(e.target.value) || 0)} helperText="Set to 0 for no tax" />
                      <Input label="Default Payment Terms" value={settings.defaultPaymentTerms ?? ''} onChange={(e) => update('defaultPaymentTerms', e.target.value)} placeholder="e.g. Net 30, Due on receipt" />
                      <Textarea label="Default Payment Instructions" value={settings.defaultPaymentInstructions ?? ''} onChange={(e) => update('defaultPaymentInstructions', e.target.value)} rows={3} wrapperClassName="sm:col-span-2" placeholder="Bank transfer or Mobile Money account details shown on invoices..." />
                      <Textarea label="Default Invoice Notes" value={settings.defaultNotes ?? ''} onChange={(e) => update('defaultNotes', e.target.value)} rows={2} placeholder="Optional default note for clients..." />
                      <Textarea label="Default Thank You Message" value={settings.defaultThankYouMessage ?? ''} onChange={(e) => update('defaultThankYouMessage', e.target.value)} rows={2} placeholder="Thank you for your business with LEXMEDIA.GH!" />
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'payment' && (
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">Paystack Configuration</h3>
                  <p className="text-sm text-muted mb-6">Your Paystack public key is used for client-side checkout. The secret key must be set in your <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">.env.local</code> file and is never stored here.</p>
                  <div className="space-y-4">
                    <Input label="Paystack Public Key" value={settings.paystackPublicKey ?? ''} onChange={(e) => update('paystackPublicKey', e.target.value)} placeholder="pk_live_xxxxxxxxxxxxxxxxxx" helperText="Safe to store — this is your public key only" />
                    <div className="p-4 bg-warning-50 border border-warning-100 rounded-xl">
                      <p className="text-sm font-medium text-warning-700 mb-1">⚠️ Keep your Secret Key safe</p>
                      <p className="text-xs text-warning-600">Your Paystack <strong>Secret Key</strong> (<code className="font-mono">sk_live_...</code>) must ONLY be stored in <code className="font-mono">.env.local</code> as <code className="font-mono">PAYSTACK_SECRET_KEY</code>. Never paste it here or in any client-side code.</p>
                    </div>
                  </div>
                </Card>
              )}

              {activeTab === 'messages' && (
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 mb-6">Default Messages & Terms</h3>
                  <div className="space-y-4">
                    <Textarea label="Default WhatsApp Message Template" value={settings.defaultWhatsAppMessage ?? ''} onChange={(e) => update('defaultWhatsAppMessage', e.target.value)} rows={4} helperText="Use {{clientName}} and {{link}} as placeholders" />
                    <Textarea label="Default Terms & Conditions" value={settings.defaultTermsAndConditions ?? ''} onChange={(e) => update('defaultTermsAndConditions', e.target.value)} rows={6} placeholder="Enter your standard terms and conditions..." />
                  </div>
                </Card>
              )}

              {activeTab === 'sms' && (
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">SMS / Welcome Message Settings</h3>
                  <p className="text-sm text-muted mb-6">
                    Configure the automated welcome SMS message that is sent to newly created clients when the SMS welcome workflow is triggered via Textbelt.
                  </p>
                  <div className="space-y-4">
                    <Textarea
                      label="Welcome Message Template"
                      value={settings.defaultWelcomeSmsTemplate ?? ''}
                      onChange={(e) => update('defaultWelcomeSmsTemplate', e.target.value)}
                      rows={5}
                      helperText="Supports placeholders: {clientName} and {phoneNumber}"
                    />
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                      <p className="text-xs font-semibold text-gray-700">Live Preview:</p>
                      <p className="text-xs text-gray-800 italic bg-white p-3 rounded-lg border border-gray-100 font-sans">
                        &ldquo;{(settings.defaultWelcomeSmsTemplate || 'Hello {clientName}, welcome to LEXMEDIA.GH.')
                          .replace(/\{clientName\}/gi, 'John Doe')
                          .replace(/\{phoneNumber\}/gi, '+233551515208')}&rdquo;
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {activeTab === 'branding' && (
                <div className="space-y-6">
                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Business Identity</h3>
                    <p className="text-sm text-muted mb-5">Your brand name and tagline displayed on client-facing pages.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Business Name" value={branding.businessName} onChange={(e) => updateBranding('businessName', e.target.value)} placeholder="LexMedia" />
                      <Input label="Short Brand Name" value={branding.shortName} onChange={(e) => updateBranding('shortName', e.target.value)} placeholder="LX" helperText="Used in compact logo fallback" />
                      <Input label="Tagline" value={branding.tagline} onChange={(e) => updateBranding('tagline', e.target.value)} placeholder="Professional Digital Services" wrapperClassName="sm:col-span-2" />
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Logo & Favicon</h3>
                    <p className="text-sm text-muted mb-5">Upload your brand logos to cloud storage. Saved immediately and applied across homepage, invoices, and client portals.</p>
                    <div className="space-y-6">
                      <LogoUploadField
                        label="Main Brand & Invoice Logo (light backgrounds)"
                        currentUrl={branding.logoUrl}
                        currentStoragePath={branding.logoStoragePath}
                        fieldKey="logo"
                        maxMB={5}
                        persistSettings={true}
                        adminId={user?.uid}
                        onUploaded={handleMainLogoUploaded}
                        onRemoved={handleMainLogoRemoved}
                      />
                      <div className="border-t border-gray-100 pt-6">
                        <LogoUploadField
                          label="Light Logo (dark backgrounds)"
                          currentUrl={branding.logoLightUrl}
                          currentStoragePath={branding.logoLightStoragePath}
                          fieldKey="logoLight"
                          maxMB={5}
                          persistSettings={true}
                          adminId={user?.uid}
                          onUploaded={({ downloadUrl, storagePath }) =>
                            setBranding((prev) => ({
                              ...prev,
                              logoLightUrl: downloadUrl,
                              logoLightStoragePath: storagePath,
                            }))
                          }
                          onRemoved={() =>
                            setBranding((prev) => ({
                              ...prev,
                              logoLightUrl: '',
                              logoLightStoragePath: '',
                            }))
                          }
                        />
                      </div>
                      <div className="border-t border-gray-100 pt-6">
                        <LogoUploadField
                          label="Favicon (32x32 recommended)"
                          currentUrl={branding.faviconUrl}
                          currentStoragePath={branding.faviconStoragePath}
                          fieldKey="favicon"
                          maxMB={2}
                          persistSettings={true}
                          adminId={user?.uid}
                          onUploaded={({ downloadUrl, storagePath }) =>
                            setBranding((prev) => ({
                              ...prev,
                              faviconUrl: downloadUrl,
                              faviconStoragePath: storagePath,
                            }))
                          }
                          onRemoved={() =>
                            setBranding((prev) => ({
                              ...prev,
                              faviconUrl: '',
                              faviconStoragePath: '',
                            }))
                          }
                        />
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Brand Colors</h3>
                    <p className="text-sm text-muted mb-5">Applied to invoices and client-facing pages after saving.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <ColorField label="Primary Color" value={branding.primaryColor} onChange={(v) => updateBranding('primaryColor', v)} />
                      <ColorField label="Secondary Color" value={branding.secondaryColor} onChange={(v) => updateBranding('secondaryColor', v)} />
                      <ColorField label="Accent Color" value={branding.accentColor} onChange={(v) => updateBranding('accentColor', v)} />
                      <ColorField label="Background Color" value={branding.backgroundColor} onChange={(v) => updateBranding('backgroundColor', v)} />
                      <ColorField label="Surface / Card Color" value={branding.surfaceColor} onChange={(v) => updateBranding('surfaceColor', v)} />
                      <ColorField label="Main Text Color" value={branding.textColor} onChange={(v) => updateBranding('textColor', v)} />
                      <ColorField label="Muted Text Color" value={branding.mutedTextColor} onChange={(v) => updateBranding('mutedTextColor', v)} />
                      <ColorField label="Button Color" value={branding.buttonColor} onChange={(v) => updateBranding('buttonColor', v)} />
                      <ColorField label="Button Text Color" value={branding.buttonTextColor} onChange={(v) => updateBranding('buttonTextColor', v)} />
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Live Preview</h3>
                    <p className="text-sm text-muted mb-5">Real-time preview of your branding before saving.</p>
                    <div className="rounded-2xl p-6 space-y-4 border" style={{ backgroundColor: branding.backgroundColor, borderColor: branding.primaryColor + '20' }}>
                      <div className="flex items-center gap-3">
                        {branding.logoUrl ? (
                          <img src={branding.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="h-10 w-auto max-w-[120px] object-contain" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-900 text-white">
                            <Layers size={18} />
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-sm" style={{ color: branding.textColor }}>{branding.businessName || 'Your Brand Name'}</p>
                          <p className="text-xs" style={{ color: branding.mutedTextColor }}>{branding.tagline || 'Your tagline here'}</p>
                        </div>
                      </div>
                      <div className="rounded-xl p-4 space-y-2 border" style={{ backgroundColor: branding.surfaceColor, borderColor: branding.primaryColor + '15' }}>
                        <p className="text-sm font-semibold" style={{ color: branding.textColor }}>Payment Request</p>
                        <p className="text-xs" style={{ color: branding.mutedTextColor }}>Invoice #LM-INV-0001 — GH₵ 2,500.00</p>
                        <div className="pt-2">
                          <div className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold" style={{ backgroundColor: branding.buttonColor, color: branding.buttonTextColor }}>
                            Pay Now
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'account' && (
                <div className="space-y-4">
                  <Card>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Theme Preference</h3>
                        <p className="text-sm text-muted dark:text-gray-400 mt-0.5">Toggle between Light, Dark, or System mode.</p>
                      </div>
                      <ThemeToggle variant="segmented" />
                    </div>
                  </Card>
                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-6">My Profile</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Full Name" value={lexUser?.name ?? ''} readOnly helperText="Contact your administrator to change your name" />
                      <Input label="Email Address" value={lexUser?.email ?? user?.email ?? ''} readOnly />
                      <Input label="Role" value={lexUser?.role ?? ''} readOnly className="capitalize" />
                    </div>
                  </Card>
                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Change Password</h3>
                    <p className="text-sm text-muted dark:text-gray-400 mb-6">You must know your current password to set a new one.</p>
                    <div className="space-y-4 max-w-sm">
                      <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Button variant="primary" onClick={handlePasswordChange} loading={passwordLoading} disabled={!currentPassword || !newPassword || !confirmPassword}>Update Password</Button>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === 'data_reset' && <DataResetManager />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
