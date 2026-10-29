'use client'

import React, { useState, useEffect } from 'react'
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
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  ShieldCheck,
  KeyRound,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DataResetManager } from '@/components/settings/DataResetManager'
import { LogoUploadField } from '@/components/branding/LogoUploadField'
import { PinInput } from '@/components/auth/PinInput'
import { sanitizeBrandingLogoUrl } from '@/lib/hooks/useInvoiceBranding'
import { useAuth } from '@/lib/hooks/useAuth'
import { getDocument, setDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import {
  changePassword,
  changePin,
  resetPinWithGoogle,
  getActiveIdToken,
  initiateAdminEmailChange,
  reauthenticateAdminWithGoogle,
  updateAdminDisplayName,
} from '@/lib/firebase/auth'
import { getFirebaseErrorMessage } from '@/lib/utils'
import type { BusinessSettings, BrandingSettings } from '@/lib/types'
import toast from 'react-hot-toast'

type SettingsTab = 'business' | 'invoice' | 'payment' | 'messages' | 'sms' | 'branding' | 'security' | 'account' | 'data_reset'

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'business', label: 'Business Info', icon: Building2 },
  { id: 'invoice', label: 'Invoice Settings', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'messages', label: 'Messages & Terms', icon: MessageSquare },
  { id: 'sms', label: 'SMS Settings', icon: MessageSquare },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'security', label: 'Login & Security', icon: ShieldCheck },
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

const ACCOUNT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function SettingsPage() {
  const { user, lexUser, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('business')
  const [settings, setSettings] = useState<Partial<BusinessSettings>>(DEFAULT_SETTINGS)
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Account Profile Editing State
  const [accountName, setAccountName] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountEdited, setAccountEdited] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountNameError, setAccountNameError] = useState('')
  const [accountEmailError, setAccountEmailError] = useState('')
  const [accountGeneralError, setAccountGeneralError] = useState('')
  const [accountSuccessMsg, setAccountSuccessMsg] = useState('')

  // Reauthentication & Pending Verification State
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthPasswordError, setReauthPasswordError] = useState('')
  const [needsReauthPrompt, setNeedsReauthPrompt] = useState(false)
  const [checkingPendingEmail, setCheckingPendingEmail] = useState(false)
  const [resendingPendingEmail, setResendingPendingEmail] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Security 6-Digit PIN State
  const [pinChangeCurrent, setPinChangeCurrent] = useState('')
  const [pinChangeNew, setPinChangeNew] = useState('')
  const [pinChangeConfirm, setPinChangeConfirm] = useState('')
  const [pinChangeLoading, setPinChangeLoading] = useState(false)
  const [pinChangeError, setPinChangeError] = useState('')

  const [pinResetNew, setPinResetNew] = useState('')
  const [pinResetConfirm, setPinResetConfirm] = useState('')
  const [pinResetLoading, setPinResetLoading] = useState(false)
  const [pinResetError, setPinResetError] = useState('')

  const baselineName = (lexUser?.name || user?.displayName || '').trim()
  const baselineEmail = (user?.email || lexUser?.email || '').trim()
  const pendingVerificationEmail =
    lexUser?.pendingEmail &&
    lexUser.pendingEmail.trim().toLowerCase() !== baselineEmail.toLowerCase()
      ? lexUser.pendingEmail.trim()
      : null

  const normalizedInputName = accountName.trim().replace(/\s+/g, ' ')
  const normalizedInputEmail = accountEmail.trim().toLowerCase()
  const isNameChanged = normalizedInputName !== baselineName.replace(/\s+/g, ' ')
  const isEmailChanged =
    Boolean(baselineEmail) && normalizedInputEmail !== baselineEmail.toLowerCase()
  const hasAccountChanges = isNameChanged || isEmailChanged

  const hasPasswordProvider =
    !user?.providerIds || user.providerIds.includes('password')
  const hasGoogleProvider = Boolean(user?.providerIds?.includes('google.com'))

  // Support ?tab=account deep-linking (including return from email verification link)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab') as SettingsTab | null
    if (tabParam && tabs.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam)
      if (tabParam === 'account') {
        refreshUser().catch(() => {})
      }
    }
  }, [refreshUser])

  // Keep form prepopulated with authoritative profile values unless user has unsaved edits
  useEffect(() => {
    if (!accountEdited) {
      if (baselineName) setAccountName(baselineName)
      if (baselineEmail) setAccountEmail(baselineEmail)
    }
  }, [baselineName, baselineEmail, accountEdited])

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

  const validateAccountInputs = (): boolean => {
    let valid = true
    setAccountNameError('')
    setAccountEmailError('')
    setReauthPasswordError('')
    setAccountGeneralError('')

    if (!normalizedInputName) {
      setAccountNameError('Full name cannot be empty.')
      valid = false
    } else if (normalizedInputName.length < 2) {
      setAccountNameError('Full name must be at least 2 characters.')
      valid = false
    } else if (normalizedInputName.length > 120) {
      setAccountNameError('Full name must be 120 characters or fewer.')
      valid = false
    }

    if (!normalizedInputEmail) {
      setAccountEmailError('Email address cannot be empty.')
      valid = false
    } else if (
      normalizedInputEmail.length > 254 ||
      !ACCOUNT_EMAIL_REGEX.test(normalizedInputEmail)
    ) {
      setAccountEmailError('Please enter a valid email address.')
      valid = false
    }

    if (
      isEmailChanged &&
      needsReauthPrompt &&
      hasPasswordProvider &&
      !hasGoogleProvider &&
      !reauthPassword
    ) {
      setReauthPasswordError('Please enter your current password to confirm this email change.')
      valid = false
    }

    return valid
  }

  const executeAccountSave = async (options?: { skipPasswordOption?: boolean }) => {
    if (accountSaving) return
    if (!hasAccountChanges) return
    if (!validateAccountInputs()) return

    if (!user?.uid) {
      setAccountGeneralError('Your session has expired. Please sign in again to save changes.')
      return
    }

    setAccountSaving(true)
    setAccountGeneralError('')
    setAccountSuccessMsg('')

    try {
      const initialToken = await getActiveIdToken()
      if (!initialToken) {
        throw Object.assign(
          new Error('Your session has expired. Please sign in again.'),
          { code: 'auth/user-token-expired' }
        )
      }

      // 1. Process Firebase Authentication email change first if email was modified
      let emailOutcome:
        | { status: 'updated'; activeEmail: string }
        | { status: 'verification_sent'; activeEmail: string; pendingEmail: string }
        | null = null

      if (isEmailChanged) {
        emailOutcome = await initiateAdminEmailChange(
          normalizedInputEmail,
          !options?.skipPasswordOption && reauthPassword
            ? { currentPassword: reauthPassword }
            : undefined
        )
      }

      // 2. Persist & verify via backend admin account route BEFORE mutating client profile state
      //    so network or backend failures never leave partial client state or falsely report success.
      const latestToken = (await getActiveIdToken(true)) || initialToken
      let patchRes: Response
      try {
        patchRes = await fetch('/api/admin/account', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${latestToken}`,
          },
          body: JSON.stringify({
            ...(isNameChanged ? { name: normalizedInputName } : {}),
            ...(emailOutcome?.status === 'verification_sent'
              ? { pendingEmail: emailOutcome.pendingEmail }
              : isEmailChanged
              ? { pendingEmail: null }
              : {}),
          }),
        })
      } catch {
        throw Object.assign(
          new Error('Network error while saving profile changes. Please check your connection and try again.'),
          { code: 'auth/network-request-failed' }
        )
      }

      const patchPayload = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok || patchPayload?.ok === false) {
        if (patchPayload?.field === 'name') {
          setAccountNameError(patchPayload.error || 'Invalid full name.')
          return
        }
        if (patchPayload?.field === 'email') {
          setAccountEmailError(patchPayload.error || 'Invalid email address.')
          return
        }
        throw Object.assign(
          new Error(patchPayload?.error || 'Failed to save account changes.'),
          { code: patchPayload?.code || (patchRes.status === 401 ? 'auth/user-token-expired' : 'backend-error') }
        )
      }

      // 3. Process Firebase Authentication displayName update if name was modified
      if (isNameChanged) {
        await updateAdminDisplayName(normalizedInputName)
      }

      // 4. Synchronize Firestore users/{uid} document without overwriting unrelated fields
      const authoritativeEmail =
        emailOutcome?.status === 'updated'
          ? emailOutcome.activeEmail
          : emailOutcome?.status === 'verification_sent'
          ? emailOutcome.activeEmail
          : baselineEmail

      const firestoreUpdate: Record<string, unknown> = {
        uid: user.uid,
        email: authoritativeEmail,
        role: lexUser?.role || 'admin',
      }

      if (isNameChanged) {
        firestoreUpdate.name = normalizedInputName
        firestoreUpdate.displayName = normalizedInputName
      }

      if (emailOutcome?.status === 'verification_sent') {
        firestoreUpdate.pendingEmail = emailOutcome.pendingEmail
        firestoreUpdate.pendingEmailRequestedAt = new Date().toISOString()
      } else if (emailOutcome?.status === 'updated') {
        firestoreUpdate.pendingEmail = null
        firestoreUpdate.pendingEmailRequestedAt = null
      }

      try {
        await setDocument(COLLECTIONS.USERS, user.uid, firestoreUpdate, true)
      } catch (clientFsErr) {
        console.warn('[Account Save] Client Firestore update fallback:', clientFsErr)
      }
      try {
        await refreshUser()
      } catch {}

      // 5. Update clean form state and report accurate confirmation
      setAccountName(normalizedInputName)
      setReauthPassword('')
      setReauthPasswordError('')
      setNeedsReauthPrompt(false)

      if (emailOutcome?.status === 'verification_sent') {
        // Keep active verified email in the field until the pending address is verified
        setAccountEmail(emailOutcome.activeEmail)
        setAccountEdited(false)
        const msg = isNameChanged
          ? `Full name updated. A verification link has been sent to ${emailOutcome.pendingEmail} — confirm it to complete your email change.`
          : `Verification email sent to ${emailOutcome.pendingEmail}. Your login email remains ${emailOutcome.activeEmail} until verified.`
        setAccountSuccessMsg(msg)
        toast.success('Verification email sent!')
      } else {
        const finalEmail =
          emailOutcome?.status === 'updated' ? emailOutcome.activeEmail : baselineEmail
        setAccountEmail(finalEmail)
        setAccountEdited(false)
        const msg =
          isNameChanged && isEmailChanged
            ? 'Full name and email address updated successfully.'
            : isEmailChanged
            ? 'Email address updated successfully.'
            : 'Full name updated successfully.'
        setAccountSuccessMsg(msg)
        toast.success(msg)
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || ''
      const rawMessage = (err as { message?: string })?.message || ''

      if (code === 'auth/email-already-in-use') {
        setAccountEmailError('This email address is already registered to another account.')
      } else if (code === 'auth/invalid-email') {
        setAccountEmailError('Please enter a valid email address.')
      } else if (code === 'validation/invalid-name') {
        setAccountNameError(rawMessage || 'Please enter a valid full name.')
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setNeedsReauthPrompt(true)
        setReauthPasswordError('Incorrect current password. Please verify your password and try again.')
      } else if (code === 'auth/requires-recent-login') {
        setNeedsReauthPrompt(true)
        if (hasPasswordProvider && !reauthPassword) {
          setReauthPasswordError('For your security, enter your current password to confirm this email change.')
        }
        setAccountGeneralError(
          'Firebase requires recent authentication before changing your email address. Please confirm your identity below and save again.'
        )
      } else {
        const friendly =
          code && code !== 'backend-error'
            ? getFirebaseErrorMessage(code)
            : rawMessage || 'Failed to save account changes. Please try again.'
        setAccountGeneralError(friendly)
      }
    } finally {
      setAccountSaving(false)
    }
  }

  const handleSaveAccountForm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    await executeAccountSave()
  }

  const handleGoogleReauthAndSave = async () => {
    if (accountSaving) return
    if (!validateAccountInputs()) return
    setAccountGeneralError('')
    setReauthPasswordError('')
    try {
      await reauthenticateAdminWithGoogle()
      setNeedsReauthPrompt(false)
      await executeAccountSave({ skipPasswordOption: true })
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || ''
      setAccountGeneralError(getFirebaseErrorMessage(code))
    }
  }

  const handleResetAccountChanges = () => {
    setAccountName(baselineName)
    setAccountEmail(baselineEmail)
    setAccountEdited(false)
    setAccountNameError('')
    setAccountEmailError('')
    setReauthPassword('')
    setReauthPasswordError('')
    setNeedsReauthPrompt(false)
    setAccountGeneralError('')
    setAccountSuccessMsg('')
  }

  const handleCheckPendingVerification = async () => {
    if (!pendingVerificationEmail || checkingPendingEmail) return
    setCheckingPendingEmail(true)
    setAccountGeneralError('')
    setAccountSuccessMsg('')
    try {
      await refreshUser()
      const currentAuthEmail = (user?.email || '').trim().toLowerCase()
      // Re-check directly via token/auth reload
      const { reloadAndSyncAdminAuthUser } = await import('@/lib/firebase/auth')
      const freshAuthUser = await reloadAndSyncAdminAuthUser()
      const latestEmail = (freshAuthUser?.email || currentAuthEmail).trim()

      if (latestEmail.toLowerCase() === pendingVerificationEmail.toLowerCase() && user?.uid) {
        await setDocument(
          COLLECTIONS.USERS,
          user.uid,
          {
            uid: user.uid,
            email: latestEmail,
            pendingEmail: null,
            pendingEmailRequestedAt: null,
          },
          true
        )
        const token = await getActiveIdToken(true)
        if (token) {
          await fetch('/api/admin/account', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ pendingEmail: null }),
          }).catch(() => {})
        }
        await refreshUser()
        setAccountEmail(latestEmail)
        setAccountEdited(false)
        setAccountSuccessMsg(`Email verified! Your account now uses ${latestEmail}.`)
        toast.success('New email verified and synced!')
      } else {
        toast('Verification is still pending. Please click the link sent to your new email first.')
      }
    } catch {
      setAccountGeneralError('Could not check verification status. Please check your connection and try again.')
    } finally {
      setCheckingPendingEmail(false)
    }
  }

  const handleResendPendingVerification = async () => {
    if (!pendingVerificationEmail || resendingPendingEmail) return
    setResendingPendingEmail(true)
    setAccountGeneralError('')
    setAccountSuccessMsg('')
    try {
      const outcome = await initiateAdminEmailChange(
        pendingVerificationEmail,
        reauthPassword ? { currentPassword: reauthPassword } : undefined
      )
      if (outcome.status === 'verification_sent') {
        setAccountSuccessMsg(`Verification link resent to ${outcome.pendingEmail}.`)
        toast.success('Verification email resent!')
      } else {
        await refreshUser()
        setAccountSuccessMsg(`Email updated to ${outcome.activeEmail}.`)
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || ''
      if (code === 'auth/requires-recent-login') {
        setNeedsReauthPrompt(true)
        setAccountGeneralError('Please confirm your identity below before resending the verification email.')
      } else {
        setAccountGeneralError(getFirebaseErrorMessage(code))
      }
    } finally {
      setResendingPendingEmail(false)
    }
  }

  const handleCancelPendingEmail = async () => {
    if (!user?.uid) return
    setAccountGeneralError('')
    try {
      const token = await getActiveIdToken()
      if (token) {
        const res = await fetch('/api/admin/account', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ pendingEmail: null }),
        })
        if (!res.ok) throw new Error('Failed to clear pending email.')
      }
      await setDocument(
        COLLECTIONS.USERS,
        user.uid,
        {
          uid: user.uid,
          pendingEmail: null,
          pendingEmailRequestedAt: null,
        },
        true
      )
      await refreshUser()
      toast.success('Pending email notice cleared.')
    } catch {
      setAccountGeneralError('Failed to clear pending email state. Please try again.')
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
      toast.error(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : getFirebaseErrorMessage(code)
      )
    } finally { setPasswordLoading(false) }
  }

  const handleChangePinSubmit = async () => {
    setPinChangeError('')
    if (pinChangeCurrent.length !== 6) {
      setPinChangeError('Please enter your current 6-digit PIN.')
      return
    }
    if (pinChangeNew.length !== 6) {
      setPinChangeError('New PIN must be exactly 6 digits.')
      return
    }
    if (pinChangeNew !== pinChangeConfirm) {
      setPinChangeError('New PIN and confirmation PIN do not match.')
      return
    }

    setPinChangeLoading(true)
    try {
      await changePin(pinChangeCurrent, pinChangeNew, pinChangeConfirm)
      toast.success('6-Digit Security PIN updated successfully!')
      setPinChangeCurrent('')
      setPinChangeNew('')
      setPinChangeConfirm('')
    } catch (err: any) {
      setPinChangeError(err?.message || 'Failed to update PIN. Please verify your current PIN.')
    } finally {
      setPinChangeLoading(false)
    }
  }

  const handleResetPinSubmit = async () => {
    setPinResetError('')
    if (pinResetNew.length !== 6) {
      setPinResetError('New PIN must be exactly 6 digits.')
      return
    }
    if (pinResetNew !== pinResetConfirm) {
      setPinResetError('New PIN and confirmation PIN do not match.')
      return
    }

    setPinResetLoading(true)
    try {
      await resetPinWithGoogle(pinResetNew, pinResetConfirm)
      toast.success('6-Digit Security PIN reset via Google successfully!')
      setPinResetNew('')
      setPinResetConfirm('')
    } catch (err: any) {
      setPinResetError(err?.message || 'Failed to reset PIN with Google.')
    } finally {
      setPinResetLoading(false)
    }
  }

  const update = (key: keyof BusinessSettings, value: string | number) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const updateBranding = (key: keyof BrandingSettings, value: string) =>
    setBranding((prev) => ({ ...prev, [key]: value }))

  const isHeaderSaving = activeTab === 'account' ? accountSaving : saving
  const isHeaderDisabled =
    activeTab === 'data_reset' ||
    (activeTab === 'account' ? accountSaving || !hasAccountChanges : saving)
  const handleHeaderSaveClick = () => {
    if (activeTab === 'account') {
      void executeAccountSave()
    } else if (activeTab === 'branding') {
      void handleSaveBranding()
    } else {
      void handleSave()
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Configure system settings"
        action={
          <Button
            variant="primary"
            icon={<Save size={16} />}
            onClick={handleHeaderSaveClick}
            loading={isHeaderSaving}
            disabled={isHeaderDisabled}
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

              {activeTab === 'security' && (
                <div className="space-y-6">
                  <Card>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#1D63ED] flex items-center justify-center shrink-0">
                        <KeyRound size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Change 6-Digit PIN
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Update your master security PIN used to log into LexMedia Ctrl Room.
                        </p>
                      </div>
                    </div>

                    {pinChangeError && (
                      <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>{pinChangeError}</span>
                      </div>
                    )}

                    <div className="space-y-5 max-w-md">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Current 6-Digit PIN
                        </label>
                        <PinInput
                          value={pinChangeCurrent}
                          onChange={setPinChangeCurrent}
                          disabled={pinChangeLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          New 6-Digit PIN
                        </label>
                        <PinInput
                          value={pinChangeNew}
                          onChange={setPinChangeNew}
                          disabled={pinChangeLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Confirm New 6-Digit PIN
                        </label>
                        <PinInput
                          value={pinChangeConfirm}
                          onChange={setPinChangeConfirm}
                          disabled={pinChangeLoading}
                        />
                      </div>

                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="primary"
                          icon={<Save size={15} />}
                          loading={pinChangeLoading}
                          onClick={handleChangePinSubmit}
                          disabled={
                            pinChangeCurrent.length !== 6 ||
                            pinChangeNew.length !== 6 ||
                            pinChangeConfirm.length !== 6 ||
                            pinChangeLoading
                          }
                        >
                          Update 6-Digit PIN
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Reset PIN with Google Account
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Forgot your PIN? Verify your identity with your administrator Google account to set a new PIN.
                        </p>
                      </div>
                    </div>

                    {pinResetError && (
                      <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>{pinResetError}</span>
                      </div>
                    )}

                    <div className="space-y-5 max-w-md">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          New 6-Digit PIN
                        </label>
                        <PinInput
                          value={pinResetNew}
                          onChange={setPinResetNew}
                          disabled={pinResetLoading}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Confirm New 6-Digit PIN
                        </label>
                        <PinInput
                          value={pinResetConfirm}
                          onChange={setPinResetConfirm}
                          disabled={pinResetLoading}
                        />
                      </div>

                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          icon={<ShieldCheck size={15} />}
                          loading={pinResetLoading}
                          onClick={handleResetPinSubmit}
                          disabled={
                            pinResetNew.length !== 6 ||
                            pinResetConfirm.length !== 6 ||
                            pinResetLoading
                          }
                        >
                          Verify with Google &amp; Reset PIN
                        </Button>
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
                    <form onSubmit={handleSaveAccountForm} noValidate className="space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">My Profile</h3>
                          <p className="text-sm text-muted dark:text-gray-400 mt-0.5">
                            Update your administrator display name and authenticated sign-in email address.
                          </p>
                        </div>
                      </div>

                      {accountGeneralError && (
                        <div
                          role="alert"
                          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs"
                        >
                          <AlertCircle size={16} className="shrink-0 mt-0.5" />
                          <span>{accountGeneralError}</span>
                        </div>
                      )}

                      {accountSuccessMsg && (
                        <div
                          role="status"
                          className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs"
                        >
                          <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{accountSuccessMsg}</span>
                        </div>
                      )}

                      {pendingVerificationEmail && (
                        <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold text-amber-900 dark:text-amber-200">
                                Pending Email Verification
                              </p>
                              <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
                                Current verified email:{' '}
                                <strong className="font-semibold">{baselineEmail}</strong> · Pending new email:{' '}
                                <strong className="font-semibold">{pendingVerificationEmail}</strong>
                              </p>
                              <p className="text-amber-700 dark:text-amber-400">
                                Open the verification email sent to {pendingVerificationEmail} and click the confirmation link. Your account continues using {baselineEmail} until verified.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pl-6">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              icon={<RefreshCw size={13} />}
                              loading={checkingPendingEmail}
                              onClick={handleCheckPendingVerification}
                            >
                              Check Verification Status
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={resendingPendingEmail}
                              onClick={handleResendPendingVerification}
                            >
                              Resend Link
                            </Button>
                            <button
                              type="button"
                              onClick={handleCancelPendingEmail}
                              className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1"
                            >
                              Dismiss Notice
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Full Name"
                          value={accountName}
                          onChange={(e) => {
                            setAccountName(e.target.value)
                            setAccountEdited(true)
                            if (accountNameError) setAccountNameError('')
                            if (accountSuccessMsg) setAccountSuccessMsg('')
                          }}
                          leftIcon={<User size={15} />}
                          error={accountNameError}
                          helperText="Displayed across the portal, activity logs, and navigation"
                          disabled={accountSaving}
                          required
                        />

                        <Input
                          label="Email Address"
                          type="email"
                          value={accountEmail}
                          onChange={(e) => {
                            setAccountEmail(e.target.value)
                            setAccountEdited(true)
                            if (accountEmailError) setAccountEmailError('')
                            if (accountSuccessMsg) setAccountSuccessMsg('')
                          }}
                          leftIcon={<Mail size={15} />}
                          error={accountEmailError}
                          helperText={
                            user?.emailVerified === false
                              ? `Current sign-in email (${baselineEmail}) — unverified`
                              : `Current verified sign-in email: ${baselineEmail || '—'}`
                          }
                          disabled={accountSaving}
                          required
                        />

                        <Input
                          label="Role"
                          value={lexUser?.role ?? 'admin'}
                          readOnly
                          disabled
                          className="capitalize"
                          helperText="Administrator access level (read-only)"
                        />
                      </div>

                      {(isEmailChanged || needsReauthPrompt) && (
                        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-3">
                          <div className="flex items-start gap-2">
                            <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                            <div className="text-xs space-y-0.5">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">
                                Confirm Identity for Email Change
                              </p>
                              <p className="text-gray-600 dark:text-gray-400">
                                Changing your sign-in email from <strong>{baselineEmail}</strong> to{' '}
                                <strong>{normalizedInputEmail || accountEmail}</strong> requires recent authentication.
                              </p>
                            </div>
                          </div>

                          {hasPasswordProvider && (
                            <div className="max-w-sm">
                              <Input
                                label="Current Password"
                                type="password"
                                value={reauthPassword}
                                onChange={(e) => {
                                  setReauthPassword(e.target.value)
                                  if (reauthPasswordError) setReauthPasswordError('')
                                }}
                                leftIcon={<Lock size={15} />}
                                placeholder="Enter your current password"
                                error={reauthPasswordError}
                                helperText="Confirms your identity before updating Firebase Authentication"
                                disabled={accountSaving}
                              />
                            </div>
                          )}

                          {hasGoogleProvider && (
                            <div className="pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleGoogleReauthAndSave}
                                disabled={accountSaving || !hasAccountChanges}
                              >
                                Verify with Google &amp; Save Email
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                        {hasAccountChanges && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleResetAccountChanges}
                            disabled={accountSaving}
                          >
                            Reset
                          </Button>
                        )}
                        <Button
                          type="submit"
                          variant="primary"
                          icon={<Save size={15} />}
                          loading={accountSaving}
                          disabled={accountSaving || !hasAccountChanges}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </form>
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
