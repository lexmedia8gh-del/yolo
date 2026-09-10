'use client'

import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Phone,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getWelcomeMessage, getDefaultWelcomeTemplate } from '@/lib/services/sms/welcomeTemplate'
import { validatePhoneNumber } from '@/lib/services/sms/phoneUtils'
import { getDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { BusinessSettings } from '@/lib/types'
import toast from 'react-hot-toast'

interface SendWelcomeSmsModalProps {
  isOpen: boolean
  onClose: () => void
  clientName: string
  phoneNumber: string
  clientId?: string
  onSmsSent?: () => void
}

export function SendWelcomeSmsModal({
  isOpen,
  onClose,
  clientName,
  phoneNumber,
  clientId,
  onSmsSent,
}: SendWelcomeSmsModalProps) {
  const [recipientPhone, setRecipientPhone] = useState(phoneNumber || '')
  const [template, setTemplate] = useState(getDefaultWelcomeTemplate())
  const [isSending, setIsSending] = useState(false)
  const [lastResult, setLastResult] = useState<{
    success: boolean
    message?: string
    error?: string
    quotaRemaining?: number
    phone?: string
  } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setRecipientPhone(phoneNumber || '')
      setLastResult(null)
      // Load saved template from settings
      getDocument<BusinessSettings>(COLLECTIONS.SETTINGS, 'business')
        .then((doc) => {
          if (doc && doc.defaultWelcomeSmsTemplate) {
            setTemplate(doc.defaultWelcomeSmsTemplate)
          }
        })
        .catch(() => {
          // ignore, keep default
        })
    }
  }, [isOpen, phoneNumber])

  const validation = validatePhoneNumber(recipientPhone)
  const renderedMessage = getWelcomeMessage(clientName, validation.normalized || recipientPhone, 'LEXMEDIA.GH', template)

  const handleSend = async () => {
    if (!validation.isValid) {
      toast.error(validation.error || 'Please enter a valid phone number')
      return
    }

    setIsSending(true)
    setLastResult(null)

    try {
      const res = await fetch('/api/sms/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validation.normalized,
          clientName: clientName || 'Valued Client',
          clientId,
          customTemplate: template,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success === true) {
        const msg = data.message || 'SMS request accepted by provider'
        setLastResult({
          success: true,
          message: msg,
          quotaRemaining: data.quotaRemaining,
          phone: data.phone || validation.normalized,
        })
        toast.success(msg)
        if (onSmsSent) onSmsSent()
      } else {
        const errorMsg = data?.error || 'Provider rejected the SMS request.'
        setLastResult({
          success: false,
          error: errorMsg,
          quotaRemaining: data?.quotaRemaining,
          phone: data?.phone || validation.normalized,
        })
        toast.error(`SMS Delivery Notice: ${errorMsg}`, { duration: 5000 })
      }
    } catch (err: any) {
      console.error('Error sending welcome SMS:', err)
      const errorMsg = err?.message || 'Network error communicating with server'
      setLastResult({
        success: false,
        error: errorMsg,
      })
      toast.error(errorMsg)
    } finally {
      setIsSending(false)
    }
  }

  const handleResetTemplate = () => {
    setTemplate(getDefaultWelcomeTemplate())
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Welcome SMS"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted -mt-2">
          Dispatch an automated welcome message directly to the client&apos;s phone number via Textbelt.
        </p>

        {/* Recipient Input & Validation */}
        <div className="space-y-1.5">
          <Input
            label="Recipient Phone Number *"
            placeholder="+233 24 000 0000 or 0244123456"
            value={recipientPhone}
            onChange={(e) => {
              setRecipientPhone(e.target.value)
              setLastResult(null)
            }}
            leftIcon={<Phone size={15} className="text-gray-400" />}
          />
          <div className="text-[11px] flex items-center justify-between px-1">
            {recipientPhone ? (
              validation.isValid ? (
                <span className="text-emerald-600 flex items-center gap-1 font-medium">
                  <CheckCircle2 size={12} /> Normalized: {validation.normalized}
                </span>
              ) : (
                <span className="text-amber-600 flex items-center gap-1 font-medium">
                  <AlertCircle size={12} /> {validation.error}
                </span>
              )
            ) : (
              <span className="text-gray-400">Enter local or international phone format</span>
            )}
            <span className="text-gray-400 font-mono text-[10px]">E.164 standard</span>
          </div>
        </div>

        {/* Template Customizer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <Sparkles size={13} className="text-indigo-600" /> Message Template
            </label>
            <button
              type="button"
              onClick={handleResetTemplate}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <RefreshCw size={11} /> Reset Default
            </button>
          </div>
          <textarea
            rows={3}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
            placeholder="Customize welcome message template... supports {name}"
          />
          <span className="text-[10px] text-gray-400 block px-1">
            Available tags: <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono">&#123;clientName&#125;</code>, <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono">&#123;phoneNumber&#125;</code>
          </span>
        </div>

        {/* Live Preview */}
        <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
            <span>Live Message Preview</span>
            <span>{renderedMessage.length} characters</span>
          </div>
          <p className="text-xs text-gray-800 font-sans italic bg-white p-2.5 rounded-lg border border-gray-100">
            &ldquo;{renderedMessage}&rdquo;
          </p>
        </div>

        {/* Status / Result Display */}
        {lastResult && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
              lastResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border border-amber-200 text-amber-900'
            }`}
          >
            {lastResult.success ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-semibold">
                {lastResult.success ? 'SMS Request Accepted' : 'SMS Delivery Status'}
              </p>
              <p className="text-[11px] leading-relaxed">
                {lastResult.success ? lastResult.message : lastResult.error}
              </p>
              {typeof lastResult.quotaRemaining === 'number' && (
                <p className="text-[10px] opacity-80 pt-1">
                  Textbelt Quota Remaining: {lastResult.quotaRemaining}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!validation.isValid || isSending}
            loading={isSending}
            onClick={handleSend}
            icon={<Send size={14} />}
          >
            Send Welcome SMS
          </Button>
        </div>
      </div>
    </Modal>
  )
}
