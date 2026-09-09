'use client'

import React, { useState } from 'react'
import {
  Calendar,
  FileSpreadsheet,
  Download,
  Filter,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { AnalyticsPeriod, DateFilterState } from '@/lib/utils/analyticsCalculations'

interface AnalyticsHeaderProps {
  filter: DateFilterState
  onFilterChange: (newFilter: DateFilterState) => void
  onExportExcel: () => void
  exporting: boolean
  isLiveSyncing?: boolean
}

const PERIOD_OPTIONS: { label: string; value: AnalyticsPeriod }[] = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Quarter', value: 'this_quarter' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Previous Year', value: 'previous_year' },
  { label: 'Custom Range', value: 'custom' },
  { label: 'All Time', value: 'all' },
]

const YEAR_OPTIONS: (number | 'all')[] = [2026, 2025, 2024, 2023, 'all']

export function AnalyticsHeader({
  filter,
  onFilterChange,
  onExportExcel,
  exporting,
  isLiveSyncing = true,
}: AnalyticsHeaderProps) {
  const [showCustomRange, setShowCustomRange] = useState(filter.period === 'custom')

  const handlePeriodSelect = (period: AnalyticsPeriod) => {
    if (period === 'custom') {
      setShowCustomRange(true)
      onFilterChange({
        ...filter,
        period,
        startDate: filter.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
        endDate: filter.endDate || new Date().toISOString().slice(0, 10),
      })
    } else {
      setShowCustomRange(false)
      onFilterChange({ ...filter, period })
    }
  }

  const handleYearSelect = (year: number | 'all') => {
    onFilterChange({ ...filter, year })
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title & Live Sync Status */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Data Analysis & Business Intelligence
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Firestore Sync</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Real-time analytics, revenue breakdowns, service performance, and financial reporting.
          </p>
        </div>

        {/* Actions: Export Annual Report */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={onExportExcel}
            loading={exporting}
            icon={<FileSpreadsheet size={16} className="text-emerald-300" />}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          >
            {exporting ? 'Generating Report...' : `Export Annual Report (.xlsx)`}
          </Button>
        </div>
      </div>

      {/* Filter Controls Row */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Preset Periods Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = filter.period === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePeriodSelect(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Calendar size={14} /> Year:
            </span>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
              {YEAR_OPTIONS.map((y) => (
                <button
                  key={String(y)}
                  type="button"
                  onClick={() => handleYearSelect(y)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    filter.year === y
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                  }`}
                >
                  {y === 'all' ? 'All' : y}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom Date Range Picker (Conditional) */}
      {showCustomRange && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Custom Date Range:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filter.startDate || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  startDate: e.target.value,
                  period: 'custom',
                })
              }
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-gray-900"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={filter.endDate || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  endDate: e.target.value,
                  period: 'custom',
                })
              }
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </div>
      )}
    </div>
  )
}
