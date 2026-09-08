import React from 'react'
import { cn, formatCurrency, formatRelativeTime } from '@/lib/utils'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import type { ActivityLog } from '@/lib/types'
import {
  UserPlus,
  FolderPlus,
  FileText,
  CreditCard,
  Link2,
  Eye,
  Upload,
  RefreshCw,
} from 'lucide-react'

const eventIcons: Record<string, React.ComponentType<any>> = {
  client_created: UserPlus,
  project_created: FolderPlus,
  invoice_created: FileText,
  invoice_marked_paid: CreditCard,
  payment_completed: CreditCard,
  client_link_generated: Link2,
  client_link_opened: Eye,
  file_uploaded: Upload,
  project_status_changed: RefreshCw,
}

const eventColors: Record<string, string> = {
  client_created: 'bg-success-50 text-success-600',
  project_created: 'bg-accent-50 text-accent-600',
  invoice_created: 'bg-warning-50 text-warning-600',
  invoice_marked_paid: 'bg-success-50 text-success-600',
  payment_completed: 'bg-success-50 text-success-600',
  client_link_generated: 'bg-purple-50 text-purple-600',
  client_link_opened: 'bg-gray-100 text-gray-600',
  file_uploaded: 'bg-teal-50 text-teal-600',
}

interface RecentActivityProps {
  activities?: ActivityLog[]
  loading?: boolean
}

export function RecentActivity({ activities = [], loading = false }: RecentActivityProps) {
  return (
    <Card padding="none">
      <div className="p-6 border-b border-border">
        <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
        <p className="text-sm text-muted mt-0.5">Latest events across the system</p>
      </div>

      <div className="divide-y divide-border">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <div className="w-8 h-8 rounded-xl bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">No activity yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Activities will appear here as you use the system.
            </p>
          </div>
        ) : (
          activities.slice(0, 8).map((activity) => {
            const Icon = eventIcons[activity.event] ?? RefreshCw
            const colorClass = eventColors[activity.event] ?? 'bg-gray-100 text-gray-600'

            return (
              <div key={activity.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                <div className={cn('p-2 rounded-xl shrink-0', colorClass)}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{activity.description}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatRelativeTime(activity.createdAt)}
                    {activity.performedByName && ` · ${activity.performedByName}`}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
