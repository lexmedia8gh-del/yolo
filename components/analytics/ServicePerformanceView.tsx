'use client'

import React from 'react'
import {
  Wrench,
  Award,
  TrendingUp,
  FolderKanban,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ServicePerformanceData } from '@/lib/utils/analyticsCalculations'

interface ServicePerformanceViewProps {
  servicePerformance: ServicePerformanceData[]
}

export function ServicePerformanceView({ servicePerformance }: ServicePerformanceViewProps) {
  if (!servicePerformance || servicePerformance.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
        <Wrench size={32} className="mx-auto text-gray-400 mb-2" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No Service Data Found</h3>
        <p className="text-xs text-gray-500 mt-1">
          Projects and package bookings will automatically appear here once recorded.
        </p>
      </div>
    )
  }

  const mostRequested = [...servicePerformance].sort((a, b) => b.projectCount - a.projectCount)[0]
  const highestRevenue = [...servicePerformance].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]
  const totalServiceProjects = servicePerformance.reduce((acc, s) => acc + s.projectCount, 0)
  const totalServiceRevenue = servicePerformance.reduce((acc, s) => acc + s.totalRevenue, 0)

  return (
    <div className="space-y-6">
      {/* Top Highlights Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Most Requested Service */}
        <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
              <Award size={14} /> Most Requested
            </span>
          </div>
          <div className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
            {mostRequested?.serviceName || '—'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {mostRequested?.projectCount || 0} projects (
            {totalServiceProjects > 0
              ? `${Math.round(((mostRequested?.projectCount || 0) / totalServiceProjects) * 100)}%`
              : '0%'}
            )
          </div>
        </div>

        {/* Highest Revenue Service */}
        <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={14} /> Top Grossing
            </span>
          </div>
          <div className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
            {highestRevenue?.serviceName || '—'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatCurrency(highestRevenue?.totalRevenue || 0)} generated
          </div>
        </div>

        {/* Total Services Active */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Active Offerings
            </span>
            <FolderKanban size={15} className="text-gray-400" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {servicePerformance.length} Services
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Across {totalServiceProjects} total bookings
          </div>
        </div>

        {/* Average Value Across Services */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Avg Offering Yield
            </span>
            <Sparkles size={15} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(totalServiceProjects > 0 ? totalServiceRevenue / totalServiceProjects : 0)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Mean project invoice amount
          </div>
        </div>
      </div>

      {/* Detailed Services Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
              <BarChart2 size={16} className="text-indigo-600" />
              Service Performance & Yield Analysis
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Breakdown of project volume, revenue, paid balances, and average project value
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-semibold">
                <th className="py-3 px-4">Service Category</th>
                <th className="py-3 px-4 text-center">Projects</th>
                <th className="py-3 px-4 text-right">Total Revenue (GH₵)</th>
                <th className="py-3 px-4 text-right">Paid (GH₵)</th>
                <th className="py-3 px-4 text-right">Outstanding (GH₵)</th>
                <th className="py-3 px-4 text-right">Avg Value (GH₵)</th>
                <th className="py-3 px-4 text-center">Paid vs Unpaid</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {servicePerformance.map((s) => {
                const paidRate = s.projectCount > 0 ? Math.round((s.paidCount / s.projectCount) * 100) : 0
                return (
                  <tr
                    key={s.serviceName}
                    className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-gray-100">
                      {s.serviceName}
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-gray-700 dark:text-gray-300">
                      {s.projectCount}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(s.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(s.totalPaid)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
                      {formatCurrency(s.outstanding)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-700 dark:text-gray-300">
                      {formatCurrency(s.avgProjectValue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="text-emerald-600 font-semibold">{s.paidCount} paid</span> ·{' '}
                        <span className="text-amber-600 font-medium">{s.unpaidCount} unpaid</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          s.activeCount > 0
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}
                      >
                        {s.activeCount > 0 ? `${s.activeCount} in progress` : `${s.completedCount} delivered`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
