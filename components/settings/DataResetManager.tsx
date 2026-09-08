'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Users,
  Briefcase,
  Receipt,
  CreditCard,
  Truck,
  Bell,
  CheckSquare,
  ListFilter,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import {
  getLiveRecordCounts,
  executeDataReset,
  DataCountsSummary,
  ResetCategorySelection,
} from '@/lib/services/dataReset'
import toast from 'react-hot-toast'

const CONFIRMATION_PHRASE = 'RESET DATA'

export function DataResetManager() {
  const [counts, setCounts] = useState<DataCountsSummary | null>(null)
  const [loadingCounts, setLoadingCounts] = useState(true)
  const [preset, setPreset] = useState<'demo' | 'financial' | 'tasks' | 'custom'>('demo')
  
  const [selection, setSelection] = useState<ResetCategorySelection>({
    clients: true,
    projects: true,
    invoices: true,
    payments: true,
    clientLinks: true,
    deliveries: true,
    reminders: true,
    tasks: true,
    logs: true,
    catalog: false,
  })

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true)
    try {
      const data = await getLiveRecordCounts()
      setCounts(data)
    } catch (err) {
      console.warn('Failed to load data counts:', err)
    } finally {
      setLoadingCounts(false)
    }
  }, [])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  // Handle Preset Changes
  const handlePresetChange = (newPreset: 'demo' | 'financial' | 'tasks' | 'custom') => {
    setPreset(newPreset)
    if (newPreset === 'demo') {
      setSelection({
        clients: true,
        projects: true,
        invoices: true,
        payments: true,
        clientLinks: true,
        deliveries: true,
        reminders: true,
        tasks: true,
        logs: true,
        catalog: false,
      })
    } else if (newPreset === 'financial') {
      setSelection({
        clients: false,
        projects: false,
        invoices: true,
        payments: true,
        clientLinks: true,
        deliveries: false,
        reminders: false,
        tasks: false,
        logs: false,
        catalog: false,
      })
    } else if (newPreset === 'tasks') {
      setSelection({
        clients: false,
        projects: false,
        invoices: false,
        payments: false,
        clientLinks: false,
        deliveries: false,
        reminders: true,
        tasks: true,
        logs: false,
        catalog: false,
      })
    }
  }

  const toggleCategory = (key: keyof ResetCategorySelection) => {
    setPreset('custom')
    setSelection((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const hasAnySelection = Object.values(selection).some(Boolean)

  const handleOpenModal = () => {
    if (!hasAnySelection) {
      toast.error('Please select at least one data category to reset')
      return
    }
    setConfirmInput('')
    setIsModalOpen(true)
  }

  const handleExecuteReset = async () => {
    if (confirmInput.trim().toUpperCase() !== CONFIRMATION_PHRASE) {
      toast.error(`Please type "${CONFIRMATION_PHRASE}" exactly to confirm`)
      return
    }

    setIsResetting(true)
    const toastId = toast.loading('Executing safe relational data reset...')

    try {
      // 1. Client & Firestore reset
      const result = await executeDataReset(selection)

      // 2. Trigger server-side Supabase cascade endpoint
      try {
        await fetch('/api/admin/reset-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selection,
            confirmationPhrase: CONFIRMATION_PHRASE,
          }),
        })
      } catch (sbErr) {
        console.warn('Server-side cascade cleanup note:', sbErr)
      }

      if (result.success) {
        toast.success(
          `Data reset complete! ${result.totalDeleted} records cleared. Core settings preserved.`,
          { id: toastId, duration: 6000 }
        )
        setIsModalOpen(false)
        setConfirmInput('')
        await loadCounts()
      } else {
        toast.error(`Reset finished with warnings: ${result.error || 'Unknown issue'}`, {
          id: toastId,
          duration: 5000,
        })
      }
    } catch (err: any) {
      console.error('Error during data reset:', err)
      toast.error(`Failed to complete reset: ${err?.message || 'Server error'}`, { id: toastId })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Intro Card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5 mb-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <RotateCcw size={18} className="text-indigo-600" />
              Data Management & Reset
            </h3>
            <p className="text-xs text-muted max-w-2xl leading-relaxed">
              Prepare Ctrl Room for a fresh production start by safely clearing demo, test, or sample operational records without corrupting database integrity.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadCounts}
            loading={loadingCounts}
            icon={<RefreshCw size={13} className={loadingCounts ? 'animate-spin' : ''} />}
          >
            Refresh Counts
          </Button>
        </div>

        {/* Live Record Counts Grid */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Current Live Database Records
            </span>
            {counts && (
              <span className="text-xs font-medium text-muted">
                Total Operational Records:{' '}
                <strong className="text-gray-900 font-mono">{counts.totalRecords}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><Users size={13} /> Clients</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.clients ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><Briefcase size={13} /> Projects</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.projects ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><Receipt size={13} /> Invoices & Items</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.invoices ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><CreditCard size={13} /> Payments</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.payments ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><Truck size={13} /> Deliveries</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.deliveries ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><Bell size={13} /> Reminders</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.reminders ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><CheckSquare size={13} /> Tasks</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.tasks ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><ListFilter size={13} /> Activity & Logs</span>
              </div>
              <p className="text-lg font-bold text-gray-900 font-mono">
                {loadingCounts ? '...' : counts?.logs ?? 0}
              </p>
            </div>

            <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-200/80 col-span-2">
              <div className="flex items-center justify-between text-muted text-xs mb-1">
                <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-600" /> Core Settings & Branding</span>
              </div>
              <p className="text-xs font-semibold text-emerald-700 mt-1">
                Always Protected & Preserved
              </p>
            </div>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="space-y-3 mb-6">
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Reset Preset
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => handlePresetChange('demo')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'demo'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-border bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>All Demo Data</span>
                {preset === 'demo' && <Badge variant="accent" size="sm">Active</Badge>}
              </div>
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Clears all clients, projects, finances, tasks & logs.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handlePresetChange('financial')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'financial'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-border bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>Financials Only</span>
                {preset === 'financial' && <Badge variant="accent" size="sm">Active</Badge>}
              </div>
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Clears invoices, payments & payment links only.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handlePresetChange('tasks')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'tasks'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-border bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>Reminders & Tasks</span>
                {preset === 'tasks' && <Badge variant="accent" size="sm">Active</Badge>}
              </div>
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Clears reminders, task lists & schedule boards.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handlePresetChange('custom')}
              className={`p-3 rounded-xl border text-left transition-all ${
                preset === 'custom'
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-border bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>Custom Granular</span>
                {preset === 'custom' && <Badge variant="accent" size="sm">Active</Badge>}
              </div>
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Manually check specific tables to reset.
              </p>
            </button>
          </div>
        </div>

        {/* Detailed Category Checklist */}
        <div className="space-y-3 mb-6 p-4 bg-gray-50/60 rounded-xl border border-gray-200/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-800">
              Selected Scopes for Deletion
            </span>
            <span className="text-[11px] text-muted">
              Select or deselect categories as required
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.clients}
                onChange={() => toggleCategory('clients')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Clients & Contacts</span>
                <p className="text-[10px] text-gray-500">Includes contact info & profile metadata</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.projects}
                onChange={() => toggleCategory('projects')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Projects</span>
                <p className="text-[10px] text-gray-500">Project briefs, status & milestones</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.invoices}
                onChange={() => toggleCategory('invoices')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Invoices & Line Items</span>
                <p className="text-[10px] text-gray-500">All issued and draft invoices</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.payments}
                onChange={() => toggleCategory('payments')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Payments & Transactions</span>
                <p className="text-[10px] text-gray-500">Recorded receipts and ledger entries</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.clientLinks}
                onChange={() => toggleCategory('clientLinks')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Payment Links</span>
                <p className="text-[10px] text-gray-500">Active and expired client payment tokens</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.deliveries}
                onChange={() => toggleCategory('deliveries')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Deliveries & Files</span>
                <p className="text-[10px] text-gray-500">Delivery records & file manifests</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.reminders}
                onChange={() => toggleCategory('reminders')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Smart Reminders</span>
                <p className="text-[10px] text-gray-500">Due alerts & event reminders</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.tasks}
                onChange={() => toggleCategory('tasks')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Tasks Board</span>
                <p className="text-[10px] text-gray-500">Task items, priorities & board cards</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
              <input
                type="checkbox"
                checked={selection.logs}
                onChange={() => toggleCategory('logs')}
                className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-800">Activity & SMS Logs</span>
                <p className="text-[10px] text-gray-500">Audit trails, notifications & SMS histories</p>
              </div>
            </label>
          </div>
        </div>

        {/* Protected Assets Banner */}
        <div className="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                Protected System Data (Always Preserved)
              </h4>
              <p className="text-xs text-emerald-800 leading-relaxed">
                The reset engine strictly preserves your <strong>Business Information</strong>, <strong>Brand Colors & Logos</strong>, <strong>Invoice Numbering Configuration</strong>, <strong>Tax Settings</strong>, and <strong>Administrator User Login Credentials</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Action Trigger */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
          <div className="text-xs text-muted flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-600" />
            <span>Destructive actions require explicit verification phrase confirmation.</span>
          </div>

          <Button
            type="button"
            variant="danger"
            onClick={handleOpenModal}
            disabled={!hasAnySelection || loadingCounts}
            icon={<AlertTriangle size={15} />}
          >
            Review & Reset Selected Data
          </Button>
        </div>
      </Card>

      {/* Strong Confirmation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isResetting && setIsModalOpen(false)}
        title="Confirm Destructive Data Reset"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm">Warning: Irreversible Action</p>
              <p className="leading-relaxed">
                You are about to permanently delete selected operational data from your Ctrl Room database. This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Deletion Summary Checklist */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Scopes marked for permanent deletion:
            </label>
            <div className="p-3 bg-gray-50 rounded-xl border border-border text-xs space-y-1.5 font-medium text-gray-800">
              {selection.clients && <div>• All Clients & Contact Profiles ({counts?.clients ?? 0} records)</div>}
              {selection.projects && <div>• All Projects & Milestones ({counts?.projects ?? 0} records)</div>}
              {selection.invoices && <div>• All Invoices & Line Items ({counts?.invoices ?? 0} records)</div>}
              {selection.payments && <div>• All Recorded Payments & Transactions ({counts?.payments ?? 0} records)</div>}
              {selection.clientLinks && <div>• All Client Payment Links ({counts?.clientLinks ?? 0} records)</div>}
              {selection.deliveries && <div>• All Project Deliveries & Files ({counts?.deliveries ?? 0} records)</div>}
              {selection.reminders && <div>• All Smart Reminders ({counts?.reminders ?? 0} records)</div>}
              {selection.tasks && <div>• All Tasks & Boards ({counts?.tasks ?? 0} records)</div>}
              {selection.logs && <div>• All Activity, Notifications & SMS Logs ({counts?.logs ?? 0} records)</div>}
            </div>
          </div>

          {/* Typing Verification Input */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-gray-800">
              Type <span className="font-mono text-rose-600 font-extrabold">{CONFIRMATION_PHRASE}</span> to confirm:
            </label>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={`Type ${CONFIRMATION_PHRASE}`}
              className="font-mono tracking-wider font-semibold"
              disabled={isResetting}
            />
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={confirmInput.trim().toUpperCase() !== CONFIRMATION_PHRASE || isResetting}
              loading={isResetting}
              onClick={handleExecuteReset}
              icon={<RotateCcw size={14} />}
            >
              Permanently Erase Selected Data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
