'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  FolderKanban,
  FileText,
  CreditCard,
  Clock,
  ExternalLink,
  Phone,
  Mail,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Plus,
  MessageSquare,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard, StatsGrid } from '@/components/dashboard/StatCard'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/hooks/useAuth'
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils'
import {
  COLLECTIONS,
  getDocuments,
  subscribeToCollection,
} from '@/lib/firebase/firestore'
import type { Client, Project, Invoice, Payment } from '@/lib/types'

export function Dashboard() {
  const { lexUser } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [activityLogs, setActivityLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

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

    // Initial fetch fallback
    Promise.all([
      getDocuments<Client>(COLLECTIONS.CLIENTS),
      getDocuments<Project>(COLLECTIONS.PROJECTS),
      getDocuments<Invoice>(COLLECTIONS.INVOICES),
      getDocuments<Payment>(COLLECTIONS.PAYMENTS),
      getDocuments<any>(COLLECTIONS.ACTIVITY_LOGS),
    ])
      .then(([c, pr, inv, pmt, acts]) => {
        if (!unsubscribed) {
          if (c && c.length) setClients(c)
          if (pr && pr.length) setProjects(pr)
          if (inv && inv.length) setInvoices(inv)
          if (pmt && pmt.length) {
            setPayments([...pmt].sort((a, b) => {
              const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
              const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
              return bDate - aDate
            }))
          }
          if (acts && acts.length) {
            setActivityLogs([...acts].sort((a, b) => {
              const aDate = a.createdAt ? new Date(a.createdAt as any).getTime() : 0
              const bDate = b.createdAt ? new Date(b.createdAt as any).getTime() : 0
              return bDate - aDate
            }).slice(0, 10))
          }
          setLoading(false)
        }
      })
      .catch((err) => {
        console.warn('Dashboard fetch warning:', err)
        if (!unsubscribed) setLoading(false)
      })

    return () => {
      unsubscribed = true
      unsubClients()
      unsubProjects()
      unsubInvoices()
      unsubPayments()
    }
  }, [])

  // Derived calculations
  const totalClients = (clients || []).length
  const activeProjects = (projects || []).filter(
    (p) => p && !['Completed', 'Cancelled'].includes(p.status)
  ).length
  const totalInvoiced = (invoices || []).reduce((sum, inv) => sum + (inv?.total || 0), 0)
  const totalPaid = (payments || [])
    .filter((p) => p && p.status === 'success')
    .reduce((sum, p) => sum + (p?.amount || 0), 0)
  const outstandingBalance = Math.max(0, totalInvoiced - totalPaid)
  const pendingPayments = (invoices || []).filter(
    (inv) => inv && inv.status === 'Pending'
  ).length
  const partiallyPaid = (invoices || []).filter((inv) => inv && inv.status === 'Partially Paid').length
  const fullyPaid = (invoices || []).filter((inv) => inv && inv.status === 'Paid').length

  // Recent subsets
  const recentClients = [...(clients || [])]
    .sort((a, b) => {
      const aDate = a?.createdAt ? new Date(a.createdAt as any).getTime() : 0
      const bDate = b?.createdAt ? new Date(b.createdAt as any).getTime() : 0
      return bDate - aDate
    })
    .slice(0, 5)

  const recentProjects = [...(projects || [])]
    .sort((a, b) => {
      const aDate = a?.createdAt ? new Date(a.createdAt as any).getTime() : 0
      const bDate = b?.createdAt ? new Date(b.createdAt as any).getTime() : 0
      return bDate - aDate
    })
    .slice(0, 5)

  const recentPayments = (payments || []).slice(0, 5)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title={`${greeting()}, ${lexUser?.name?.split(' ')[0] ?? 'Admin'} 👋`}
        subtitle="Here's a live overview of your business activity and performance."
        action={
          <Link href="/clients">
            <Button variant="primary" icon={<Plus size={16} />}>
              Add Client
            </Button>
          </Link>
        }
      />

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Clients"
          value={loading ? '–' : totalClients.toString()}
          icon={Users}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-50"
          loading={loading}
          subtitle="Registered"
        />
        <StatCard
          title="Active Projects"
          value={loading ? '–' : activeProjects.toString()}
          icon={FolderKanban}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          loading={loading}
          subtitle="In progress"
        />
        <StatCard
          title="Pending"
          value={loading ? '–' : pendingPayments.toString()}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          loading={loading}
          subtitle="Awaiting payment"
        />
        <StatCard
          title="Partial Paid"
          value={loading ? '–' : partiallyPaid.toString()}
          icon={CreditCard}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          loading={loading}
          subtitle="Deposit paid"
        />
        <StatCard
          title="Fully Paid"
          value={loading ? '–' : fullyPaid.toString()}
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          loading={loading}
          subtitle="Completed payments"
        />
        <StatCard
          title="Outstanding"
          value={loading ? '–' : formatCurrency(outstandingBalance)}
          icon={AlertCircle}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
          loading={loading}
          subtitle="Unpaid balance"
        />
      </div>

      {/* Main 2-column layout: Recent Tables & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Tables (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Projects */}
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Recent Projects</h3>
                <p className="text-xs text-gray-500 mt-0.5">Latest client projects & package bookings</p>
              </div>
              <Link
                href="/projects"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                View all ({projects.length}) <ArrowRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No projects created yet. Start by selecting a client and creating a project.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4">Project</th>
                      <th className="py-3 px-4">Service / Package</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentProjects.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/clients/${p.clientId}`}
                            className="font-semibold text-gray-900 hover:text-indigo-600"
                          >
                            {p.clientName}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            href={`/projects/${p.id}`}
                            className="text-gray-700 hover:text-indigo-600 truncate max-w-[160px] block font-medium"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs text-gray-800 font-medium">{p.serviceName}</div>
                          {p.packageTitle && (
                            <div className="text-[11px] text-gray-500">{p.packageTitle}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${getStatusColor(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Clients */}
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Recent Clients</h3>
                <p className="text-xs text-gray-500 mt-0.5">Newly onboarded clients</p>
              </div>
              <Link
                href="/clients"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                View all ({clients.length}) <ArrowRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : recentClients.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No clients added yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Client Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Date Created</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentClients.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900">{c.fullName}</div>
                          {c.company && (
                            <div className="text-xs text-gray-500">{c.company}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 space-y-0.5 text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <Mail size={12} className="text-gray-400" />
                            <span className="truncate max-w-[140px]">{c.email}</span>
                          </div>
                          {c.phone && (
                            <div className="flex items-center gap-1">
                              <Phone size={12} className="text-gray-400" />
                              <span>{c.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {formatDate(c.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={c.status === 'active' ? 'success' : 'muted'} size="sm">
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/clients/${c.id}`}
                            className="text-xs font-medium text-indigo-600 hover:underline inline-flex items-center gap-1"
                          >
                            Profile <ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Recent Payments</h3>
                <p className="text-xs text-gray-500 mt-0.5">Paystack transaction receipts</p>
              </div>
              <Link
                href="/payments"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                View all ({payments.length}) <ArrowRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : recentPayments.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">
                No payment transactions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentPayments.map((pmt) => (
                      <tr key={pmt.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          {pmt.clientName || 'Client'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {formatCurrency(pmt.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${getStatusColor(pmt.status)}`}>
                            {pmt.status === 'success' ? 'Successful' : pmt.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {formatDate(pmt.paidAt)}
                        </td>
                        <td className="py-3 px-4">
                          <code className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {pmt.paystackReference?.slice(0, 16)}…
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Actions & Welcome Banner */}
        <div className="space-y-5">
          <QuickActions />

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Activity size={15} className="text-indigo-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Recent Activity</h3>
            </div>
            {activityLogs.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">No recent activity yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {activityLogs.map((log: any) => {
                  const icon =
                    log.event === 'payment_completed' ? <CheckCircle2 size={13} className="text-emerald-500" /> :
                    log.event === 'delivery_file_downloaded' ? <CheckCircle2 size={13} className="text-emerald-500" /> :
                    log.event === 'delivery_opened' ? <ExternalLink size={13} className="text-indigo-500" /> :
                    log.event === 'delivery_created' || log.event === 'delivery_released' ? <FolderKanban size={13} className="text-purple-500" /> :
                    log.event === 'whatsapp_message_sent' ? <MessageSquare size={13} className="text-emerald-500" /> :
                    log.event === 'whatsapp_message_failed' ? <MessageSquare size={13} className="text-rose-500" /> :
                    log.event === 'client_created' ? <Users size={13} className="text-indigo-500" /> :
                    log.event === 'invoice_created' ? <FileText size={13} className="text-purple-500" /> :
                    log.event === 'client_link_generated' ? <ExternalLink size={13} className="text-blue-500" /> :
                    <Activity size={13} className="text-gray-400" />
                  return (
                    <div key={log.id} className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                      <div className="w-6 h-6 rounded-md bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 leading-snug">{log.description}</p>
                        {log.clientName && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{log.clientName}</p>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 shrink-0 mt-0.5">{formatDate(log.createdAt)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Workflow Guide Card */}
          <div className="bg-white rounded-xl border border-gray-200/80 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Automated Workflow</h3>
              <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">Steps</span>
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-semibold text-gray-700 text-[11px] shrink-0">1</span>
                <span>Add or select a client in <strong className="text-gray-900 font-medium">Clients</strong></span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-semibold text-gray-700 text-[11px] shrink-0">2</span>
                <span>Click <strong className="text-gray-900 font-medium">Create Project / Select Service</strong></span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-semibold text-gray-700 text-[11px] shrink-0">3</span>
                <span>Select service &amp; package, review deposit</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-semibold text-gray-700 text-[11px] shrink-0">4</span>
                <span>Project + Invoice + Paystack link auto-created</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center font-semibold text-gray-700 text-[11px] shrink-0">5</span>
                <span>Send payment link via <strong className="text-emerald-700 font-medium">WhatsApp</strong></span>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <Link
                href="/clients"
                className="inline-flex items-center justify-center w-full py-2 px-3 rounded-lg bg-gray-900 text-white font-medium text-xs hover:bg-gray-800 transition-colors"
              >
                Go to Clients
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
