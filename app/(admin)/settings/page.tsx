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
  Upload,
  X,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { useAuth } from '@/lib/hooks/useAuth'
import { getDocument, setDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import { changePassword } from '@/lib/firebase/auth'
import { storage } from '@/lib/firebase/config'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import type { BusinessSettings, BrandingSettings } from '@/lib/types'
import toast from 'react-hot-toast'

type SettingsTab = 'business' | 'invoice' | 'payment' | 'messages' | 'account' | 'branding'

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'business', label: 'Business Info', icon: Building2 },
  { id: 'invoice', label: 'Invoice Settings', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'messages', label: 'Messages & Terms', icon: MessageSquare },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'account', label: 'My Account', icon: User },
]

const DEFAULT_SETTINGS: Partial<BusinessSettings> = {
  businessName: 'Lexmedia',
  currency: 'GHS',
  currencySymbol: 'GH₵',
  invoicePrefix: 'LM-INV',
  invoiceStartNumber: 1,
  defaultTaxRate: 0,
  defaultWhatsAppMessage:
    'Hello {{clientName}}, your Lexmedia package is ready. Please review the details and complete your payment here: {{link}}',
}

const DEFAULT_BRANDING: BrandingSettings = {
  businessName: 'LexMedia',
  shortName: 'Lex',
  tagline: 'Professional Digital Services',
  logoUrl: '',
  logoLightUrl: '',
  faviconUrl: '',
  primaryColor: '#0A0A0A',
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

type UploadState = { status: 'idle' | 'uploading' | 'done' | 'error'; progress: number; error?: string }

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

function LogoUploader({
  label,
  currentUrl,
  fieldKey,
  onUploaded,
  onRemove,
  maxMB = 5,
}: {
  label: string
  currentUrl: string
  fieldKey: string
  onUploaded: (url: string) => void
  onRemove: () => void
  maxMB?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are accepted.')
      return
    }
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`File must be under ${maxMB}MB.`)
      return
    }

    setUploadState({ status: 'uploading', progress: 0 })

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fieldKey', fieldKey)

      const xhr = new XMLHttpRequest()
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploadState({ status: 'uploading', progress: pct })
        }
      })

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.downloadUrl) {
              onUploaded(res.downloadUrl)
              setUploadState({ status: 'done', progress: 100 })
              toast.success(`${label} uploaded successfully!`)
            } else {
              setUploadState({ status: 'error', progress: 0, error: res.error || 'Server upload failed.' })
              toast.error(res.error || 'Upload failed.')
            }
          } catch (e) {
            setUploadState({ status: 'error', progress: 0, error: 'Invalid response' })
            toast.error('Upload failed.')
          }
        } else {
          setUploadState({ status: 'error', progress: 0, error: `HTTP ${xhr.status}` })
          toast.error(`Upload failed (HTTP ${xhr.status})`)
        }
      }

      xhr.onerror = () => {
        setUploadState({ status: 'error', progress: 0, error: 'Network error' })
        toast.error('Network error during upload.')
      }

      xhr.open('POST', '/api/branding/upload')
      xhr.send(formData)

    } catch (err: any) {
      setUploadState({ status: 'error', progress: 0, error: err.message })
      toast.error('Upload failed.')
    }

    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-700">{label}</label>
      <div className="flex flex-col sm:flex-row items-start gap-3">
        <div className="w-24 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {currentUrl ? (
            <img src={currentUrl} alt={label} className="w-full h-full object-contain p-1" />
          ) : (
            <ImageIcon size={24} className="text-gray-300" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              id={`branding-upload-${fieldKey}`}
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploadState.status === 'uploading'}
            />
            <label
              htmlFor={`branding-upload-${fieldKey}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer select-none ${
                uploadState.status === 'uploading' ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <Upload size={13} />
              {currentUrl ? 'Replace' : 'Upload'}
            </label>
            {currentUrl && (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger-200 text-xs font-medium text-danger-600 hover:bg-danger-50 transition-colors"
              >
                <X size={13} />
                Remove
              </button>
            )}
          </div>
          {uploadState.status === 'uploading' && (
            <div className="space-y-1">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-accent-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">Uploading {uploadState.progress}%…</p>
            </div>
          )}
          {uploadState.status === 'done' && (
            <p className="text-xs text-success-600 flex items-center gap-1">
              <CheckCircle2 size={12} /> Uploaded successfully
            </p>
          )}
          {uploadState.status === 'error' && (
            <p className="text-xs text-danger-600 flex items-center gap-1">
              <AlertCircle size={12} /> {uploadState.error || 'Upload failed'}
            </p>
          )}
          <p className="text-[11px] text-gray-400">Max {maxMB}MB · PNG, JPG, SVG, WebP</p>
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
    async function loadSettings() {
      try {
        const doc = await getDocument<BusinessSettings>(COLLECTIONS.SETTINGS, 'business')
        if (doc) setSettings({ ...DEFAULT_SETTINGS, ...doc })
      } catch { /* use defaults */ } finally { setLoading(false) }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    async function loadBranding() {
      try {
        const doc = await getDocument<BrandingSettings>(COLLECTIONS.SETTINGS, 'branding')
        if (doc) setBranding((prev) => ({ ...prev, ...doc }))
      } catch { /* use defaults */ }
    }
    loadBranding()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDocument(COLLECTIONS.SETTINGS, 'business', settings, true)
      toast.success('Settings saved successfully!')
    } catch { toast.error('Failed to save settings. Please try again.') }
    finally { setSaving(false) }
  }

  const handleSaveBranding = async () => {
    setSaving(true)
    try {
      await setDocument(COLLECTIONS.SETTINGS, 'branding', branding, true)
      toast.success('Branding saved successfully!')
    } catch { toast.error('Failed to save branding. Please try again.') }
    finally { setSaving(false) }
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
        subtitle="Configure your Lexmedia business system"
        action={
          <Button
            variant="primary"
            icon={<Save size={16} />}
            onClick={activeTab === 'branding' ? handleSaveBranding : handleSave}
            loading={saving}
            disabled={activeTab === 'account'}
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
                      isActive ? 'bg-accent-50 text-accent-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-accent-600' : 'text-gray-400'} />
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
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 mb-6">Invoice Settings</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Invoice Number Prefix" value={settings.invoicePrefix ?? 'LM-INV'} onChange={(e) => update('invoicePrefix', e.target.value)} helperText="e.g. LM-INV → LM-INV-0001" required />
                    <Input label="Starting Invoice Number" type="number" min={1} value={String(settings.invoiceStartNumber ?? 1)} onChange={(e) => update('invoiceStartNumber', parseInt(e.target.value) || 1)} helperText="First invoice will use this number" />
                    <Select label="Currency" value={settings.currency ?? 'GHS'} onChange={(e) => update('currency', e.target.value)} options={[{ value: 'GHS', label: 'Ghana Cedi (GHS)' }, { value: 'USD', label: 'US Dollar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }, { value: 'GBP', label: 'British Pound (GBP)' }, { value: 'NGN', label: 'Nigerian Naira (NGN)' }]} />
                    <Input label="Currency Symbol" value={settings.currencySymbol ?? 'GH₵'} onChange={(e) => update('currencySymbol', e.target.value)} />
                    <Input label="Default Tax Rate (%)" type="number" min={0} max={100} step={0.5} value={String(settings.defaultTaxRate ?? 0)} onChange={(e) => update('defaultTaxRate', parseFloat(e.target.value) || 0)} helperText="Set to 0 for no tax" />
                    <Input label="Default Payment Terms" value={settings.defaultPaymentTerms ?? ''} onChange={(e) => update('defaultPaymentTerms', e.target.value)} placeholder="e.g. Net 30, Due on receipt" />
                  </div>
                </Card>
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
                    <p className="text-sm text-muted mb-5">Upload your brand logos. Use the light variant for dark backgrounds.</p>
                    <div className="space-y-6">
                      <LogoUploader label="Main Logo (light backgrounds)" currentUrl={branding.logoUrl} fieldKey="logo" maxMB={5} onUploaded={(url) => updateBranding('logoUrl', url)} onRemove={() => updateBranding('logoUrl', '')} />
                      <div className="border-t border-gray-100 pt-6">
                        <LogoUploader label="Light Logo (dark backgrounds)" currentUrl={branding.logoLightUrl} fieldKey="logoLight" maxMB={5} onUploaded={(url) => updateBranding('logoLightUrl', url)} onRemove={() => updateBranding('logoLightUrl', '')} />
                      </div>
                      <div className="border-t border-gray-100 pt-6">
                        <LogoUploader label="Favicon (32x32 recommended)" currentUrl={branding.faviconUrl} fieldKey="favicon" maxMB={2} onUploaded={(url) => updateBranding('faviconUrl', url)} onRemove={() => updateBranding('faviconUrl', '')} />
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Brand Colors</h3>
                    <p className="text-sm text-muted mb-5">Applied to all client-facing pages after saving.</p>
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
                          <img src={branding.logoUrl} alt="Logo" style={{ height: 40, objectFit: 'contain' }} />
                        ) : (
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ backgroundColor: branding.buttonColor, color: branding.buttonTextColor }}>
                            {(branding.shortName || 'LX').slice(0, 2).toUpperCase()}
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
                    <h3 className="text-base font-semibold text-gray-900 mb-6">My Profile</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Full Name" value={lexUser?.name ?? ''} readOnly helperText="Contact your administrator to change your name" />
                      <Input label="Email Address" value={lexUser?.email ?? user?.email ?? ''} readOnly />
                      <Input label="Role" value={lexUser?.role ?? ''} readOnly className="capitalize" />
                    </div>
                  </Card>
                  <Card>
                    <h3 className="text-base font-semibold text-gray-900 mb-1">Change Password</h3>
                    <p className="text-sm text-muted mb-6">You must know your current password to set a new one.</p>
                    <div className="space-y-4 max-w-sm">
                      <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} leftIcon={<Lock size={15} />} required />
                      <Button variant="primary" onClick={handlePasswordChange} loading={passwordLoading} disabled={!currentPassword || !newPassword || !confirmPassword}>Update Password</Button>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
