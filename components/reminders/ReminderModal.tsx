'use client'

import React, { useState, useEffect } from 'react'
import {
  BellRing,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  User,
  FolderKanban,
  FileText,
  AlertCircle,
  CheckCircle2,
  Tag,
  MessageSquare,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  COLLECTIONS,
  addDocument,
  updateDocument,
  getDocuments,
} from '@/lib/firebase/firestore'
import type {
  SmartReminder,
  ReminderCategory,
  ReminderPriority,
  ReminderStatus,
  Client,
  Project,
} from '@/lib/types'
import { formatWhatsAppPhone, generateWhatsAppLink } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ReminderModalProps {
  isOpen: boolean
  onClose: () => void
  reminderToEdit?: SmartReminder | null
  defaultCategory?: ReminderCategory
  defaultFieldOriented?: boolean
  defaultImportantEvent?: boolean
  defaultClientId?: string
  defaultProjectId?: string
  onSaved?: (reminder: SmartReminder) => void
}

const CATEGORY_OPTIONS: { value: ReminderCategory; label: string; desc: string }[] = [
  { value: 'field', label: 'Field-Oriented / On-Site', desc: 'Shoots, client visits, location scout, delivery drops' },
  { value: 'event', label: 'Important Event', desc: 'Major shoots, launches, milestones, contract signing' },
  { value: 'payment', label: 'Payment & Invoice', desc: 'Deposit collection, invoice due date, balance follow-up' },
  { value: 'milestone', label: 'Project Milestone', desc: 'First cut review, photo selection, final delivery' },
  { value: 'client', label: 'Client Follow-up', desc: 'Intake brief, feedback check-in, review request' },
  { value: 'general', label: 'General Task', desc: 'Internal studio reminder, equipment maintenance' },
]

const PRIORITY_OPTIONS: { value: ReminderPriority; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent Priority', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  { value: 'high', label: 'High Priority', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'medium', label: 'Medium Priority', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  { value: 'low', label: 'Low Priority', color: 'text-gray-700 bg-gray-50 border-gray-200' },
]

const QUICK_SUGGESTIONS = [
  { title: 'On-site Client Shoot & Gear Check', category: 'field', isField: true, isEvent: true },
  { title: 'Equipment Prep & Battery Charging', category: 'field', isField: true, isEvent: false },
  { title: 'Collect 50% Deposit via WhatsApp', category: 'payment', isField: false, isEvent: false },
  { title: 'Send Project Intake Brief', category: 'client', isField: false, isEvent: false },
  { title: 'Deliver Edited High-Res Gallery', category: 'milestone', isField: false, isEvent: true },
  { title: 'Invoice Balance Due Follow-up', category: 'payment', isField: false, isEvent: false },
]

export function ReminderModal({
  isOpen,
  onClose,
  reminderToEdit,
  defaultCategory = 'general',
  defaultFieldOriented = false,
  defaultImportantEvent = false,
  defaultClientId = '',
  defaultProjectId = '',
  onSaved,
}: ReminderModalProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form State
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<ReminderStatus>('pending')
  const [category, setCategory] = useState<ReminderCategory>(defaultCategory)
  const [priority, setPriority] = useState<ReminderPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [isFieldOriented, setIsFieldOriented] = useState(defaultFieldOriented)
  const [fieldLocation, setFieldLocation] = useState('')
  const [isImportantEvent, setIsImportantEvent] = useState(defaultImportantEvent)
  const [clientId, setClientId] = useState(defaultClientId)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [whatsappNotification, setWhatsappNotification] = useState(false)

  // Fetch clients and projects on mount
  useEffect(() => {
    if (isOpen) {
      getDocuments<Client>(COLLECTIONS.CLIENTS).then((data) => setClients(data || []))
      getDocuments<Project>(COLLECTIONS.PROJECTS).then((data) => setProjects(data || []))
    }
  }, [isOpen])

  // Populate form if editing
  useEffect(() => {
    if (reminderToEdit) {
      setTitle(reminderToEdit.title || '')
      setNotes(reminderToEdit.notes || '')
      setStatus(reminderToEdit.status || 'pending')
      setCategory(reminderToEdit.category || 'general')
      setPriority(reminderToEdit.priority || 'medium')
      setDueDate(reminderToEdit.dueDate || '')
      setDueTime(reminderToEdit.dueTime || '')
      setIsFieldOriented(Boolean(reminderToEdit.isFieldOriented))
      setFieldLocation(reminderToEdit.fieldLocation || '')
      setIsImportantEvent(Boolean(reminderToEdit.isImportantEvent))
      setClientId(reminderToEdit.clientId || '')
      setProjectId(reminderToEdit.projectId || '')
      setWhatsappNotification(Boolean(reminderToEdit.whatsappNotification))
    } else {
      // Defaults for new reminder
      const today = new Date().toISOString().split('T')[0]
      setTitle('')
      setNotes('')
      setStatus('pending')
      setCategory(defaultCategory)
      setPriority('medium')
      setDueDate(today)
      setDueTime('10:00')
      setIsFieldOriented(defaultFieldOriented)
      setFieldLocation('')
      setIsImportantEvent(defaultImportantEvent)
      setClientId(defaultClientId)
      setProjectId(defaultProjectId)
      setWhatsappNotification(false)
    }
    setErrors({})
  }, [reminderToEdit, isOpen, defaultCategory, defaultFieldOriented, defaultImportantEvent, defaultClientId, defaultProjectId])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Reminder title is required'
    if (!dueDate) errs.dueDate = 'Due date is required'
    if (isFieldOriented && !fieldLocation.trim()) {
      errs.fieldLocation = 'Location is recommended for field-oriented reminders'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const selectedClient = clients.find((c) => c.id === clientId)
      const selectedProject = projects.find((p) => p.id === projectId)

      const payload: Omit<SmartReminder, 'id'> = {
        title: title.trim(),
        notes: notes.trim() || undefined,
        status,
        category,
        priority,
        dueDate,
        dueTime: dueTime || undefined,
        isFieldOriented,
        fieldLocation: isFieldOriented ? fieldLocation.trim() || undefined : undefined,
        isImportantEvent,
        clientId: clientId || undefined,
        clientName: selectedClient?.fullName || undefined,
        projectId: projectId || undefined,
        projectName: selectedProject?.name || undefined,
        whatsappNotification,
        whatsappPhone: selectedClient?.whatsappNumber || selectedClient?.phone || undefined,
        completedAt: status === 'completed' ? new Date().toISOString() : null,
        createdAt: reminderToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      let savedDoc: SmartReminder

      if (reminderToEdit?.id) {
        await updateDocument(COLLECTIONS.REMINDERS, reminderToEdit.id, payload)
        savedDoc = { id: reminderToEdit.id, ...payload } as SmartReminder
        toast.success('Smart Reminder updated successfully!')
      } else {
        const newId = await addDocument(COLLECTIONS.REMINDERS, payload)
        savedDoc = { id: newId, ...payload } as SmartReminder
        toast.success('Smart Reminder created!')
      }

      if (onSaved) onSaved(savedDoc)
      onClose()
    } catch (err: any) {
      console.error('Error saving reminder:', err)
      toast.error(err?.message || 'Failed to save reminder')
    } finally {
      setLoading(false)
    }
  }

  const handleApplySuggestion = (sug: typeof QUICK_SUGGESTIONS[0]) => {
    setTitle(sug.title)
    setCategory(sug.category as ReminderCategory)
    setIsFieldOriented(sug.isField)
    setIsImportantEvent(sug.isEvent)
  }

  const selectedClientObj = clients.find((c) => c.id === clientId)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reminderToEdit ? 'Edit Smart Reminder' : 'Create Smart Reminder'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quick Suggestion Pills */}
        {!reminderToEdit && (
          <div className="space-y-1.5 pb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Quick Templates
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplySuggestion(sug)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-gray-200 bg-gray-50 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                >
                  {sug.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <Input
          label="Reminder Title"
          placeholder="e.g. On-site Wedding Shoot & Equipment Check"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
          leftIcon={<BellRing size={15} className="text-gray-400" />}
        />

        {/* Category & Priority Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Category *</label>
            <select
              value={category}
              onChange={(e) => {
                const val = e.target.value as ReminderCategory
                setCategory(val)
                if (val === 'field') setIsFieldOriented(true)
                if (val === 'event') setIsImportantEvent(true)
              }}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Priority Level *</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ReminderPriority)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date & Time Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              type="date"
              label="Due Date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              error={errors.dueDate}
              required
              leftIcon={<Calendar size={15} className="text-gray-400" />}
            />
          </div>

          <div>
            <Input
              type="time"
              label="Due Time (Optional)"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              leftIcon={<Clock size={15} className="text-gray-400" />}
            />
          </div>
        </div>

        {/* Specialized Feature Toggles */}
        <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Field-Oriented Toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isFieldOriented}
                onChange={(e) => setIsFieldOriented(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
              />
              <div>
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <MapPin size={13} className="text-emerald-600" />
                  Field-Oriented Reminder
                </span>
                <span className="text-[11px] text-gray-500 block">
                  For on-site shoots, client visits, gear delivery
                </span>
              </div>
            </label>

            {/* Important Event Toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isImportantEvent}
                onChange={(e) => setIsImportantEvent(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300"
              />
              <div>
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-purple-600" />
                  Important Event
                </span>
                <span className="text-[11px] text-gray-500 block">
                  Highlighted as a top-priority milestone
                </span>
              </div>
            </label>
          </div>

          {/* Location field when field-oriented */}
          {isFieldOriented && (
            <div className="pt-2 border-t border-gray-200/70">
              <Input
                label="Field Location / Venue / Address"
                placeholder="e.g. Kempinski Hotel Gold Coast City, Accra"
                value={fieldLocation}
                onChange={(e) => setFieldLocation(e.target.value)}
                error={errors.fieldLocation}
                leftIcon={<MapPin size={14} className="text-emerald-600" />}
              />
            </div>
          )}
        </div>

        {/* Association: Client & Project */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Link to Client (Optional)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- No Client Linked --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} {c.company ? `(${c.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Link to Project (Optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- No Project Linked --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.clientName ? `• ${p.clientName}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status selector (if editing) */}
        {reminderToEdit && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Status</label>
            <div className="grid grid-cols-4 gap-2">
              {(['pending', 'completed', 'snoozed', 'cancelled'] as ReminderStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                    status === st
                      ? st === 'completed'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : st === 'snoozed'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : st === 'cancelled'
                        ? 'bg-gray-500 text-white border-gray-500'
                        : 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <Textarea
          label="Reminder Notes & Instructions"
          placeholder="Add details, equipment checklist, contact person on-site, or special requirements..."
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {/* WhatsApp Notification helper */}
        {selectedClientObj && (selectedClientObj.whatsappNumber || selectedClientObj.phone) && (
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-emerald-600" />
              <div>
                <p className="text-xs font-semibold text-emerald-950">WhatsApp Direct Notice</p>
                <p className="text-[11px] text-emerald-800">
                  Client: {selectedClientObj.fullName} ({selectedClientObj.whatsappNumber || selectedClientObj.phone})
                </p>
              </div>
            </div>
            <a
              href={generateWhatsAppLink(
                selectedClientObj.whatsappNumber || selectedClientObj.phone,
                `Hello ${selectedClientObj.fullName}! 👋 Reminder regarding: ${title || 'your upcoming project milestone'} scheduled for ${dueDate}${dueTime ? ` at ${dueTime}` : ''}.`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              Open WhatsApp
            </a>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            {reminderToEdit ? 'Save Changes' : 'Create Reminder'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
