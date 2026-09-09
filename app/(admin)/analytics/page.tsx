'use client'

import React, { useEffect, useState, useMemo } from 'react'
import {
  TrendingUp,
  BarChart3,
  Users,
  Wrench,
  FileText,
  DollarSign,
  AlertCircle,
  FolderKanban,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  COLLECTIONS,
  subscribeToCollection,
  getDocuments,
} from '@/lib/firebase/firestore'
import type { Client, Project, Invoice, Payment, Service } from '@/lib/types'
import {
  calculateAnalytics,
  type DateFilterState,
} from '@/lib/utils/analyticsCalculations'
import { exportAnnualReportExcel } from '@/lib/utils/exportAnalyticsExcel'

import { AnalyticsHeader } from '@/components/analytics/AnalyticsHeader'
import { SummaryKpiCards } from '@/components/analytics/SummaryKpiCards'
import { RevenueAnalyticsView } from '@/components/analytics/RevenueAnalyticsView'
import { ServicePerformanceView } from '@/components/analytics/ServicePerformanceView'
import { ClientAnalysisView } from '@/components/analytics/ClientAnalysisView'
import { ReportsView } from '@/components/analytics/ReportsView'
import { ClientFinancialDetailModal } from '@/components/analytics/ClientFinancialDetailModal'
import { Spinner } from '@/components/ui/Spinner'

type AnalyticsMainTab = 'revenue' | 'services' | 'clients' | 'reports'

export default function DataAnalysisPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Navigation Sub-tab
  const [activeTab, setActiveTab] = useState<AnalyticsMainTab>('revenue')

  // Date Filter State
  const [filter, setFilter] = useState<DateFilterState>({
    period: 'this_year',
    year: new Date().getFullYear(),
  })

  // Selected Client for Modal
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // ── 1. Real-time Firebase Subscriptions ─────────────────────
  useEffect(() => {
    let unsubscribed = false
    setLoading(true)

    const unsubClients = subscribeToCollection<Client>(COLLECTIONS.CLIENTS, [], (data) => {
      if (!unsubscribed) setClients(data)
    })
    const unsubProjects = subscribeToCollection<Project>(COLLECTIONS.PROJECTS, [], (data) => {
      if (!unsubscribed) setProjects(data)
    })
    const unsubInvoices = subscribeToCollection<Invoice>(COLLECTIONS.INVOICES, [], (data) => {
      if (!unsubscribed) setInvoices(data)
    })
    const unsubPayments = subscribeToCollection<Payment>(COLLECTIONS.PAYMENTS, [], (data) => {
      if (!unsubscribed) {
        const sorted = [...data].sort((a, b) => {
          const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
          const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
          return bDate - aDate
        })
        setPayments(sorted)
      }
    })
    const unsubServices = subscribeToCollection<Service>(COLLECTIONS.SERVICES, [], (data) => {
      if (!unsubscribed) setServices(data)
    })

    // Initial Fetch Fallback
    Promise.all([
      getDocuments<Client>(COLLECTIONS.CLIENTS),
      getDocuments<Project>(COLLECTIONS.PROJECTS),
      getDocuments<Invoice>(COLLECTIONS.INVOICES),
      getDocuments<Payment>(COLLECTIONS.PAYMENTS),
      getDocuments<Service>(COLLECTIONS.SERVICES),
    ])
      .then(([c, pr, inv, pmt, srv]) => {
        if (!unsubscribed) {
          if (c && c.length) setClients(c)
          if (pr && pr.length) setProjects(pr)
          if (inv && inv.length) setInvoices(inv)
          if (pmt && pmt.length) {
            setPayments(
              [...pmt].sort((a, b) => {
                const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
                const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
                return bDate - aDate
              })
            )
          }
          if (srv && srv.length) setServices(srv)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.warn('Data Analysis fetch warning:', err)
        if (!unsubscribed) setLoading(false)
      })

    return () => {
      unsubscribed = true
      unsubClients()
      unsubProjects()
      unsubInvoices()
      unsubPayments()
      unsubServices()
    }
  }, [])

  // ── 2. Calculate Dynamic Analytics ──────────────────────────
  const analytics = useMemo(() => {
    return calculateAnalytics({
      clients,
      projects,
      invoices,
      payments,
      services,
      filter,
    })
  }, [clients, projects, invoices, payments, services, filter])

  // ── 3. Handle Annual Excel Export ───────────────────────────
  const handleExportAnnualReport = () => {
    const targetYear = filter.year === 'all' ? new Date().getFullYear() : Number(filter.year)
    setExporting(true)
    toast.loading(`Compiling Annual Report for ${targetYear}...`, { id: 'excel-export' })

    setTimeout(() => {
      try {
        const success = exportAnnualReportExcel({
          year: targetYear,
          clients,
          projects,
          invoices,
          payments,
        })
        if (success) {
          toast.success(`Annual Report (${targetYear}) downloaded successfully!`, {
            id: 'excel-export',
          })
        } else {
          toast.error('Failed to generate Excel report. Please try again.', { id: 'excel-export' })
        }
      } catch (err: any) {
        console.error('Export error:', err)
        toast.error('Error generating spreadsheet.', { id: 'excel-export' })
      } finally {
        setExporting(false)
      }
    }, 400)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Analytics Header & Global Filters */}
      <AnalyticsHeader
        filter={filter}
        onFilterChange={setFilter}
        onExportExcel={handleExportAnnualReport}
        exporting={exporting}
      />

      {/* 10 KPI Metric Cards */}
      <SummaryKpiCards kpis={analytics.kpis} loading={loading} />

      {/* Section Sub-Navigation Tabs */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1.5 shadow-xs flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {[
          {
            id: 'revenue',
            label: 'Revenue & Monthly Analytics',
            icon: TrendingUp,
          },
          {
            id: 'services',
            label: 'Service Performance',
            icon: Wrench,
          },
          {
            id: 'clients',
            label: 'Client Intelligence & Ledger',
            icon: Users,
          },
          {
            id: 'reports',
            label: 'Executive Reports',
            icon: FileText,
          },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[170px] py-2.5 px-3.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                isActive
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Dynamic Tab Content */}
      {loading ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-16 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-gray-500 font-medium animate-pulse">
            Syncing real-time records from Firestore...
          </p>
        </div>
      ) : activeTab === 'revenue' ? (
        <RevenueAnalyticsView
          monthlyRevenue={analytics.monthlyRevenue}
          servicePerformance={analytics.servicePerformance}
          paymentMethods={analytics.paymentMethods}
          topClients={analytics.clientList}
          onSelectClient={(id) => setSelectedClientId(id)}
        />
      ) : activeTab === 'services' ? (
        <ServicePerformanceView servicePerformance={analytics.servicePerformance} />
      ) : activeTab === 'clients' ? (
        <ClientAnalysisView
          clientList={analytics.clientList}
          onSelectClient={(id) => setSelectedClientId(id)}
        />
      ) : (
        <ReportsView
          kpis={analytics.kpis}
          monthlyRevenue={analytics.monthlyRevenue}
          servicePerformance={analytics.servicePerformance}
          clientList={analytics.clientList}
          projects={analytics.filteredProjects}
          invoices={analytics.filteredInvoices}
          payments={analytics.filteredPayments}
          filter={filter}
        />
      )}

      {/* Client Financial Detail Modal */}
      {selectedClientId && (
        <ClientFinancialDetailModal
          clientId={selectedClientId}
          onClose={() => setSelectedClientId(null)}
        />
      )}
    </div>
  )
}
