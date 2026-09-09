'use client'

import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import {
  TrendingUp,
  Receipt,
  CreditCard,
  DollarSign,
  Smartphone,
  Building2,
  Banknote,
  ArrowUpRight,
  PieChart as PieIcon,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type {
  MonthlyRevenueData,
  ServicePerformanceData,
  PaymentMethodData,
  ClientFinancialData,
} from '@/lib/utils/analyticsCalculations'

interface RevenueAnalyticsViewProps {
  monthlyRevenue: MonthlyRevenueData[]
  servicePerformance: ServicePerformanceData[]
  paymentMethods: PaymentMethodData[]
  topClients: ClientFinancialData[]
  onSelectClient?: (clientId: string) => void
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs border border-gray-700">
        <p className="font-semibold mb-1 text-gray-200">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
            <span style={{ color: entry.color }} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-mono font-medium">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function RevenueAnalyticsView({
  monthlyRevenue,
  servicePerformance,
  paymentMethods,
  topClients,
  onSelectClient,
}: RevenueAnalyticsViewProps) {
  // Format chart data
  const chartData = monthlyRevenue.map((m) => ({
    name: m.month.slice(0, 3),
    fullName: m.month,
    Invoiced: m.invoiced,
    Paid: m.paid,
    Outstanding: m.outstanding,
    projects: m.projectCount,
  }))

  const totalInvoicedSum = monthlyRevenue.reduce((acc, m) => acc + m.invoiced, 0)
  const totalPaidSum = monthlyRevenue.reduce((acc, m) => acc + m.paid, 0)
  const totalOutstandingSum = monthlyRevenue.reduce((acc, m) => acc + m.outstanding, 0)
  const overallCollectionRate =
    totalInvoicedSum > 0 ? Math.min(100, Math.round((totalPaidSum / totalInvoicedSum) * 100)) : 0

  const getMethodIcon = (method: string) => {
    const lower = method.toLowerCase()
    if (lower.includes('momo') || lower.includes('mobile')) return Smartphone
    if (lower.includes('bank')) return Building2
    if (lower.includes('cash')) return Banknote
    return CreditCard
  }

  return (
    <div className="space-y-6">
      {/* 1. Monthly Revenue Chart */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />
              Monthly Revenue Performance
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Comparison of invoiced revenue vs collected payments (Jan–Dec)
            </p>
          </div>

          {/* Quick Mini Badges */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              Collection Rate: {overallCollectionRate}%
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
                tickFormatter={(val) => `GH₵${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="Invoiced" fill="#6366f1" radius={[4, 4, 0, 0]} name="Invoiced (GH₵)" maxBarSize={32} />
              <Bar dataKey="Paid" fill="#10b981" radius={[4, 4, 0, 0]} name="Paid (GH₵)" maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Monthly Revenue Detailed Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Monthly Breakdown</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Month-by-month financial breakdown with collection progress
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-semibold">
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4 text-center">Projects</th>
                <th className="py-3 px-4 text-right">Invoiced (GH₵)</th>
                <th className="py-3 px-4 text-right">Paid (GH₵)</th>
                <th className="py-3 px-4 text-right">Outstanding (GH₵)</th>
                <th className="py-3 px-4 text-center">Collection Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {monthlyRevenue.map((m) => {
                const rate = m.invoiced > 0 ? Math.min(100, Math.round((m.paid / m.invoiced) * 100)) : 0
                return (
                  <tr
                    key={m.month}
                    className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                      {m.month}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">
                      {m.projectCount}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(m.invoiced)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(m.paid)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-rose-600 dark:text-rose-400">
                      {formatCurrency(m.outstanding)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              rate >= 100 ? 'bg-emerald-500' : rate >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                          {rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-800/80 font-bold text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700">
                <td className="py-3.5 px-4">Total Period</td>
                <td className="py-3.5 px-4 text-center">
                  {monthlyRevenue.reduce((acc, m) => acc + m.projectCount, 0)}
                </td>
                <td className="py-3.5 px-4 text-right">{formatCurrency(totalInvoicedSum)}</td>
                <td className="py-3.5 px-4 text-right text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totalPaidSum)}
                </td>
                <td className="py-3.5 px-4 text-right text-rose-600 dark:text-rose-400">
                  {formatCurrency(totalOutstandingSum)}
                </td>
                <td className="py-3.5 px-4 text-center text-xs font-bold text-emerald-600">
                  {overallCollectionRate}% Collected
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 3. Bottom Two-Column: Payment Methods & Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Distribution */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                <CreditCard size={16} className="text-indigo-600" />
                Revenue by Payment Method
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Breakdown of transactions by payment channel
              </p>
            </div>
          </div>

          {paymentMethods.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">No payment records found</div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((pm) => {
                const Icon = getMethodIcon(pm.method)
                return (
                  <div
                    key={pm.method}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Icon size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {pm.method}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {pm.count} transaction{pm.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(pm.totalAmount)}
                      </div>
                      <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        {pm.percentage}% of total
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Clients Leaderboard */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                <Receipt size={16} className="text-emerald-600" />
                Top Clients by Revenue
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Most valuable client accounts by paid volume
              </p>
            </div>
          </div>

          {topClients.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">No client records found</div>
          ) : (
            <div className="space-y-2.5">
              {topClients.slice(0, 5).map((client, idx) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient?.(client.id)}
                  className="p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 rounded-lg border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[140px] sm:max-w-[200px]">
                        {client.name}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {client.projectCount} project{client.projectCount === 1 ? '' : 's'}
                        {client.company ? ` · ${client.company}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(client.totalPaid)}
                    </div>
                    {client.outstanding > 0 ? (
                      <div className="text-[10px] text-rose-500 font-medium">
                        {formatCurrency(client.outstanding)} due
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-600 font-medium">Fully Paid</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
