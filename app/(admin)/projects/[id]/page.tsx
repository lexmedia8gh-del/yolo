'use client'

import React, { useState, useEffect } from 'react'
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
import type { Project, Invoice, Payment, ClientLink, ProjectStatus } from '@/lib/types'
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  copyToClipboard,
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
  const [loading, setLoading] = useState(true)

  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState<ProjectStatus>('In Progress')
  const [linkCopied, setLinkCopied] = useState(false)
  
  const [sendingWA, setSendingWA] = useState(false)
  const [waSent, setWaSent] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    const load = async () => {
      try {
        const proj = await getDocument<Project>(COLLECTIONS.PROJECTS, id)
        setProject(proj)

        if (proj?.clientId) {
          const cli = await getDocument<any>(COLLECTIONS.CLIENTS, proj.clientId)
          setClient(cli)
        }

        if (proj?.invoiceId) {
          const inv = await getDocument<Invoice>(COLLECTIONS.INVOICES, proj.invoiceId)
          setInvoice(inv)
        }

        const pmts = await getDocuments<Payment>(COLLECTIONS.PAYMENTS, [
          where('projectId', '==', id),
        ])
        setPayments(pmts)

        const links = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
          where('projectId', '==', id),
        ])
        setPaymentLink(links[0] ?? null)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id])

  const handleUpdateStatus = async () => {
    if (!project) return
    setUpdatingStatus(true)
    try {
      await updateDocument(COLLECTIONS.PROJECTS, project.id, { status: newStatus })
      setProject({ ...project, status: newStatus })
      toast.success('Project status updated.')
      setShowStatusModal(false)
    } catch {
      toast.error('Failed to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const paymentUrl = paymentLink ? `${appUrl}/pay/${paymentLink.token}` : null
  const amountPaid = project?.amountPaid ?? 0
  const balance = project?.outstandingBalance ?? Math.max(0, (project?.price || 0) - amountPaid)
  const depositAmount = project?.depositAmount ?? Math.round((project?.price || 0) * 0.4)

  const handleWhatsApp = async () => {
    if (!project || !client?.whatsappNumber || !paymentLink) {
      toast.error('Missing WhatsApp number or payment link.')
      return
    }
    
    setSendingWA(true)
    try {
      const msg = `Hello ${project.clientName}! 👋\n\nYour invoice ${project.invoiceNumber} is ready.\n\n📋 Service: ${project.serviceName}\n📦 Package: ${project.packageTitle}\n💰 Total: ${formatCurrency(project.price)}\n🔐 Deposit Due: ${formatCurrency(project.depositAmount || 0)}\n\nClick the link below to pay securely:\n${paymentUrl}\n\nThank you for choosing LexMedia! 🙏`
      
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: project.clientId,
          invoiceId: project.invoiceId,
          projectId: project.id,
          messageBody: msg,
          toNumber: client.whatsappNumber,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp message')

      setWaSent(true)
      toast.success('WhatsApp message sent!')
    } catch (err: any) {
      console.error('WhatsApp Error:', err)
      toast.error(err.message || 'Failed to send WhatsApp message.')
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
        <Button
          variant="outline"
          size="sm"
          icon={<Edit2 size={14} />}
          onClick={() => { setNewStatus(project.status); setShowStatusModal(true) }}
        >
          Update Status
        </Button>
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
                    await copyToClipboard(paymentUrl)
                    setLinkCopied(true)
                    toast.success('Copied!')
                    setTimeout(() => setLinkCopied(false), 2000)
                  }}
                  className="p-1 rounded-md hover:bg-gray-200 transition-colors text-gray-500 shrink-0"
                >
                  {linkCopied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" fullWidth icon={<ExternalLink size={13} />}
                  onClick={() => window.open(paymentUrl, '_blank')}>
                  Open
                </Button>
                {client?.whatsappNumber && (
                  <Button
                    size="sm"
                    variant={waSent ? 'outline' : 'outline'}
                    fullWidth
                    icon={sendingWA ? <Spinner size="sm" /> : waSent ? <CheckCircle2 size={13} className="text-emerald-600" /> : <MessageSquare size={13} />}
                    className={waSent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}
                    onClick={handleWhatsApp}
                    disabled={sendingWA || waSent}
                  >
                    {sendingWA ? 'Sending...' : waSent ? 'Sent' : 'WhatsApp'}
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

          {/* Client Delivery File System */}
          <ProjectDeliveryManager
            project={project}
            client={client}
            invoice={invoice}
          />

          {/* Payments */}
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
            <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3 mb-4">
              Payment History ({payments.length})
            </h3>
            {payments.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                <CreditCard size={22} className="mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500">No payments recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((pmt) => (
                  <div key={pmt.id} className="flex items-center justify-between p-3.5 rounded-lg border border-gray-200/80 hover:bg-gray-50/60 transition-colors">
                    <div>
                      <p className="font-mono text-xs text-gray-700">{pmt.paystackReference}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(pmt.paidAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(pmt.amount)}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(pmt.status)}`}>
                        {pmt.status}
                      </span>
                    </div>
                  </div>
                ))}
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
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700">New Status</label>
            <select
              value={newStatus}
              onChange={(e: any) => setNewStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none transition-colors"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleUpdateStatus} loading={updatingStatus}>
              Update Status
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
