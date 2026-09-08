'use client'

import React, { useState, useEffect } from 'react'
import {
  CheckSquare,
  Calendar,
  Clock,
  User,
  FolderKanban,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Tag,
  MapPin,
  Sparkles,
  ListTodo,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import {
  COLLECTIONS,
  addDocument,
  updateDocument,
  getDocuments,
} from '@/lib/firebase/firestore'
import type {
  TaskItem,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskChecklistItem,
  Client,
  Project,
} from '@/lib/types'
import toast from 'react-hot-toast'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  taskToEdit?: TaskItem | null
  defaultStatus?: TaskStatus
  defaultClientId?: string
  defaultProjectId?: string
  onSaved?: (task: TaskItem) => void
}

const TASK_CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'creative', label: 'Creative & Editing' },
  { value: 'field_work', label: 'Field Production & Shoots' },
  { value: 'client_followup', label: 'Client Communication' },
  { value: 'finance', label: 'Billing & Invoicing' },
  { value: 'delivery', label: 'Delivery & Review' },
  { value: 'admin', label: 'Studio Administration' },
]

const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function TaskModal({
  isOpen,
  onClose,
  taskToEdit,
  defaultStatus = 'todo',
  defaultClientId = '',
  defaultProjectId = '',
  onSaved,
}: TaskModalProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [category, setCategory] = useState<TaskCategory>('creative')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [isFieldOriented, setIsFieldOriented] = useState(false)
  const [fieldLocation, setFieldLocation] = useState('')
  const [isImportantEvent, setIsImportantEvent] = useState(false)
  const [clientId, setClientId] = useState(defaultClientId)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [estimatedHours, setEstimatedHours] = useState<number | ''>('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // Checklist items
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([])
  const [newChecklistText, setNewChecklistText] = useState('')

  useEffect(() => {
    if (isOpen) {
      getDocuments<Client>(COLLECTIONS.CLIENTS).then((data) => setClients(data || []))
      getDocuments<Project>(COLLECTIONS.PROJECTS).then((data) => setProjects(data || []))
    }
  }, [isOpen])

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title || '')
      setDescription(taskToEdit.description || '')
      setStatus(taskToEdit.status || 'todo')
      setPriority(taskToEdit.priority || 'medium')
      setCategory(taskToEdit.category || 'creative')
      setDueDate(taskToEdit.dueDate || '')
      setDueTime(taskToEdit.dueTime || '')
      setIsFieldOriented(Boolean(taskToEdit.isFieldOriented))
      setFieldLocation(taskToEdit.fieldLocation || '')
      setIsImportantEvent(Boolean(taskToEdit.isImportantEvent))
      setClientId(taskToEdit.clientId || '')
      setProjectId(taskToEdit.projectId || '')
      setEstimatedHours(taskToEdit.estimatedHours ?? '')
      setTags(taskToEdit.tags || [])
      setChecklist(taskToEdit.checklist || [])
    } else {
      const today = new Date().toISOString().split('T')[0]
      setTitle('')
      setDescription('')
      setStatus(defaultStatus)
      setPriority('medium')
      setCategory('creative')
      setDueDate(today)
      setDueTime('17:00')
      setIsFieldOriented(false)
      setFieldLocation('')
      setIsImportantEvent(false)
      setClientId(defaultClientId)
      setProjectId(defaultProjectId)
      setEstimatedHours('')
      setTags([])
      setChecklist([])
    }
    setNewChecklistText('')
    setErrors({})
  }, [taskToEdit, isOpen, defaultStatus, defaultClientId, defaultProjectId])

  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return
    const newItem: TaskChecklistItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: newChecklistText.trim(),
      completed: false,
    }
    setChecklist([...checklist, newItem])
    setNewChecklistText('')
  }

  const handleToggleChecklistItem = (id: string) => {
    setChecklist(
      checklist.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    )
  }

  const handleRemoveChecklistItem = (id: string) => {
    setChecklist(checklist.filter((item) => item.id !== id))
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const t = tagInput.trim().replace(/^#/, '')
      if (t && !tags.includes(t)) {
        setTags([...tags, t])
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Task title is required'
    if (!dueDate) errs.dueDate = 'Due date is required'
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

      const payload: Omit<TaskItem, 'id'> = {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        category,
        dueDate,
        dueTime: dueTime || undefined,
        isFieldOriented,
        fieldLocation: isFieldOriented ? fieldLocation.trim() || undefined : undefined,
        isImportantEvent,
        clientId: clientId || undefined,
        clientName: selectedClient?.fullName || undefined,
        projectId: projectId || undefined,
        projectName: selectedProject?.name || undefined,
        checklist,
        tags: tags.length > 0 ? tags : undefined,
        estimatedHours: typeof estimatedHours === 'number' ? estimatedHours : undefined,
        completedAt: status === 'completed' ? new Date().toISOString() : null,
        createdAt: taskToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      let savedDoc: TaskItem

      if (taskToEdit?.id) {
        await updateDocument(COLLECTIONS.TASKS, taskToEdit.id, payload)
        savedDoc = { id: taskToEdit.id, ...payload } as TaskItem
        toast.success('Task updated successfully!')
      } else {
        const newId = await addDocument(COLLECTIONS.TASKS, payload)
        savedDoc = { id: newId, ...payload } as TaskItem
        toast.success('Task created successfully!')
      }

      if (onSaved) onSaved(savedDoc)
      onClose()
    } catch (err: any) {
      console.error('Error saving task:', err)
      toast.error(err?.message || 'Failed to save task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={taskToEdit ? 'Edit Task & Checklist' : 'Create New Task'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <Input
          label="Task Title"
          placeholder="e.g. Color Grade Wedding Highlight Reel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
          leftIcon={<CheckSquare size={15} className="text-gray-400" />}
        />

        {/* Status, Category & Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Priority *</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date & Time & Est Hours */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
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
              label="Due Time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              leftIcon={<Clock size={15} className="text-gray-400" />}
            />
          </div>

          <div>
            <Input
              type="number"
              label="Est. Hours"
              placeholder="e.g. 4.5"
              min="0"
              step="0.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value ? parseFloat(e.target.value) : '')}
            />
          </div>
        </div>

        {/* Association */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Linked Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- No Client Linked --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">Linked Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- No Project Linked --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Interactive Sub-task Checklist */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <ListTodo size={14} className="text-indigo-600" />
              Checklist & Subtasks ({checklist.filter((c) => c.completed).length}/{checklist.length})
            </label>
            {checklist.length > 0 && (
              <span className="text-[11px] font-semibold text-indigo-700">
                {Math.round((checklist.filter((c) => c.completed).length / checklist.length) * 100)}% done
              </span>
            )}
          </div>

          {/* List items */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {checklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-gray-200/70"
              >
                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => handleToggleChecklistItem(item.id)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <span
                    className={`text-xs truncate ${
                      item.completed ? 'line-through text-gray-400' : 'text-gray-800'
                    }`}
                  >
                    {item.text}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveChecklistItem(item.id)}
                  className="text-gray-400 hover:text-rose-600 p-1 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Add item input */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Add a checklist item (e.g. Ingest RAW footage, Color grade, Export 4K)..."
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddChecklistItem()
                }
              }}
              className="flex-1 px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddChecklistItem}
              icon={<Plus size={14} />}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Description */}
        <Textarea
          label="Description / Scope / Notes"
          placeholder="Details on deliverables, specifications, file paths, or client feedback..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Tags */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">Tags (Press Enter to add)</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-rose-600 text-indigo-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Input
            placeholder="Type tag name and press Enter..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            leftIcon={<Tag size={14} className="text-gray-400" />}
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            {taskToEdit ? 'Save Task' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
