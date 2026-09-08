'use client'

import React, { useState } from 'react'
import {
  BellRing,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  User,
  FolderKanban,
  CheckCircle2,
  Circle,
  MoreVertical,
  Edit2,
  Trash2,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { SmartReminder, ReminderPriority, ReminderCategory } from '@/lib/types'
import { generateWhatsAppLink, formatDate } from '@/lib/utils'

interface ReminderCardProps {
  reminder: SmartReminder
  onToggleComplete: (reminder: SmartReminder) => void
  onEdit: (reminder: SmartReminder) => void
  onDelete: (reminder: SmartReminder) => void
}

const CATEGORY_COLORS: Record<ReminderCategory, { label: string; class: string }> = {
  field: { label: 'Field-Oriented', class: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  event: { label: 'Important Event', class: 'bg-purple-50 text-purple-800 border-purple-200' },
  payment: { label: 'Payment Follow-up', class: 'bg-amber-50 text-amber-800 border-amber-200' },
  milestone: { label: 'Project Milestone', class: 'bg-blue-50 text-blue-800 border-blue-200' },
  client: { label: 'Client Outreach', class: 'bg-teal-50 text-teal-800 border-teal-200' },
  general: { label: 'General Task', class: 'bg-gray-50 text-gray-700 border-gray-200' },
}

const PRIORITY_BADGES: Record<ReminderPriority, { label: string; class: string }> = {
  urgent: { label: 'Urgent', class: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold' },
  high: { label: 'High', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  medium: { label: 'Medium', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  low: { label: 'Low', class: 'bg-gray-50 text-gray-600 border-gray-200' },
}

export function ReminderCard({
  reminder,
  onToggleComplete,
  onEdit,
  onDelete,
}: ReminderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isCompleted = reminder.status === 'completed'

  // Determine date status
  const todayStr = new Date().toISOString().split('T')[0]
  const isOverdue = !isCompleted && reminder.dueDate && reminder.dueDate < todayStr
  const isToday = !isCompleted && reminder.dueDate === todayStr

  const categoryConfig = CATEGORY_COLORS[reminder.category] || CATEGORY_COLORS.general
  const priorityConfig = PRIORITY_BADGES[reminder.priority] || PRIORITY_BADGES.medium

  return (
    <div
      className={`rounded-2xl border transition-all p-4 ${
        isCompleted
          ? 'bg-gray-50/70 border-gray-200 opacity-75'
          : reminder.isImportantEvent
          ? 'bg-gradient-to-r from-purple-50/30 via-white to-white border-purple-200/90 shadow-2xs hover:border-purple-300'
          : reminder.isFieldOriented
          ? 'bg-gradient-to-r from-emerald-50/20 via-white to-white border-emerald-200/90 shadow-2xs hover:border-emerald-300'
          : 'bg-white border-gray-200/90 shadow-2xs hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggleComplete(reminder)}
          className="mt-0.5 text-gray-400 hover:text-emerald-600 transition-colors shrink-0"
          title={isCompleted ? 'Mark as Pending' : 'Mark as Completed'}
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
            {reminder.isImportantEvent && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
                <Sparkles size={11} className="text-purple-600" />
                Important Event
              </span>
            )}

            {reminder.isFieldOriented && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                <MapPin size={11} className="text-emerald-600" />
                Field-Oriented
              </span>
            )}

            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryConfig.class}`}
            >
              {categoryConfig.label}
            </span>

            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border ${priorityConfig.class}`}
            >
              {priorityConfig.label}
            </span>

            {/* Date Tag */}
            {isOverdue && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                <AlertTriangle size={11} className="text-rose-600" />
                Overdue ({reminder.dueDate})
              </span>
            )}

            {isToday && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                <Clock size={11} className="text-amber-600" />
                Due Today {reminder.dueTime ? `at ${reminder.dueTime}` : ''}
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
              {reminder.title}
            </h4>
          </div>

          {/* Details / Metadata */}
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap pt-0.5">
            {/* Due Date & Time */}
            <div className="flex items-center gap-1.5 font-medium text-gray-700">
              <Calendar size={13} className="text-indigo-600" />
              <span>{reminder.dueDate}</span>
              {reminder.dueTime && (
                <>
                  <span>•</span>
                  <Clock size={13} className="text-gray-400" />
                  <span>{reminder.dueTime}</span>
                </>
              )}
            </div>

            {/* Field Location */}
            {reminder.fieldLocation && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  reminder.fieldLocation
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-emerald-700 hover:underline bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"
              >
                <MapPin size={12} />
                <span className="truncate max-w-[200px]">{reminder.fieldLocation}</span>
                <ExternalLink size={10} />
              </a>
            )}

            {/* Client & Project chips */}
            {reminder.clientName && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                <User size={11} />
                <span>{reminder.clientName}</span>
              </div>
            )}

            {reminder.projectName && (
              <div className="flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                <FolderKanban size={11} />
                <span>{reminder.projectName}</span>
              </div>
            )}
          </div>

          {/* Notes Preview / Expand */}
          {reminder.notes && (
            <div className="pt-1">
              <p
                className={`text-xs text-gray-600 bg-gray-50/80 p-2 rounded-xl border border-gray-200/60 ${
                  expanded ? '' : 'line-clamp-2'
                }`}
              >
                {reminder.notes}
              </p>
              {reminder.notes.length > 120 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 mt-1"
                >
                  {expanded ? (
                    <>
                      Show less <ChevronUp size={12} />
                    </>
                  ) : (
                    <>
                      Read more notes <ChevronDown size={12} />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions Dropdown / Buttons */}
        <div className="flex items-center gap-1 shrink-0 self-start">
          {/* WhatsApp Direct Link */}
          {(reminder.whatsappPhone || reminder.clientName) && (
            <a
              href={generateWhatsAppLink(
                reminder.whatsappPhone || '',
                `Hello ${reminder.clientName || 'there'}! 👋 Just a quick reminder regarding: *${reminder.title}* scheduled for *${reminder.dueDate}*${
                  reminder.dueTime ? ` at ${reminder.dueTime}` : ''
                }.${reminder.fieldLocation ? `\n📍 Location: ${reminder.fieldLocation}` : ''}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              title="Send WhatsApp Reminder"
            >
              <MessageSquare size={15} />
            </a>
          )}

          <button
            type="button"
            onClick={() => onEdit(reminder)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Edit Reminder"
          >
            <Edit2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(reminder)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete Reminder"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
