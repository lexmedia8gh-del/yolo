'use client'

import React, { useState } from 'react'
import {
  FileText,
  DollarSign,
  Users,
  FolderKanban,
  Wrench,
  Download,
  Printer,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type {
  FinancialSummaryKPIs,
  MonthlyRevenueData,
  ServicePerformanceData,
  ClientFinancialData,
  DateFilterState,
} from '@/lib/utils/analyticsCalculations'
import type { Project, Invoice, Payment } from '@/lib/types'

interface ReportsViewProps {
  kpis: FinancialSummaryKPIs
  monthlyRevenue: MonthlyRevenueData[]
  servicePerformance: ServicePerformanceData[]
  clientList: ClientFinancialData[]
  projects: Project[]
  invoices: Invoice[]
  payments: Payment[]
  filter: DateFilterState
}

type ReportType = 'financial' | 'clients' | 'projects' | 'services'

export function ReportsView({
  kpis,
  monthlyRevenue,
  servicePerformance,
  clientList,
  projects,
  invoices,
  payments,
  filter,
}: ReportsViewProps) {
  const [activeReport, setActiveReport] = useState<ReportType>('financial')

  const handlePrint = () => {
    window.print()
  }

  const exportCurrentReportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,'
    if (activeReport === 'financial') {
      csvContent += 'Month,Projects,Invoiced (GHS),Paid (GHS),Outstanding (GHS)\n'
      monthlyRevenue.forEach((m) => {
        csvContent += `"${m.month}",${m.projectCount},${m.invoiced.toFixed(2)},${m.paid.toFixed(2)},${m.outstanding.toFixed(2)}\n`
      })
    } else if (activeReport === 'clients') {
      csvContent += 'Client Name,Company,Email,Phone,Projects,Total Billed (GHS),Total Paid (GHS),Outstanding (GHS)\n'
      clientList.forEach((c) => {
        csvContent += `"${c.name}","${c.company || ''}","${c.email || ''}","${c.phone || ''}",${c.projectCount},${c.totalBilled.toFixed(2)},${c.totalPaid.toFixed(2)},${c.outstanding.toFixed(2)}\n`
      })
    } else if (activeReport === 'projects') {
      csvContent += 'Project Name,Client,Service,Status,Payment Status,Price (GHS),Amount Paid (GHS)\n'
      projects.forEach((p) => {
        csvContent += `"${p.name}","${p.clientName || ''}","${p.serviceName || ''}","${p.status}","${p.paymentStatus}",${(p.price || 0).toFixed(2)},${(p.amountPaid || 0).toFixed(2)}\n`
      })
    } else if (activeReport === 'services') {
      csvContent += 'Service Category,Projects Count,Total Revenue (GHS),Total Paid (GHS),Outstanding (GHS),Avg Value (GHS)\n'
      servicePerformance.forEach((s) => {
        csvContent += `"${s.serviceName}",${s.projectCount},${s.totalRevenue.toFixed(2)},${s.totalPaid.toFixed(2)},${s.outstanding.toFixed(2)},${s.avgProjectValue.toFixed(2)}\n`
      })
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `LexMedia_${activeReport}_report.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Report Switcher & Actions */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'financial', label: 'Financial Report', icon: DollarSign },
            { id: 'clients', label: 'Client Report', icon: Users },
            { id: 'projects', label: 'Project Report', icon: FolderKanban },
            { id: 'services', label: 'Service Report', icon: Wrench },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeReport === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReport(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Export / Print Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCurrentReportCSV} icon={<Download size={14} />}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} icon={<Printer size={14} />}>
            Print
          </Button>
        </div>
      </div>

      {/* Report Canvas */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-xs space-y-6 print:border-none print:shadow-none">
        {/* Report Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 capitalize">
              LexMedia {activeReport} Executive Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Period: {filter.period.replace('_', ' ').toUpperCase()}{' '}
              {filter.year !== 'all' ? `(${filter.year})` : ''} · Currency: GHS (GH₵)
            </p>
          </div>
          <div className="text-xs text-gray-400">
            Generated: {new Date().toLocaleDateString('en-GB')}
          </div>
        </div>

        {/* ── 1. Financial Report ───────────────────────────── */}
        {activeReport === 'financial' && (
          <div className="space-y-6">
            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <span className="text-[11px] text-gray-500 block">Total Invoiced</span>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(kpis.totalRevenue)}
                </span>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
                <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block">
                  Total Collected
                </span>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(kpis.paidRevenue)}
                </span>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg">
                <span className="text-[11px] text-rose-700 dark:text-rose-300 block">Outstanding</span>
                <span className="text-base font-bold text-rose-700 dark:text-rose-300">
                  {formatCurrency(kpis.outstandingRevenue)}
                </span>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                <span className="text-[11px] text-blue-700 dark:text-blue-300 block">Avg Invoice</span>
                <span className="text-base font-bold text-blue-700 dark:text-blue-300">
                  {formatCurrency(kpis.avgInvoiceValue)}
                </span>
              </div>
            </div>

            {/* Monthly Financial Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 font-semibold text-gray-600">
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3 text-center">Projects</th>
                    <th className="py-2.5 px-3 text-right">Invoiced (GH₵)</th>
                    <th className="py-2.5 px-3 text-right">Paid (GH₵)</th>
                    <th className="py-2.5 px-3 text-right">Outstanding (GH₵)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {monthlyRevenue.map((m) => (
                    <tr key={m.month}>
                      <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">
                        {m.month}
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-600">{m.projectCount}</td>
                      <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(m.invoiced)}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600">
                        {formatCurrency(m.paid)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-rose-600">
                        {formatCurrency(m.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 2. Client Report ──────────────────────────────── */}
        {activeReport === 'clients' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 font-semibold text-gray-600">
                  <th className="py-2.5 px-3">Client Name</th>
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3 text-center">Projects</th>
                  <th className="py-2.5 px-3 text-right">Total Billed</th>
                  <th className="py-2.5 px-3 text-right">Total Paid</th>
                  <th className="py-2.5 px-3 text-right">Outstanding</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {clientList.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                    <td className="py-2.5 px-3 text-gray-600">{c.company || '—'}</td>
                    <td className="py-2.5 px-3 text-center">{c.projectCount}</td>
                    <td className="py-2.5 px-3 text-right">{formatCurrency(c.totalBilled)}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                      {formatCurrency(c.totalPaid)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-600 font-medium">
                      {formatCurrency(c.outstanding)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-[11px] text-gray-500">
                        {c.isReturning ? 'Returning' : 'Standard'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 3. Project Report ─────────────────────────────── */}
        {activeReport === 'projects' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 font-semibold text-gray-600">
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Payment</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                    <td className="py-2.5 px-3 text-gray-600">{p.clientName || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-600">{p.serviceName || '—'}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="default">{p.status}</Badge>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant={p.paymentStatus === 'Paid' ? 'success' : 'warning'}>
                        {p.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(p.price)}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                      {formatCurrency(p.amountPaid || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 4. Service Report ─────────────────────────────── */}
        {activeReport === 'services' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 font-semibold text-gray-600">
                  <th className="py-2.5 px-3">Service</th>
                  <th className="py-2.5 px-3 text-center">Projects</th>
                  <th className="py-2.5 px-3 text-right">Total Revenue</th>
                  <th className="py-2.5 px-3 text-right">Total Paid</th>
                  <th className="py-2.5 px-3 text-right">Avg Project Value</th>
                  <th className="py-2.5 px-3 text-center">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {servicePerformance.map((s) => (
                  <tr key={s.serviceName}>
                    <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-gray-100">
                      {s.serviceName}
                    </td>
                    <td className="py-2.5 px-3 text-center font-medium">{s.projectCount}</td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(s.totalRevenue)}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                      {formatCurrency(s.totalPaid)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {formatCurrency(s.avgProjectValue)}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-gray-600">
                      {s.completedCount} / {s.projectCount} delivered
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
