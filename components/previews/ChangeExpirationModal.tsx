'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Clock } from 'lucide-react'
import type { ClientPreview, PreviewExpirationOption } from '@/lib/types'
import toast from 'react-hot-toast'

interface ChangeExpirationModalProps {
  isOpen: boolean
  onClose: () => void
  preview: ClientPreview | null
  onSuccess: (updated: any) => void
}

export function ChangeExpirationModal({
  isOpen,
  onClose,
  preview,
  onSuccess,
}: ChangeExpirationModalProps) {
  const [option, setOption] = useState<PreviewExpirationOption>(
    preview?.expirationOption || '7_days'
  )
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)

  if (!preview) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch(`/api/preview/admin/${preview.id}/update-expiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expirationOption: option,
          customExpirationDate: option === 'custom' ? customDate : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update expiration')
      }

      toast.success('Preview expiration updated successfully')
      onSuccess(data)
      onClose()
    } catch (err: any) {
      toast.error(err?.message || 'Error updating expiration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Preview Expiration"
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-xs text-gray-500">
          Modify the time window during which <strong className="text-gray-900 dark:text-white">{preview.clientName}</strong> can access <strong className="text-gray-900 dark:text-white">{preview.title}</strong>.
        </p>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            New Expiration Duration
          </label>
          <select
            value={option}
            onChange={(e: any) => setOption(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none"
          >
            <option value="1_hour">1 Hour from now</option>
            <option value="24_hours">24 Hours (1 Day) from now</option>
            <option value="3_days">3 Days from now</option>
            <option value="7_days">7 Days from now</option>
            <option value="never">No Expiration (Indefinite)</option>
            <option value="custom">Custom Date & Time</option>
          </select>
        </div>

        {option === 'custom' && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Select Expiration Date & Time
            </label>
            <input
              type="datetime-local"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Updating...' : 'Save Expiration'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
