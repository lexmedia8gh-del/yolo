'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Mail,
  Phone,
  MessageSquare,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Briefcase,
  FileText,
  CreditCard,
  Plus,
  Link2,
  Edit2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  COLLECTIONS,
  getDocument,
  getDocuments,
  subscribeToDocument,
} from '@/lib/firebase/firestore'
import { where, orderBy } from '@/lib/firebase/firestore'
import type { Client, Project, Invoice, Payment, ClientLink } from '@/lib/types'
import { formatCurrency, formatDate, getStatusColor, copyToClipboard } from '@/lib/utils'
import { NewProjectWizard } from '@/components/projects/NewProjectWizard'
import toast from 'react-hot-toast'

type TabId = 'projects' | 'invoices' | 'payments' | 'links' | 'notes' | 'communication'

export default function ClientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = (params?.id as string) || ''

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('projects')

  // Tab data
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [links, setLinks] = useState<ClientLink[]>([])
  const [whatsappMessages, setWhatsappMessages] = useState<any[]>([])
  const [tabLoading, setTabLoading] = useState(false)

  // Wizard
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (searchParams.get('action') === 'new-project') {
      setShowWizard(true)
    }
  }, [searchParams])

  // Load client
  useEffect(() => {
    if (!id) return
    setLoading(true)

    const unsubscribe = subscribeToDocument<Client>(
      COLLECTIONS.CLIENTS,
      id,
      (data) => {
        setClient(data)
        setLoading(false)
      }
    )

    getDocument<Client>(COLLECTIONS.CLIENTS, id).then((data) => {
      if (data) setClient(data)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [id])

  // Load tab data when tab changes or client loaded
  useEffect(() => {
    if (!id) return

    const loadTab = async () => {
      setTabLoading(true)
      try {
        if (activeTab === 'projects') {
          const data = await getDocuments<Project>(COLLECTIONS.PROJECTS, [
            where('clientId', '==', id),
          ])
          setProjects(data)
        } else if (activeTab === 'invoices') {
          const data = await getDocuments<Invoice>(COLLECTIONS.INVOICES, [
            where('clientId', '==', id),
          ])
          setInvoices(data)
        } else if (activeTab === 'payments') {
          const data = await getDocuments<Payment>(COLLECTIONS.PAYMENTS, [
            where('clientId', '==', id),
          ])
          setPayments(data)
        } else if (activeTab === 'links') {
          const data = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
            where('clientId', '==', id),
          ])
          setLinks(data)
        } else if (activeTab === 'communication') {
          const data = await getDocuments<any>(COLLECTIONS.WHATSAPP_MESSAGES, [
            where('clientId', '==', id),
          ])
          setWhatsappMessages(data)
        }
      } catch (err) {
        console.warn('Tab data load error:', err)
      } finally {
        setTabLoading(false)
      }
    }

    loadTab()
  }, [id, activeTab])

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Loading client profile…</p>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="py-16 text-center space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Client Not Found</h3>
        <p className="text-sm text-muted">The requested client record does not exist or was removed.</p>
        <Link href="/clients">
          <Button variant="outline" icon={<ArrowLeft size={16} />}>
            Back to Clients
          </Button>
        </Link>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'projects', label: 'Projects', count: client.projectCount },
    { id: 'invoices', label: 'Invoices' },
    { id: 'payments', label: 'Payments' },
    { id: 'links', label: 'Payment Links' },
    { id: 'communication', label: 'WhatsApp', count: whatsappMessages.length },
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {showWizard && (
        <NewProjectWizard
          client={client}
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false)
            setActiveTab('projects')
            // Reload projects tab
            getDocuments<Project>(COLLECTIONS.PROJECTS, [
              where('clientId', '==', id),
            ]).then(setProjects)
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/clients"
            className="p-2 rounded-lg border border-gray-200/80 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">{client.fullName}</h1>
              <Badge variant={client.status === 'active' ? 'success' : 'muted'}>
                {client.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Client ID: <span className="font-mono text-gray-600">{client.id}</span> · Added {client.createdAt ? formatDate(client.createdAt) : 'Recently'}
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={15} />}
          onClick={() => setShowWizard(true)}
        >
          Create Project / Select Service
        </Button>
      </div>

      {/* Action Banner for Starting Project */}
      {projects.length === 0 && !loading && (
        <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <FolderKanban size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Start a New Project for {client.fullName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Select a service and package to automatically generate a project, invoice, and Paystack payment link.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowWizard(true)}
            className="shrink-0"
          >
            Create Project / Select Service
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <DollarSign size={18} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total Billed</p>
            <p className="text-lg font-bold text-gray-900 tracking-tight mt-0.5">
              {formatCurrency(client.totalBilled || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CreditCard size={18} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Total Paid</p>
            <p className="text-lg font-bold text-emerald-600 tracking-tight mt-0.5">
              {formatCurrency(client.totalPaid || 0)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Outstanding</p>
            <p className="text-lg font-bold text-rose-600 tracking-tight mt-0.5">
              {formatCurrency(client.outstandingBalance || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Contact Info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Contact Information</h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Email Address</p>
                  <a href={`mailto:${client.email}`} className="font-medium text-indigo-600 hover:underline">
                    {client.email}
                  </a>
                </div>
              </div>

              {client.phone && (
                <div className="flex items-start gap-3">
                  <Phone size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Phone Number</p>
                    <p className="font-medium text-gray-900">{client.phone}</p>
                  </div>
                </div>
              )}

              {client.whatsappNumber && (
                <div className="flex items-start gap-3">
                  <MessageSquare size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">WhatsApp</p>
                    <a
                      href={`https://wa.me/${client.whatsappNumber.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      {client.whatsappNumber}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              )}

              {client.company && (
                <div className="flex items-start gap-3">
                  <Building2 size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Company / Organization</p>
                    <p className="font-medium text-gray-900">{client.company}</p>
                  </div>
                </div>
              )}

              {client.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="font-medium text-gray-900">{client.address}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Member Since</p>
                  <p className="font-medium text-gray-900">
                    {client.createdAt ? formatDate(client.createdAt) : 'Recently'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowWizard(true)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-xs font-medium text-gray-700"
              >
                <Plus size={14} className="text-indigo-600" />
                Create New Project
              </button>
              <Link
                href={`/links?client=${encodeURIComponent(client.fullName)}`}
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-xs font-medium text-gray-700"
              >
                <Link2 size={14} className="text-indigo-600" />
                Create Payment Link
              </Link>
              {client.whatsappNumber && (
                <a
                  href={`https://wa.me/${client.whatsappNumber.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-xs font-medium text-gray-700"
                >
                  <MessageSquare size={14} className="text-emerald-600" />
                  Message on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50/60 px-4 pt-1 gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-1.5 py-0.2 font-semibold">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {tabLoading ? (
                <div className="py-10 flex flex-col items-center gap-3">
                  <Spinner size="md" />
                  <p className="text-sm text-muted">Loading…</p>
                </div>
              ) : (
                <>
                  {/* Projects Tab */}
                  {activeTab === 'projects' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm">Projects ({projects.length})</h4>
                        <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setShowWizard(true)}>
                          New Project
                        </Button>
                      </div>
                      {projects.length === 0 ? (
                        <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-border">
                          <FolderKanban size={28} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-muted">No projects yet.</p>
                          <button
                            onClick={() => setShowWizard(true)}
                            className="mt-2 text-xs text-accent-600 hover:underline font-semibold"
                          >
                            Create first project →
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {projects.map((project) => (
                            <Link
                              key={project.id}
                              href={`/projects/${project.id}`}
                              className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-gray-50 transition-colors group"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-accent-600 transition-colors">
                                  {project.name}
                                </p>
                                <p className="text-xs text-muted mt-0.5">
                                  {project.serviceName}
                                  {project.packageTitle && ` · ${project.packageTitle}`}
                                  {' · '}
                                  {formatDate(project.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900">{formatCurrency(project.price)}</p>
                                  {project.amountPaid !== undefined && (
                                    <p className="text-xs text-success-600">Paid: {formatCurrency(project.amountPaid)}</p>
                                  )}
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${getStatusColor(project.status)}`}>
                                  {project.status}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Invoices Tab */}
                  {activeTab === 'invoices' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm">Invoices ({invoices.length})</h4>
                        <Link href="/invoices">
                          <Button size="sm" variant="outline" icon={<ExternalLink size={14} />}>
                            All Invoices
                          </Button>
                        </Link>
                      </div>
                      {invoices.length === 0 ? (
                        <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-border">
                          <FileText size={28} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-muted">No invoices yet. Create a project to auto-generate one.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {invoices.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-mono font-bold text-gray-900 text-sm">{inv.invoiceNumber}</p>
                                <p className="text-xs text-muted mt-0.5">
                                  {inv.packageTitle && `${inv.packageTitle} · `}
                                  Due {formatDate(inv.dueDate)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total)}</p>
                                  {inv.balanceDue !== undefined && inv.balanceDue > 0 && (
                                    <p className="text-xs text-danger-600">Bal: {formatCurrency(inv.balanceDue)}</p>
                                  )}
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${getStatusColor(inv.status)}`}>
                                  {inv.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payments Tab */}
                  {activeTab === 'payments' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-gray-900 text-sm">Payments ({payments.length})</h4>
                      {payments.length === 0 ? (
                        <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-border">
                          <CreditCard size={28} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-muted">No payment records yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {payments.map((pmt) => (
                            <div
                              key={pmt.id}
                              className="flex items-center justify-between p-4 rounded-xl border border-border"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-xs text-gray-600 truncate">{pmt.paystackReference}</p>
                                <p className="text-xs text-muted mt-0.5">
                                  Invoice: {pmt.invoiceNumber} · {formatDate(pmt.paidAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                <p className="text-sm font-bold text-success-600">{formatCurrency(pmt.amount)}</p>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${getStatusColor(pmt.status)}`}>
                                  {pmt.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Links Tab */}
                  {activeTab === 'links' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm">Payment Links ({links.length})</h4>
                        <Link href={`/links?client=${encodeURIComponent(client.fullName)}`}>
                          <Button size="sm" variant="outline" icon={<Plus size={14} />}>
                            New Link
                          </Button>
                        </Link>
                      </div>
                      {links.length === 0 ? (
                        <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-border">
                          <Link2 size={28} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-muted">No payment links yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {links.map((link) => {
                            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
                            const payUrl = `${appUrl}/pay/${link.token}`
                            return (
                              <div
                                key={link.id}
                                className="p-4 rounded-xl border border-border hover:bg-gray-50 transition-colors space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-sm text-gray-900">
                                      {link.invoiceNumber || 'Payment Link'}
                                    </p>
                                    <p className="text-xs text-muted">{formatDate(link.createdAt)}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-gray-900 text-sm">{formatCurrency(link.amount || 0)}</p>
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${getStatusColor(link.status)}`}>
                                      {link.status}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <code className="flex-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-lg truncate">
                                    {payUrl}
                                  </code>
                                  <button
                                    onClick={async () => {
                                      await copyToClipboard(payUrl)
                                      toast.success('Link copied!')
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500"
                                    title="Copy link"
                                  >
                                    <ExternalLink size={14} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes Tab */}
                  {activeTab === 'notes' && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-gray-900 text-sm">Internal Notes</h4>
                      <div className="p-4 rounded-xl bg-gray-50 border border-border text-sm text-gray-700 whitespace-pre-wrap min-h-[120px]">
                        {client.notes || 'No notes added for this client.'}
                      </div>
                    </div>
                  )}

                  {/* Communication/WhatsApp Tab */}
                  {activeTab === 'communication' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm">WhatsApp History ({whatsappMessages.length})</h4>
                        {client.lastMessageStatus && (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            client.lastMessageStatus === 'sent' || client.lastMessageStatus === 'delivered' || client.lastMessageStatus === 'read'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : client.lastMessageStatus === 'failed'
                              ? 'text-rose-700 bg-rose-50 border-rose-200'
                              : 'text-gray-600 bg-gray-50 border-gray-200'
                          }`}>
                            Last: {client.lastMessageStatus}
                          </span>
                        )}
                      </div>
                      {!client.whatsappNumber && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                          <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800">
                            This client does not have a WhatsApp number. Add one to enable WhatsApp messaging.
                          </p>
                        </div>
                      )}
                      {whatsappMessages.length === 0 ? (
                        <div className="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-border">
                          <MessageSquare size={22} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-sm font-medium text-gray-600">No WhatsApp messages sent yet.</p>
                          <p className="text-xs text-gray-400 mt-1">Messages sent via payment links will appear here.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {whatsappMessages.map((msg: any) => (
                            <div key={msg.id} className="p-4 rounded-xl border border-gray-200/80 bg-white shadow-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <MessageSquare size={14} className="text-emerald-600" />
                                  <p className="text-xs font-semibold text-gray-900">
                                    To: {msg.toNumber}
                                  </p>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                    msg.messageType === 'delivery_ready'
                                      ? 'text-purple-700 bg-purple-50 border-purple-200'
                                      : 'text-blue-700 bg-blue-50 border-blue-200'
                                  }`}>
                                    {msg.messageType === 'delivery_ready' ? 'Delivery' : 'Payment Link'}
                                  </span>
                                </div>
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                  msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read'
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : msg.status === 'failed'
                                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                                    : msg.status === 'sending'
                                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                                    : 'text-gray-600 bg-gray-50 border-gray-200'
                                }`}>
                                  {msg.status === 'sent' ? 'Sent ✓' : msg.status === 'delivered' ? 'Delivered ✓✓' : msg.status === 'read' ? 'Read 👁' : msg.status === 'failed' ? 'Failed ✗' : msg.status}
                                </span>
                              </div>
                              {msg.invoiceId && (
                                <p className="text-xs text-gray-500">
                                  Invoice: <span className="font-mono text-gray-700">{msg.invoiceId}</span>
                                </p>
                              )}
                              {msg.deliveryId && (
                                <p className="text-xs text-gray-500">
                                  Delivery ID: <span className="font-mono text-gray-700">{msg.deliveryId}</span>
                                </p>
                              )}
                              {msg.errorDetails && (
                                <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-1.5">
                                  Error: {msg.errorDetails}
                                </p>
                              )}
                              <p className="text-xs text-gray-400">{formatDate(msg.createdAt)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
