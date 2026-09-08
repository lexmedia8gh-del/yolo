import React from 'react'
import {
  Users,
  FolderKanban,
  Wrench,
  Package,
  FileText,
  CreditCard,
  Link2,
  BarChart3,
  Clock,
} from 'lucide-react'
import { PageHeader } from './PageHeader'
import { Card } from '@/components/ui/Card'

const iconMap: Record<string, React.ComponentType<any>> = {
  Users,
  FolderKanban,
  Wrench,
  Package,
  FileText,
  CreditCard,
  Link2,
  BarChart3,
}

interface ComingSoonPageProps {
  title: string
  description: string
  phase: string
  icon: string
}

export function ComingSoonPage({ title, description, phase, icon }: ComingSoonPageProps) {
  const Icon = iconMap[icon] ?? Clock

  return (
    <div className="animate-fade-in">
      <PageHeader title={title} subtitle={description} />

      <Card className="mt-6">
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-50 flex items-center justify-center mb-5 shadow-sm">
            <Icon size={28} className="text-accent-600" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-50 text-accent-700 text-xs font-semibold mb-4">
            <Clock size={12} />
            Coming in {phase}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-sm text-muted max-w-md leading-relaxed">{description}</p>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-border max-w-sm w-full text-left">
            <p className="text-xs font-semibold text-gray-700 mb-2">Phase Progress</p>
            <div className="space-y-2 text-xs text-muted">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success-500" />
                Phase 1 — Foundation (Current)
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                Phase 2 — Client, Service & Project Management
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                Phase 3 — Invoices & Payments
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
                Phase 4 — Shareable Client Pages
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
