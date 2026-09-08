'use client'

import React, { useState } from 'react'
import {
  CheckSquare,
  Square,
  CheckCircle2,
  Circle,
  Calendar,
  Clock,
  User,
  FolderKanban,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
  ListTodo,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { TaskItem, TaskPriority, TaskStatus, TaskCategory } from '@/lib/types'
import { updateDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import toast from 'react-hot-toast'

interface TaskCardProps {
  task: TaskItem
  onToggleComplete: (task: TaskItem) => void
  onEdit: (task: TaskItem) => void
  onDelete: (task: TaskItem) => void
  onChecklistUpdate?: (task: TaskItem) => void
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; class: string }> = {
  todo: { label: 'To Do', class: 'bg-gray-100 text-gray-700 border-gray-200' },
  in_progress: { label: 'In Progress', class: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold' },
  completed: { label: 'Completed', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' },
  blocked: { label: 'Blocked', class: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; class: string }> = {
  urgent: { label: 'Urgent', class: 'bg-rose-50 text-rose-700 border-rose-200' },
  high: { label: 'High', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  medium: { label: 'Medium', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  low: { label: 'Low', class: 'bg-gray-50 text-gray-600 border-gray-200' },
}

export function TaskCard({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onChecklistUpdate,
}: TaskCardProps) {
  const [showChecklist, setShowChecklist] = useState(false)
  const isCompleted = task.status === 'completed'

  const todayStr = new Date().toISOString().split('T')[0]
  const isOverdue = !isCompleted && task.dueDate && task.dueDate < todayStr
  const isToday = !isCompleted && task.dueDate === todayStr

  const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo
  const priorityInfo = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium

  const checklistItems = task.checklist || []
  const completedCount = checklistItems.filter((c) => c.completed).length
  const totalCount = checklistItems.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleToggleSubItem = async (itemId: string) => {
    const updatedChecklist = checklistItems.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    )

    const updatedTask = {
      ...task,
      checklist: updatedChecklist,
      updatedAt: new Date().toISOString(),
    }

    try {
      await updateDocument(COLLECTIONS.TASKS, task.id, {
        checklist: updatedChecklist,
        updatedAt: new Date().toISOString(),
      })
      if (onChecklistUpdate) onChecklistUpdate(updatedTask)
    } catch (err) {
      console.error('Error toggling checklist item:', err)
      toast.error('Failed to update subtask')
    }
  }

  const handleCycleStatus = async () => {
    const nextStatusMap: Record<TaskStatus, TaskStatus> = {
      todo: 'in_progress',
      in_progress: 'completed',
      completed: 'todo',
      blocked: 'todo',
    }
    const nextStatus = nextStatusMap[task.status]
    const updatedTask = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }

    try {
      await updateDocument(COLLECTIONS.TASKS, task.id, {
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      if (onChecklistUpdate) onChecklistUpdate(updatedTask)
      toast.success(`Task status changed to ${STATUS_CONFIG[nextStatus].label}`)
    } catch (err) {
      console.error('Error updating status:', err)
      toast.error('Failed to update status')
    }
  }

  return (
    <div
      className={`rounded-2xl border transition-all p-4 ${
        isCompleted
          ? 'bg-gray-50/70 border-gray-200 opacity-75'
          : task.status === 'in_progress'
          ? 'bg-indigo-50/20 border-indigo-200/80 shadow-2xs hover:border-indigo-300'
          : 'bg-white border-gray-200/90 shadow-2xs hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggleComplete(task)}
          className="mt-0.5 text-gray-400 hover:text-emerald-600 transition-colors shrink-0"
          title={isCompleted ? 'Mark as Incomplete' : 'Mark as Completed'}
        >
          {isCompleted ? (
            <CheckCircle2 size={20} className="text-emerald-600 fill-emerald-100" />
          ) : (
            <Circle size={20} className="hover:text-emerald-500" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Top Row Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Status Button (clickable to cycle) */}
            <button
              type="button"
              onClick={handleCycleStatus}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-transform active:scale-95 ${statusInfo.class}`}
              title="Click to cycle status"
            >
              {statusInfo.label}
            </button>

            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${priorityInfo.class}`}>
              {priorityInfo.label}
            </span>

            {isOverdue && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                <AlertTriangle size={11} className="text-rose-600" />
                Overdue
              </span>
            )}

            {isToday && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                <Clock size={11} className="text-amber-600" />
                Due Today
              </span>
            )}
          </div>

          {/* Title */}
          <div>
            <h4
              className={`text-sm font-semibold text-gray-900 ${
                isCompleted ? 'line-through text-gray-500' : ''
              }`}
            >
              {task.title}
            </h4>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* Checklist progress bar & toggle */}
          {totalCount > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-gray-600 font-medium">
                <button
                  type="button"
                  onClick={() => setShowChecklist(!showChecklist)}
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                >
                  <ListTodo size={13} />
                  <span>
                    Subtasks: {completedCount}/{totalCount} ({progressPercent}%)
                  </span>
                  {showChecklist ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Sub-item checklist toggle view */}
              {showChecklist && (
                <div className="space-y-1 p-2 bg-gray-50 rounded-xl border border-gray-200/70 mt-1">
                  {checklistItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer hover:bg-white p-1 rounded-lg transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => handleToggleSubItem(item.id)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                      />
                      <span className={item.completed ? 'line-through text-gray-400' : ''}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metadata chips (Date, Client, Project, Tags) */}
          <div className="flex items-center gap-2.5 text-xs text-gray-500 flex-wrap pt-0.5">
            <div className="flex items-center gap-1 text-gray-700 font-medium">
              <Calendar size={13} className="text-indigo-600" />
              <span>{task.dueDate}</span>
              {task.dueTime && (
                <>
                  <span>•</span>
                  <span>{task.dueTime}</span>
                </>
              )}
            </div>

            {task.clientName && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                <User size={11} />
                <span>{task.clientName}</span>
              </div>
            )}

            {task.projectName && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                <FolderKanban size={11} />
                <span>{task.projectName}</span>
              </div>
            )}

            {task.tags && task.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {task.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 self-start">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Edit Task"
          >
            <Edit2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(task)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete Task"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
