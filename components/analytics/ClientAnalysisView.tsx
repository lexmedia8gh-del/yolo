'use client'

import React, { useState } from 'react'
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  ExternalLink,
  DollarSign,
  Receipt,
  Eye,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { ClientFinancialData } from '@/lib/utils/analyticsCalculations'

interface ClientAnalysisViewProps {
  clientList: ClientFinancialData[]
  onSelectClient: (clientId: string) => void
}

export function ClientAnalysisView({ clientList, onSelectClient }: ClientAnalysisViewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'outstanding' | 'paid' | 'returning'>('all')
  const [sortBy, setSortBy] = useState<'paid' | 'billed' | 'projects' | 'outstanding'>('paid')

  // Filter clients
  const filteredClients = clientList
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(searchTerm))

      if (!matchesSearch) return false

      if (filterType === 'outstanding') return c.outstanding > 0
      if (filterType === 'paid') return c.outstanding === 0 && c.totalPaid > 0
      if (filterType === 'returning') return c.isReturning

      return true
    })
    .sort((a, b) => {
      if (sortBy === 'paid') return b.totalPaid - a.totalPaid
      if (sortBy === 'billed') return b.totalBilled - a.totalBilled
      if (sortBy === 'projects') return b.projectCount - a.projectCount
      if (sortBy === 'outstanding') return b.outstanding - a.outstanding
      return 0
    })

  const totalClients = clientList.length
  const returningClients = clientList.filter((c) => c.isReturning).length
  const clientsWithBalance = clientList.filter((c) => c.outstanding > 0).length
  const totalCollectedAllClients = clientList.reduce((acc, c) => acc + c.totalPaid, 0)
  const avgSpentPerClient = totalClients > 0 ? totalCollectedAllClients / totalClients : 0

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
            Client Base
          </span>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {totalClients} Registered
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Active directory records</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-900/50 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 block mb-1">
            Repeat / Returning Rate
          </span>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {returningClients} Clients (
            {totalClients > 0 ? `${Math.round((returningClients / totalClients) * 100)}%` : '0%'}
            )
          </div>
          <p className="text-xs text-gray-500 mt-0.5">&gt;1 booking with LexMedia</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
            Mean Spend Per Client
          </span>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(avgSpentPerClient)}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Average customer lifetime value</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-rose-100 dark:border-rose-900/50 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block mb-1">
            Pending Client Balances
          </span>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {clientsWithBalance} Accounts
          </div>
          <p className="text-xs text-gray-500 mt-0.5">With unpaid outstanding balance</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search client by name, company, email, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-gray-900"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Clients' },
            { id: 'outstanding', label: 'With Balance' },
            { id: 'paid', label: 'Fully Paid' },
            { id: 'returning', label: 'Returning' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                filterType === tab.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client Financial Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-semibold">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Projects</th>
                <th className="py-3 px-4 text-right">Total Billed</th>
                <th className="py-3 px-4 text-right">Total Paid</th>
                <th className="py-3 px-4 text-right">Outstanding</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-gray-400">
                    No clients matched the filter.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {client.name}
                      </div>
                      {client.company && (
                        <div className="text-[11px] text-gray-500">{client.company}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400">
                      <div>{client.phone || '—'}</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[160px]">
                        {client.email || ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-gray-700 dark:text-gray-300">
                      {client.projectCount}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(client.totalBilled)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(client.totalPaid)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                      {client.outstanding > 0 ? formatCurrency(client.outstanding) : 'GH₵0.00'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          client.isReturning
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {client.isReturning ? 'Returning' : 'Standard'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => onSelectClient(client.id)}
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <Eye size={14} /> Ledger
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
