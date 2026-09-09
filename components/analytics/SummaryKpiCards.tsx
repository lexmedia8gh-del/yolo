'use client'

import React from 'react'
import {
  Users,
  FolderKanban,
  Receipt,
  CreditCard,
  AlertCircle,
  Clock,
  CheckCircle2,
  Activity,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { FinancialSummaryKPIs } from '@/lib/utils/analyticsCalculations'

interface SummaryKpiCardsProps {
  kpis: FinancialSummaryKPIs
  loading?: boolean
}

export function SummaryKpiCards({ kpis, loading = false }: SummaryKpiCardsProps) {
  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(kpis.totalRevenue),
      subtitle: `${kpis.totalProjects} total bookings`,
      icon: TrendingUp,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/40',
      border: 'hover:border-indigo-300 dark:hover:border-indigo-800',
    },
    {
      title: 'Paid Revenue',
      value: formatCurrency(kpis.paidRevenue),
      subtitle: 'Settled & confirmed',
      icon: CreditCard,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    {
      title: 'Outstanding Revenue',
      value: formatCurrency(kpis.outstandingRevenue),
      subtitle: 'Unpaid client balances',
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40',
      border: 'hover:border-rose-300 dark:hover:border-rose-800',
    },
    {
      title: 'Average Project Value',
      value: formatCurrency(kpis.avgProjectValue),
      subtitle: 'Per booked project',
      icon: Receipt,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'hover:border-blue-300 dark:hover:border-blue-800',
    },
    {
      title: 'Pending Payments',
      value: kpis.pendingPaymentsCount.toString(),
      subtitle: 'Invoices awaiting action',
      icon: Clock,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'hover:border-amber-300 dark:hover:border-amber-800',
    },
    {
      title: 'Total Clients',
      value: kpis.totalClients.toString(),
      subtitle: `${kpis.newClients} new · ${kpis.returningClients} returning`,
      icon: Users,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-950/40',
      border: 'hover:border-purple-300 dark:hover:border-purple-800',
    },
    {
      title: 'Total Projects',
      value: kpis.totalProjects.toString(),
      subtitle: 'All client requests',
      icon: FolderKanban,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'bg-cyan-50 dark:bg-cyan-950/40',
      border: 'hover:border-cyan-300 dark:hover:border-cyan-800',
    },
    {
      title: 'Active Projects',
      value: kpis.activeProjects.toString(),
      subtitle: 'In progress / review',
      icon: Activity,
      iconColor: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-50 dark:bg-sky-950/40',
      border: 'hover:border-sky-300 dark:hover:border-sky-800',
    },
    {
      title: 'Completed Projects',
      value: kpis.completedProjects.toString(),
      subtitle: 'Delivered & finalized',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    },
    {
      title: 'Cancelled Projects',
      value: kpis.cancelledProjects.toString(),
      subtitle: 'Discontinued / void',
      icon: XCircle,
      iconColor: 'text-gray-500 dark:text-gray-400',
      iconBg: 'bg-gray-100 dark:bg-gray-800',
      border: 'hover:border-gray-300 dark:hover:border-gray-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon
        return (
          <div
            key={idx}
            className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-all duration-200 ${card.border}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                {card.title}
              </span>
              <div className={`w-7 h-7 rounded-lg ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0`}>
                <Icon size={15} />
              </div>
            </div>

            {loading ? (
              <div className="space-y-1.5 animate-pulse py-1">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-md w-20"></div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-md w-28"></div>
              </div>
            ) : (
              <div>
                <div className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                  {card.value}
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 font-normal mt-0.5 truncate">
                  {card.subtitle}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
