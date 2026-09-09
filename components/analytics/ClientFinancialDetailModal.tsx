'use client'

import React, { useEffect, useState } from 'react'
import {
  X,
  User,
  Building2,
  Mail,
  Phone,
  FolderKanban,
  Receipt,
  CreditCard,
  Calendar,
  ExternalLink,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { COLLECTIONS, getDocument, getDocuments, where } from '@/lib/firebase/firestore'
import type { Client, Project, Invoice, Payment } from '@/lib/types'
import Link from 'next/link'

interface ClientFinancialDetailModalProps {
  clientId: string | null
  onClose: () => void
}

export function ClientFinancialDetailModal({ clientId, onClose }: ClientFinancialDetailModalProps) {
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'invoices' | 'payments'>('overview')

  useEffect(() => {
    if (!clientId) return
    let isMounted = true
    setLoading(true)

    Promise.all([
      getDocument<Client>(COLLECTIONS.CLIENTS, clientId),
      getDocuments<Project>(COLLECTIONS.PROJECTS, [where('clientId', '==', clientId)]),
      getDocuments<Invoice>(COLLECTIONS.INVOICES, [where('clientId', '==', clientId)]),
      getDocuments<Payment>(COLLECTIONS.PAYMENTS, [where('clientId', '==', clientId)]),
    ])
      .then(([cli, projs, invs, pmts]) => {
        if (!isMounted) return
        setClient(cli)
        setProjects(projs || [])
        setInvoices(invs || [])
        setPayments(
          (pmts || []).sort((a, b) => {
            const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
            const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
            return bDate - aDate
          })
        )
      })
      .catch((err) => {
        console.error('Error fetching client financial details:', err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [clientId])

  if (!clientId) return null

  const totalInvoiced = invoices.reduce((acc, i) => acc + (Number(i.total) || 0), 0)
  const totalPaid = payments
    .filter((p) => p.status === 'success')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const outstandingBalance = Math.max(0, totalInvoiced - totalPaid)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
              {client?.fullName ? client.fullName.slice(0, 2).toUpperCase() : 'CL'}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {client?.fullName || 'Client Financial Ledger'}
                {projects.length > 1 && (
                  <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 text-purple-700 text-[10px] font-semibold rounded-full">
                    Returning Client
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {client?.company ? `${client.company} · ` : ''}
                {client?.email || 'No email specified'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Financial KPI Subheader */}
        <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 p-4 gap-4 text-center">
          <div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
              Total Invoiced
            </span>
            <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(totalInvoiced)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
              Total Paid
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalPaid)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
              Outstanding Balance
            </span>
            <span className="text-sm sm:text-base font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(outstandingBalance)}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-5 gap-4">
          {[
            { id: 'overview', label: 'Summary', count: null },
            { id: 'projects', label: 'Projects', count: projects.length },
            { id: 'invoices', label: 'Invoices', count: invoices.length },
            { id: 'payments', label: 'Payments', count: payments.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="px-1.5 py-0.2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-[10px]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex justify-center">
              <Spinner size="md" />
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-4">
              {/* Contact Info */}
              <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block mb-0.5">Phone / WhatsApp</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {client?.phone || client?.whatsappNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Address</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {client?.address || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Client Since</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {client?.createdAt ? formatDate(client.createdAt) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Status</span>
                  <Badge variant={client?.status === 'active' ? 'success' : 'default'}>
                    {client?.status || 'Active'}
                  </Badge>
                </div>
              </div>

              {/* Quick Link to Client Full Page */}
              <div className="flex justify-end">
                <Link
                  href={`/clients/${client?.id}`}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  Open full client profile <ExternalLink size={13} />
                </Link>
              </div>
            </div>
          ) : activeTab === 'projects' ? (
            projects.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No projects on file</div>
            ) : (
              <div className="space-y-2.5">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</div>
                      <div className="text-gray-500 mt-0.5">
                        {p.serviceName} · {p.packageTitle || 'Custom'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(p.price)}
                      </div>
                      <div className="text-[10px] text-gray-500">{p.paymentStatus || 'Unpaid'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'invoices' ? (
            invoices.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No invoices on file</div>
            ) : (
              <div className="space-y-2.5">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        Invoice #{inv.invoiceNumber}
                      </div>
                      <div className="text-gray-500 mt-0.5">{formatDate(inv.invoiceDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(inv.total)}
                      </div>
                      <Badge
                        variant={
                          inv.status === 'Paid'
                            ? 'success'
                            : inv.status === 'Partially Paid'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            payments.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No payments recorded yet</div>
            ) : (
              <div className="space-y-2.5">
                {payments.map((pmt) => (
                  <div
                    key={pmt.id}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(pmt.amount)}
                      </div>
                      <div className="text-gray-500 mt-0.5">
                        {pmt.channel || pmt.paymentMethod || 'Mobile Money'} ·{' '}
                        {pmt.paystackReference || pmt.reference || 'REF'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {pmt.paidAt ? formatDate(pmt.paidAt) : '—'}
                      </div>
                      <span className="text-[10px] text-emerald-600 font-semibold">Confirmed</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
