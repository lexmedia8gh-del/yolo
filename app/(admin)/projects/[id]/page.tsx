'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FolderKanban,
  Wrench,
  Package,
  FileText,
  CreditCard,
  Link2,
  ExternalLink,
  Copy,
  MessageSquare,
  CheckCircle2,
  Clock,
  DollarSign,
  Calendar,
  AlertCircle,
  Edit2,
  Plus,
  Eye,
  PiggyBank,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import {
  COLLECTIONS,
  getDocument,
  getDocuments,
  updateDocument,
} from '@/lib/firebase/firestore'
import { where } from '@/lib/firebase/firestore'
import { ProjectDeliveryManager } from '@/components/delivery/ProjectDeliveryManager'
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal'
import { PaymentDetailsModal } from '@/components/payments/PaymentDetailsModal'
import { ProjectPaymentLinkModal } from '@/components/projects/ProjectPaymentLinkModal'
import { ProjectPaymentRequests } from '@/components/projects/ProjectPaymentRequests'
import { EditProjectModal } from '@/components/projects/EditProjectModal'
import { MultiChannelDispatchModal } from '@/components/dispatch/MultiChannelDispatchModal'
import type { Project, Invoice, Payment, ClientLink, ProjectStatus } from '@/lib/types'
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  copyToClipboard,
  appUrl,
  getPaymentLink,
  formatActionError,
  fetchWithTimeout,
} from '@/lib/utils'
import toast from 'react-hot-toast'

const PROJECT_STATUSES: ProjectStatus[] = [
  'Inquiry',
  'Awaiting Payment',
  'Paid',
  'In Progress',
  'Review',
  'Revision',
  'Completed',
  'Cancelled',
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = (params?.id as string) || ''

  const [project, setProject] = useState<Project | null>(null)
  const [client, setClient] = useState<any>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentLink, setPaymentLink] = useState<ClientLink | null>(null)
  const [projectLinks, setProjectLinks] = useState<ClientLink[]>([])
  const [showCreateLinkModal, setShowCreateLinkModal] = useState(false)
  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<ProjectStatus>('In Progress')
  const [linkCopied, setLinkCopied] = useState(false)
  
  const [sendingWA, setSendingWA] = useState(false)
  const [waSent, setWaSent] = useState(false)

  // Payment modals
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false)
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<Payment | null>(null)

  const reloadProjectData = useCallback(async () => {
    if (!id) return
    try {
      const proj = await getDocument<Project>(COLLECTIONS.PROJECTS, id)
      if (proj) setProject(proj)

      if (proj?.clientId || proj?.clientName) {
        let cli = proj.clientId
          ? await getDocument<any>(COLLECTIONS.CLIENTS, proj.clientId)
          : null
        if (!cli) {
          const allClients = await getDocuments<any>(COLLECTIONS.CLIENTS)
          const rawId = (proj.clientId || '').trim()
          const rawName = (proj.clientName || '').trim().toLowerCase()
          cli =
            allClients.find(
              (c: any) =>
                (rawId && (c.id === rawId || c.legacyId === rawId || c.clientId === rawId)) ||
                (!rawId && rawName && c.fullName?.trim().toLowerCase() === rawName)
            ) || null
        }
        setClient(cli)
      }

      if (proj?.invoiceId) {
        const inv = await getDocument<Invoice>(COLLECTIONS.INVOICES, proj.invoiceId)
        setInvoice(inv)
      }

      const pmts = await getDocuments<Payment>(COLLECTIONS.PAYMENTS, [
        where('projectId', '==', id),
      ])
      setPayments(
        [...pmts].sort((a, b) => {
          const aDate = a.paidAt ? new Date(a.paidAt as any).getTime() : 0
          const bDate = b.paidAt ? new Date(b.paidAt as any).getTime() : 0
          return bDate - aDate
        })
      )

      const links = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
        where('projectId', '==', id),
      ])
      const sortedLinks = (links || []).sort((a: any, b: any) => {
        const aDate = a.createdAt ? new Date(a.createdAt as any).getTime() : 0
        const bDate = b.createdAt ? new Date(b.createdAt as any).getTime() : 0
        return bDate - aDate
      })
      setProjectLinks(sortedLinks)
      setPaymentLink(sortedLinks[0] ?? null)
    } catch (err) {
      console.error('Project reload error:', err)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    reloadProjectData().finally(() => setLoading(false))
  }, [id, reloadProjectData])

  const handleUpdateStatus = async () => {
    if (!project || updatingStatus) return
    setUpdatingStatus(true)
    try {
      await updateDocument(COLLECTIONS.PROJECTS, project.id, { status: newStatus })
      setProject({ ...project, status: newStatus })
      toast.success('Project status updated.')
      setShowStatusModal(false)
    } catch (err) {
      toast.error(formatActionError(err, 'Failed to update status.'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const paymentUrl = paymentLink ? getPaymentLink(paymentLink.token) : null
  const amountPaid = project?.amountPaid ?? 0
  const balance = project?.outstandingBalance ?? Math.max(0, (project?.price || 0) - amountPaid)
  const depositAmount = project?.depositAmount ?? Math.round((project?.price || 0) * 0.4)

  const handleWhatsApp = async () => {
    if (sendingWA || waSent) return
    if (!project || !client?.whatsappNumber || !paymentLink) {
      toast.error('Missing WhatsApp number or payment link.')
      return
    }
    
    setSendingWA(true)
    try {
      const msg = `Hello ${project.clientName}! 👋\n\nYour invoice ${project.invoiceNumber} is ready.\n\n📋 Service: ${project.serviceName}\n📦 Package: ${project.packageTitle}\n💰 Total: ${formatCurrency(project.price)}\n🔐 Deposit Due: ${formatCurrency(project.depositAmount || 0)}\n\nClick the link below to pay securely:\n${paymentUrl}\n\nThank you for choosing LEXMEDIA.GH! 🙏`
      
      const res = await fetchWithTimeout('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: project.clientId,
          invoiceId: project.invoiceId,
          projectId: project.id,
          messageBody: msg,
          toNumber: client.whatsappNumber,
        }),
        timeoutMs: 15000,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp message')

      setWaSent(true)
      toast.success('WhatsApp message sent!')
    } catch (err: any) {
      console.error('WhatsApp Error:', err)
      toast.error(formatActionError(err, 'Failed to send WhatsApp message.'))
    } finally {
      setSendingWA(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Loading project…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="py-16 text-center space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Project Not Found</h3>
        <Link href="/projects">
          <Button variant="outline" icon={<ArrowLeft size={16} />}>Back to Projects</Button>
        </Link>
      </div>
    )
  }



  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg border border-gray-200/80 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">{project.name}</h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {project.invoiceNumber && <span className="font-mono text-gray-600">{project.invoiceNumber} · </span>}
              Created {formatDate(project.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            icon={<Send size={14} />}
            onClick={() => setShowDispatchModal(true)}
          >
            Dispatch
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Link2 size={14} />}
            onClick={() => setShowCreateLinkModal(true)}
            disabled={balance <= 0}
          >
            Create Payment Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<CreditCard size={14} />}
            onClick={() => setShowRecordPaymentModal(true)}
          >
            Record Deposit / Payment
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Edit2 size={14} />}
            onClick={() => setShowEditProjectModal(true)}
          >
            Edit Project
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Edit2 size={14} />}
            onClick={() => { setNewStatus(project.status); setShowStatusModal(true) }}
          >
            Update Status
          </Button>
        </div>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Value', value: formatCurrency(project.price), icon: DollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Deposit', value: formatCurrency(depositAmount), icon: CreditCard, color: 'text-gray-900', bg: 'bg-gray-100' },
          { label: 'Amount Paid', value: formatCurrency(amountPaid), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Outstanding', value: formatCurrency(balance), icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3.5">
            <div className={`w-9 h-9 rounded-lg ${card.bg} ${card.color} flex items-center justify-center shrink-0`}>
              <card.icon size={16} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{card.label}</p>
              <p className={`text-lg font-bold tracking-tight mt-0.5 ${card.color}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: project details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Project info */}
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">Project Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Wrench size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Service</p>
                  <p className="font-medium text-gray-900">{project.serviceName}</p>
                </div>
              </div>
              {project.packageTitle && (
                <div className="flex items-start gap-3">
                  <Package size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Package</p>
                    <p className="font-medium text-gray-900">{project.packageTitle}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <FolderKanban size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <Link href={`/clients/${project.clientId}`} className="font-medium text-indigo-600 hover:underline">
                    {project.clientName}
                  </Link>
                </div>
              </div>
              {project.startDate && (
                <div className="flex items-start gap-3">
                  <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Start Date</p>
                    <p className="font-medium text-gray-900">{formatDate(project.startDate)}</p>
                  </div>
                </div>
              )}
              {project.deadline && (
                <div className="flex items-start gap-3">
                  <Calendar size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Due Date</p>
                    <p className="font-medium text-gray-900">{formatDate(project.deadline)}</p>
                  </div>
                </div>
              )}
              {project.priority && (
                <div className="flex items-start gap-3">
                  <AlertCircle size={15} className="text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Priority</p>
                    <p className="font-medium text-gray-900 capitalize">{project.priority}</p>
                  </div>
                </div>
              )}
              {project.description && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Description</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.description}</p>
                </div>
              )}
              {project.deliverables && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Deliverables</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.deliverables}</p>
                </div>
              )}
              {project.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Link */}
          {paymentUrl && (
            <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">Payment Link</h3>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5">
                <code className="text-xs text-gray-600 flex-1 truncate">{paymentUrl}</code>
                <button
                  onClick={async () => {
                    const copied = await copyToClipboard(paymentUrl)
                    if (copied) {
                      setLinkCopied(true)
                      toast.success('Copied!')
                      setTimeout(() => setLinkCopied(false), 2000)
                    } else {
                      toast.error('Failed to copy link')
                    }
                  }}
                  className="p-1 rounded-md hover:bg-gray-200 transition-colors text-gray-500 shrink-0"
                >
                  {linkCopied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-lg gap-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                >
                  <ExternalLink size={13} />
                  <span>Open</span>
                </a>
                {client?.whatsappNumber && (
                  <Button
                    size="sm"
                    variant="outline"
                    fullWidth
                    loading={sendingWA}
                    loadingText="Sending..."
                    icon={waSent ? <CheckCircle2 size={13} className="text-emerald-600" /> : <MessageSquare size={13} />}
                    className={waSent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}
                    onClick={handleWhatsApp}
                    disabled={sendingWA || waSent}
                  >
                    {waSent ? 'Sent' : 'WhatsApp'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: invoice + payments */}
        <div className="lg:col-span-2 space-y-5">
          {/* Invoice */}
          {invoice && (
            <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Invoice Summary</h3>
                <Link href="/invoices" className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium">
                  View All <ExternalLink size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Invoice #</p>
                  <p className="font-mono font-bold text-gray-900">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-bold text-gray-900">{formatCurrency(invoice.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Paid</p>
                  <p className="font-bold text-emerald-600">{formatCurrency(invoice.amountPaid || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Balance</p>
                  <p className="font-bold text-rose-600">{formatCurrency(invoice.balanceDue || 0)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(invoice.status)}`}>
                  {invoice.status}
                </span>
                <p className="text-xs text-gray-500">Due: {formatDate(invoice.dueDate)}</p>
              </div>
            </div>
          )}

          {/* Project Payment Requests & Links */}
          <ProjectPaymentRequests
            project={project}
            links={projectLinks}
            onRefresh={reloadProjectData}
            onOpenCreateModal={() => setShowCreateLinkModal(true)}
          />

          {/* Client Delivery File System */}
          <ProjectDeliveryManager
            project={project}
            client={client}
            invoice={invoice}
          />

          {/* Payments */}
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Payment History ({payments.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                icon={<Plus size={13} />}
                onClick={() => setShowRecordPaymentModal(true)}
              >
                Record Payment
              </Button>
            </div>
            {payments.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                <CreditCard size={22} className="mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500">No payments recorded yet for this project.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5"
                  icon={<Plus size={13} />}
                  onClick={() => setShowRecordPaymentModal(true)}
                >
                  Record Initial Deposit
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((pmt) => {
                  const isDeposit = pmt.paymentType === 'deposit' || pmt.isDeposit
                  return (
                    <div
                      key={pmt.id}
                      onClick={() => setSelectedPaymentForDetails(pmt)}
                      className="flex items-center justify-between p-3.5 rounded-lg border border-gray-200/80 hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isDeposit
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {isDeposit ? 'Deposit' : 'Payment'}
                          </span>
                          <p className="font-mono text-xs text-gray-700 truncate">{pmt.paystackReference}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="capitalize">{pmt.paymentMethod || pmt.channel || 'Manual'}</span>
                          {' · '}
                          {formatDate(pmt.paidAt)}
                        </p>
                        {pmt.notes && (
                          <p className="text-xs text-gray-500 italic mt-0.5 truncate">
                            &ldquo;{pmt.notes}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 ml-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600">{formatCurrency(pmt.amount)}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${getStatusColor(pmt.status)}`}>
                            {pmt.status}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedPaymentForDetails(pmt)
                          }}
                          className="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="View Details"
                        >
                          <Eye size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Update Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Update Project Status"
        size="sm"
        preventClose={updatingStatus}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">New Status</label>
            <select
              value={newStatus}
              onChange={(e: any) => setNewStatus(e.target.value)}
              disabled={updatingStatus}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={() => setShowStatusModal(false)} disabled={updatingStatus}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleUpdateStatus} loading={updatingStatus} loadingText="Updating...">
              Update Status
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record Payment / Deposit Modal */}
      {project && (
        <RecordPaymentModal
          isOpen={showRecordPaymentModal}
          onClose={() => setShowRecordPaymentModal(false)}
          preselectedProjectId={project.id}
          preselectedClientId={client?.id || project.clientId}
          preselectedInvoiceId={invoice?.id}
          onSuccess={() => {
            reloadProjectData()
          }}
        />
      )}

      {/* Project Payment Link Creation Modal */}
      {project && (
        <ProjectPaymentLinkModal
          isOpen={showCreateLinkModal}
          onClose={() => setShowCreateLinkModal(false)}
          project={project}
          client={client}
          onSuccess={() => {
            reloadProjectData()
            setShowCreateLinkModal(false)
          }}
        />
      )}

      {/* Payment Details Modal */}
      <PaymentDetailsModal
        isOpen={!!selectedPaymentForDetails}
        onClose={() => setSelectedPaymentForDetails(null)}
        payment={selectedPaymentForDetails}
        onPaymentDeleted={() => {
          reloadProjectData()
        }}
      />

      {/* Edit Project Modal */}
      {project && (
        <EditProjectModal
          project={project}
          isOpen={showEditProjectModal}
          onClose={() => setShowEditProjectModal(false)}
          payments={payments}
          links={projectLinks}
          onSuccess={() => {
            reloadProjectData()
          }}
        />
      )}

      {/* Multi-Channel Dispatch Modal pre-bound to Project & Client */}
      {project && showDispatchModal && (
        <MultiChannelDispatchModal
          isOpen={showDispatchModal}
          onClose={() => setShowDispatchModal(false)}
          initialClient={
            client
              ? {
                  id: client.id,
                  name: client.fullName || project.clientName || 'Valued Client',
                  email: client.email || '',
                  phone: client.phone || client.whatsappNumber || '',
                  companyName: client.company || '',
                }
              : project.clientId
              ? {
                  id: project.clientId,
                  name: project.clientName || 'Valued Client',
                }
              : null
          }
          initialProjectId={project.id}
          onSuccess={() => {
            reloadProjectData()
          }}
        />
      )}
    </div>
  )
}
