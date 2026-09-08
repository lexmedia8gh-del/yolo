'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  BellRing,
  CheckSquare,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  Sparkles,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ListTodo,
  User,
  FolderKanban,
  Trash2,
  RefreshCw,
  Layers,
  CalendarDays,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ReminderCard } from '@/components/reminders/ReminderCard'
import { TaskCard } from '@/components/reminders/TaskCard'
import { ReminderModal } from '@/components/reminders/ReminderModal'
import { TaskModal } from '@/components/reminders/TaskModal'
import {
  COLLECTIONS,
  subscribeToCollection,
  getDocuments,
  updateDocument,
  deleteDocument,
} from '@/lib/firebase/firestore'
import type {
  SmartReminder,
  TaskItem,
  Client,
  Project,
  ReminderCategory,
  ReminderPriority,
} from '@/lib/types'
import toast from 'react-hot-toast'

type MainTab = 'all' | 'reminders' | 'tasks' | 'timeline'

export default function RemindersPage() {
  const [reminders, setReminders] = useState<SmartReminder[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<MainTab>('all')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedClientId, setSelectedClientId] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('active') // 'active' | 'completed' | 'all'

  // Modal States
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [reminderToEdit, setReminderToEdit] = useState<SmartReminder | null>(null)
  const [taskToEdit, setTaskToEdit] = useState<TaskItem | null>(null)

  // Delete confirmation
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'reminder' | 'task'
    id: string
    title: string
  } | null>(null)

  // Load Firestore data with real-time listeners
  useEffect(() => {
    setLoading(true)

    // Reminders subscription
    const unsubReminders = subscribeToCollection<SmartReminder>(
      COLLECTIONS.REMINDERS,
      [],
      (data) => {
        setReminders(data || [])
        setLoading(false)
      }
    )

    // Tasks subscription
    const unsubTasks = subscribeToCollection<TaskItem>(
      COLLECTIONS.TASKS,
      [],
      (data) => {
        setTasks(data || [])
        setLoading(false)
      }
    )

    // Initial fallbacks
    getDocuments<SmartReminder>(COLLECTIONS.REMINDERS).then((data) => {
      if (data) setReminders(data)
      setLoading(false)
    })
    getDocuments<TaskItem>(COLLECTIONS.TASKS).then((data) => {
      if (data) setTasks(data)
      setLoading(false)
    })
    getDocuments<Client>(COLLECTIONS.CLIENTS).then((data) => setClients(data || []))
    getDocuments<Project>(COLLECTIONS.PROJECTS).then((data) => setProjects(data || []))

    return () => {
      unsubReminders()
      unsubTasks()
    }
  }, [])

  // Stats Calculations
  const todayStr = new Date().toISOString().split('T')[0]

  const stats = useMemo(() => {
    const activeReminders = reminders.filter((r) => r.status !== 'completed')
    const activeTasks = tasks.filter((t) => t.status !== 'completed')

    const importantEvents = reminders.filter((r) => r.isImportantEvent && r.status !== 'completed')
    const fieldReminders = reminders.filter((r) => r.isFieldOriented && r.status !== 'completed')
    const overdueReminders = reminders.filter(
      (r) => r.status !== 'completed' && r.dueDate && r.dueDate < todayStr
    )
    const overdueTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.dueDate && t.dueDate < todayStr
    )
    const dueTodayCount = [
      ...reminders.filter((r) => r.status !== 'completed' && r.dueDate === todayStr),
      ...tasks.filter((t) => t.status !== 'completed' && t.dueDate === todayStr),
    ].length

    return {
      totalActiveReminders: activeReminders.length,
      totalActiveTasks: activeTasks.length,
      importantEventsCount: importantEvents.length,
      fieldRemindersCount: fieldReminders.length,
      overdueTotal: overdueReminders.length + overdueTasks.length,
      dueTodayTotal: dueTodayCount,
    }
  }, [reminders, tasks, todayStr])

  // Filtered Reminders
  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      // Status filter
      if (selectedStatus === 'active' && r.status === 'completed') return false
      if (selectedStatus === 'completed' && r.status !== 'completed') return false

      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'field' && !r.isFieldOriented && r.category !== 'field') return false
        if (selectedCategory === 'event' && !r.isImportantEvent && r.category !== 'event') return false
        if (selectedCategory !== 'field' && selectedCategory !== 'event' && r.category !== selectedCategory) {
          return false
        }
      }

      // Priority filter
      if (selectedPriority !== 'all' && r.priority !== selectedPriority) return false

      // Client filter
      if (selectedClientId !== 'all' && r.clientId !== selectedClientId) return false

      // Search
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchTitle = r.title.toLowerCase().includes(query)
        const matchNotes = r.notes?.toLowerCase().includes(query)
        const matchClient = r.clientName?.toLowerCase().includes(query)
        const matchProject = r.projectName?.toLowerCase().includes(query)
        const matchLocation = r.fieldLocation?.toLowerCase().includes(query)
        if (!matchTitle && !matchNotes && !matchClient && !matchProject && !matchLocation) {
          return false
        }
      }

      return true
    })
  }, [reminders, selectedStatus, selectedCategory, selectedPriority, selectedClientId, search])

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status filter
      if (selectedStatus === 'active' && t.status === 'completed') return false
      if (selectedStatus === 'completed' && t.status !== 'completed') return false

      // Priority filter
      if (selectedPriority !== 'all' && t.priority !== selectedPriority) return false

      // Client filter
      if (selectedClientId !== 'all' && t.clientId !== selectedClientId) return false

      // Search
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchTitle = t.title.toLowerCase().includes(query)
        const matchDesc = t.description?.toLowerCase().includes(query)
        const matchClient = t.clientName?.toLowerCase().includes(query)
        const matchProject = t.projectName?.toLowerCase().includes(query)
        const matchTags = t.tags?.some((tag) => tag.toLowerCase().includes(query))
        if (!matchTitle && !matchDesc && !matchClient && !matchProject && !matchTags) {
          return false
        }
      }

      return true
    })
  }, [tasks, selectedStatus, selectedPriority, selectedClientId, search])

  // Toggle Reminder completion
  const handleToggleReminder = async (reminder: SmartReminder) => {
    const newStatus = reminder.status === 'completed' ? 'pending' : 'completed'
    const updated = {
      ...reminder,
      status: newStatus as any,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }

    // Optimistic UI update
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? updated : r)))

    try {
      await updateDocument(COLLECTIONS.REMINDERS, reminder.id, {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      toast.success(newStatus === 'completed' ? 'Reminder marked as completed!' : 'Reminder reopened')
    } catch (err) {
      console.error('Error updating reminder:', err)
      toast.error('Failed to update reminder')
    }
  }

  // Toggle Task completion
  const handleToggleTask = async (task: TaskItem) => {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed'
    const updated = {
      ...task,
      status: newStatus as any,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }

    // Optimistic UI update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))

    try {
      await updateDocument(COLLECTIONS.TASKS, task.id, {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      toast.success(newStatus === 'completed' ? 'Task marked as completed!' : 'Task reopened')
    } catch (err) {
      console.error('Error updating task:', err)
      toast.error('Failed to update task')
    }
  }

  // Delete Action
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    const { type, id } = itemToDelete

    try {
      if (type === 'reminder') {
        setReminders((prev) => prev.filter((r) => r.id !== id))
        await deleteDocument(COLLECTIONS.REMINDERS, id)
        toast.success('Reminder deleted')
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        await deleteDocument(COLLECTIONS.TASKS, id)
        toast.success('Task deleted')
      }
    } catch (err) {
      console.error('Error deleting item:', err)
      toast.error('Failed to delete item')
    } finally {
      setItemToDelete(null)
    }
  }

  // Timeline Groups
  const timelineData = useMemo(() => {
    const allItems: { type: 'reminder' | 'task'; data: SmartReminder | TaskItem; date: string }[] = [
      ...filteredReminders.map((r) => ({ type: 'reminder' as const, data: r, date: r.dueDate || '9999-99-99' })),
      ...filteredTasks.map((t) => ({ type: 'task' as const, data: t, date: t.dueDate || '9999-99-99' })),
    ]

    allItems.sort((a, b) => a.date.localeCompare(b.date))

    const overdue: typeof allItems = []
    const today: typeof allItems = []
    const tomorrow: typeof allItems = []
    const thisWeek: typeof allItems = []
    const upcoming: typeof allItems = []

    const tomorrowDate = new Date()
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0]

    const nextWeekDate = new Date()
    nextWeekDate.setDate(nextWeekDate.getDate() + 7)
    const nextWeekStr = nextWeekDate.toISOString().split('T')[0]

    allItems.forEach((item) => {
      const isItemCompleted = item.data.status === 'completed'
      if (!isItemCompleted && item.date < todayStr) {
        overdue.push(item)
      } else if (item.date === todayStr) {
        today.push(item)
      } else if (item.date === tomorrowStr) {
        tomorrow.push(item)
      } else if (item.date <= nextWeekStr) {
        thisWeek.push(item)
      } else {
        upcoming.push(item)
      }
    })

    return { overdue, today, tomorrow, thisWeek, upcoming }
  }, [filteredReminders, filteredTasks, todayStr])

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Smart Reminders & Tasks"
        subtitle="Manage studio reminders, on-site field visits, client milestones, and task checklists in one command center."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTaskToEdit(null)
                setIsTaskModalOpen(true)
              }}
              icon={<CheckSquare size={14} className="text-indigo-600" />}
            >
              + New Task
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setReminderToEdit(null)
                setIsReminderModalOpen(true)
              }}
              icon={<BellRing size={14} />}
            >
              + New Smart Reminder
            </Button>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Active Reminders */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Active Reminders</span>
            <BellRing size={15} className="text-indigo-600" />
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.totalActiveReminders}</p>
        </div>

        {/* Important Events */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 p-4 rounded-2xl border border-purple-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-900 font-semibold">Important Events</span>
            <Sparkles size={15} className="text-purple-600" />
          </div>
          <p className="text-xl font-bold text-purple-950">{stats.importantEventsCount}</p>
        </div>

        {/* Field-Oriented */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 rounded-2xl border border-emerald-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-900 font-semibold">Field Shoots & Prep</span>
            <MapPin size={15} className="text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-emerald-950">{stats.fieldRemindersCount}</p>
        </div>

        {/* Active Tasks */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Pending Tasks</span>
            <CheckSquare size={15} className="text-indigo-600" />
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.totalActiveTasks}</p>
        </div>

        {/* Due Today */}
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-900 font-semibold">Due Today</span>
            <Clock size={15} className="text-amber-600" />
          </div>
          <p className="text-xl font-bold text-amber-950">{stats.dueTodayTotal}</p>
        </div>

        {/* Overdue */}
        <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-900 font-semibold">Overdue</span>
            <AlertTriangle size={15} className="text-rose-600" />
          </div>
          <p className="text-xl font-bold text-rose-950">{stats.overdueTotal}</p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex items-center gap-4 overflow-x-auto pb-px">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'all'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <Layers size={16} />
            All Items ({filteredReminders.length + filteredTasks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reminders')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'reminders'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <BellRing size={16} />
            Smart Reminders ({filteredReminders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <CheckSquare size={16} />
            Tasks & Checklists ({filteredTasks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`pb-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <CalendarDays size={16} />
            Timeline Schedule
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4 bg-white border-border shadow-2xs rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="lg:col-span-2">
            <Input
              placeholder="Search reminders, tasks, clients, location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={14} className="text-gray-400" />}
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="active">Active (Pending)</option>
              <option value="completed">Completed Only</option>
              <option value="all">All Statuses</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Categories</option>
              <option value="field">Field-Oriented Only</option>
              <option value="event">Important Events Only</option>
              <option value="payment">Payment & Invoicing</option>
              <option value="milestone">Project Milestone</option>
              <option value="client">Client Follow-up</option>
              <option value="general">General Studio</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Content Area */}
      {loading ? (
        <div className="py-20 text-center">
          <Spinner size="lg" className="mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Loading Smart Reminders & Tasks...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: ALL ITEMS */}
          {activeTab === 'all' && (
            <div className="space-y-6">
              {filteredReminders.length === 0 && filteredTasks.length === 0 ? (
                <EmptyState
                  onNewReminder={() => {
                    setReminderToEdit(null)
                    setIsReminderModalOpen(true)
                  }}
                  onNewTask={() => {
                    setTaskToEdit(null)
                    setIsTaskModalOpen(true)
                  }}
                />
              ) : (
                <div className="space-y-6">
                  {/* Reminders section */}
                  {filteredReminders.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                          <BellRing size={16} className="text-indigo-600" />
                          Smart Reminders ({filteredReminders.length})
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReminderToEdit(null)
                            setIsReminderModalOpen(true)
                          }}
                          icon={<Plus size={13} />}
                        >
                          Add Reminder
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredReminders.map((reminder) => (
                          <ReminderCard
                            key={reminder.id}
                            reminder={reminder}
                            onToggleComplete={handleToggleReminder}
                            onEdit={(r) => {
                              setReminderToEdit(r)
                              setIsReminderModalOpen(true)
                            }}
                            onDelete={(r) =>
                              setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks section */}
                  {filteredTasks.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                          <CheckSquare size={16} className="text-indigo-600" />
                          Tasks & Checklists ({filteredTasks.length})
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTaskToEdit(null)
                            setIsTaskModalOpen(true)
                          }}
                          icon={<Plus size={13} />}
                        >
                          Add Task
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onToggleComplete={handleToggleTask}
                            onEdit={(t) => {
                              setTaskToEdit(t)
                              setIsTaskModalOpen(true)
                            }}
                            onDelete={(t) =>
                              setItemToDelete({ type: 'task', id: t.id, title: t.title })
                            }
                            onChecklistUpdate={(updated) => {
                              setTasks((prev) =>
                                prev.map((item) => (item.id === updated.id ? updated : item))
                              )
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SMART REMINDERS ONLY */}
          {activeTab === 'reminders' && (
            <div className="space-y-4">
              {filteredReminders.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-3xl border border-gray-200 shadow-2xs space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <BellRing size={22} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">No Smart Reminders Found</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    {search || selectedCategory !== 'all'
                      ? 'No reminders match your active filter criteria.'
                      : 'Create reminders for on-site shoots, equipment checklists, client follow-ups, and milestone dates.'}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setReminderToEdit(null)
                      setIsReminderModalOpen(true)
                    }}
                    icon={<Plus size={14} />}
                  >
                    Create Smart Reminder
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      onToggleComplete={handleToggleReminder}
                      onEdit={(r) => {
                        setReminderToEdit(r)
                        setIsReminderModalOpen(true)
                      }}
                      onDelete={(r) =>
                        setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TASKS & CHECKLISTS ONLY */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {filteredTasks.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-3xl border border-gray-200 shadow-2xs space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <CheckSquare size={22} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">No Tasks Found</h3>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    {search || selectedPriority !== 'all'
                      ? 'No tasks match your active filter criteria.'
                      : 'Keep your creative projects on track with structured task checklists and subtasks.'}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setTaskToEdit(null)
                      setIsTaskModalOpen(true)
                    }}
                    icon={<Plus size={14} />}
                  >
                    Create Task
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggleComplete={handleToggleTask}
                      onEdit={(t) => {
                        setTaskToEdit(t)
                        setIsTaskModalOpen(true)
                      }}
                      onDelete={(t) =>
                        setItemToDelete({ type: 'task', id: t.id, title: t.title })
                      }
                      onChecklistUpdate={(updated) => {
                        setTasks((prev) =>
                          prev.map((item) => (item.id === updated.id ? updated : item))
                        )
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TIMELINE SCHEDULE */}
          {activeTab === 'timeline' && (
            <div className="space-y-6">
              {/* Overdue */}
              {timelineData.overdue.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-sm bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    <AlertTriangle size={16} />
                    <span>Past Due / Overdue ({timelineData.overdue.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {timelineData.overdue.map((item) =>
                      item.type === 'reminder' ? (
                        <ReminderCard
                          key={item.data.id}
                          reminder={item.data as SmartReminder}
                          onToggleComplete={handleToggleReminder}
                          onEdit={(r) => {
                            setReminderToEdit(r)
                            setIsReminderModalOpen(true)
                          }}
                          onDelete={(r) =>
                            setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                          }
                        />
                      ) : (
                        <TaskCard
                          key={item.data.id}
                          task={item.data as TaskItem}
                          onToggleComplete={handleToggleTask}
                          onEdit={(t) => {
                            setTaskToEdit(t)
                            setIsTaskModalOpen(true)
                          }}
                          onDelete={(t) =>
                            setItemToDelete({ type: 'task', id: t.id, title: t.title })
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Due Today */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <Clock size={16} className="text-amber-600" />
                  <span>Today ({timelineData.today.length})</span>
                </div>
                {timelineData.today.length === 0 ? (
                  <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded-xl">
                    No reminders or tasks scheduled for today.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {timelineData.today.map((item) =>
                      item.type === 'reminder' ? (
                        <ReminderCard
                          key={item.data.id}
                          reminder={item.data as SmartReminder}
                          onToggleComplete={handleToggleReminder}
                          onEdit={(r) => {
                            setReminderToEdit(r)
                            setIsReminderModalOpen(true)
                          }}
                          onDelete={(r) =>
                            setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                          }
                        />
                      ) : (
                        <TaskCard
                          key={item.data.id}
                          task={item.data as TaskItem}
                          onToggleComplete={handleToggleTask}
                          onEdit={(t) => {
                            setTaskToEdit(t)
                            setIsTaskModalOpen(true)
                          }}
                          onDelete={(t) =>
                            setItemToDelete({ type: 'task', id: t.id, title: t.title })
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Tomorrow */}
              {timelineData.tomorrow.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm bg-indigo-50 p-2.5 rounded-xl border border-indigo-200">
                    <Calendar size={16} className="text-indigo-600" />
                    <span>Tomorrow ({timelineData.tomorrow.length})</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {timelineData.tomorrow.map((item) =>
                      item.type === 'reminder' ? (
                        <ReminderCard
                          key={item.data.id}
                          reminder={item.data as SmartReminder}
                          onToggleComplete={handleToggleReminder}
                          onEdit={(r) => {
                            setReminderToEdit(r)
                            setIsReminderModalOpen(true)
                          }}
                          onDelete={(r) =>
                            setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                          }
                        />
                      ) : (
                        <TaskCard
                          key={item.data.id}
                          task={item.data as TaskItem}
                          onToggleComplete={handleToggleTask}
                          onEdit={(t) => {
                            setTaskToEdit(t)
                            setIsTaskModalOpen(true)
                          }}
                          onDelete={(t) =>
                            setItemToDelete({ type: 'task', id: t.id, title: t.title })
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}

              {/* This Week & Later */}
              {(timelineData.thisWeek.length > 0 || timelineData.upcoming.length > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-900 font-bold text-sm bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                    <CalendarDays size={16} className="text-gray-600" />
                    <span>
                      Upcoming Later ({timelineData.thisWeek.length + timelineData.upcoming.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[...timelineData.thisWeek, ...timelineData.upcoming].map((item) =>
                      item.type === 'reminder' ? (
                        <ReminderCard
                          key={item.data.id}
                          reminder={item.data as SmartReminder}
                          onToggleComplete={handleToggleReminder}
                          onEdit={(r) => {
                            setReminderToEdit(r)
                            setIsReminderModalOpen(true)
                          }}
                          onDelete={(r) =>
                            setItemToDelete({ type: 'reminder', id: r.id, title: r.title })
                          }
                        />
                      ) : (
                        <TaskCard
                          key={item.data.id}
                          task={item.data as TaskItem}
                          onToggleComplete={handleToggleTask}
                          onEdit={(t) => {
                            setTaskToEdit(t)
                            setIsTaskModalOpen(true)
                          }}
                          onDelete={(t) =>
                            setItemToDelete({ type: 'task', id: t.id, title: t.title })
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Reminder Modal */}
      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => {
          setIsReminderModalOpen(false)
          setReminderToEdit(null)
        }}
        reminderToEdit={reminderToEdit}
        onSaved={(saved) => {
          setReminders((prev) => {
            const exists = prev.some((r) => r.id === saved.id)
            return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]
          })
        }}
      />

      {/* Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false)
          setTaskToEdit(null)
        }}
        taskToEdit={taskToEdit}
        onSaved={(saved) => {
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === saved.id)
            return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev]
          })
        }}
      />

      {/* Delete Confirmation Dialog */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-gray-200 animate-scale-in">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Delete {itemToDelete.type}?</h3>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to delete <strong className="text-gray-800">&quot;{itemToDelete.title}&quot;</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  onNewReminder,
  onNewTask,
}: {
  onNewReminder: () => void
  onNewTask: () => void
}) {
  return (
    <div className="py-16 text-center bg-white rounded-3xl border border-gray-200 shadow-2xs space-y-4 max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100 shadow-2xs">
        <BellRing size={26} />
      </div>
      <div>
        <h3 className="font-bold text-gray-900 text-base">Smart Reminders & Tasks</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
          Never miss an on-site shoot, equipment prep, deposit follow-up, or project deadline.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewTask}
          icon={<CheckSquare size={14} className="text-indigo-600" />}
        >
          Create Task
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onNewReminder}
          icon={<BellRing size={14} />}
        >
          Create Smart Reminder
        </Button>
      </div>
    </div>
  )
}
