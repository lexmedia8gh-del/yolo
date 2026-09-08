'use client'

import React from 'react'
import Link from 'next/link'
import { UserPlus, FolderPlus, FileText, Link2, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface QuickAction {
  label: string
  href: string
  icon: React.ComponentType<any>
  color: string
  bg: string
  description: string
}

const actions: QuickAction[] = [
  {
    label: 'New Client',
    href: '/clients?action=new',
    icon: UserPlus,
    color: 'text-success-600',
    bg: 'bg-success-50',
    description: 'Add a new client to the system',
  },
  {
    label: 'New Project',
    href: '/projects?action=new',
    icon: FolderPlus,
    color: 'text-accent-600',
    bg: 'bg-accent-50',
    description: 'Create and track a new project',
  },
  {
    label: 'Create Invoice',
    href: '/invoices?action=new',
    icon: FileText,
    color: 'text-warning-600',
    bg: 'bg-warning-50',
    description: 'Issue a new invoice to a client',
  },
  {
    label: 'Generate Link',
    href: '/links?action=new',
    icon: Link2,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    description: 'Create a shareable client payment link',
  },
]

export function QuickActions() {
  return (
    <Card padding="none">
      <div className="p-4 sm:p-5 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
        <p className="text-xs text-gray-500 mt-0.5">Common tasks at your fingertips</p>
      </div>
      <div className="p-4 grid grid-cols-2 gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-start gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 transition-all duration-150 group"
            >
              <div className={`p-2 rounded-md ${action.bg}`}>
                <Icon size={16} className={action.color} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {action.label}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  {action.description}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
