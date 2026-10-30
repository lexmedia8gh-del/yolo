'use client'

import React, { useState } from 'react'
import {
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  Ban,
  AlertTriangle,
  Plus,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { updateDocument, COLLECTIONS } from '@/lib/firebase/firestore'
import type { Project, ClientLink } from '@/lib/types'
import { formatCurrency, formatDate, copyToClipboard, openExternalUrl, getPaymentLink } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ProjectPaymentRequestsProps {
  project: Project
  links: ClientLink[]
  onRefresh: () => void
  onOpenCreateModal: () => void
}

export function ProjectPaymentRequests({
  project,
  links,
  onRefresh,
  onOpenCreateModal,
}: ProjectPaymentRequestsProps) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [cancellingLink, setCancellingLink] = useState<ClientLink | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const handleCopyLink = async (token: string) => {
    const url = getPaymentLink(token)
    await copyToClipboard(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
    toast.success('Payment link copied to clipboard!')
  }

  const handleShareWhatsApp = (link: ClientLink) => {
    const url = getPaymentLink(link.token)
    const clientName = project.clientName || 'Valued Client'
    const msg = `Hello ${clientName}! 👋\n\nPlease find your secure payment link for ${project.name} (${formatCurrency(link.amount || 0, link.currency || project.currency || 'GHS')}):\n${url}\n\nThank you for choosing LEXMEDIA.GH!`
    openExternalUrl(`https://wa.me/?text=${encodeURIComponent(msg)}`)
  }

  const handleCancelRequest = async () => {
    if (!cancellingLink) return
    setIsCancelling(true)
    try {
      await updateDocument(COLLECTIONS.CLIENT_LINKS, cancellingLink.id, {
        status: 'Cancelled',
        paymentStatus: 'Cancelled',
        updatedAt: new Date().toISOString(),
      })
      toast.success('Payment request cancelled successfully.')
      setCancellingLink(null)
      onRefresh()
    } catch (err: any) {
      console.error('Error cancelling payment request:', err)
      toast.error('Failed to cancel payment request.')
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusBadge = (link: ClientLink) => {
    // Check if link is expired
    let isExpired = link.status === 'Expired'
    if (!isExpired && link.expiresAt && link.status !== 'Paid') {
      const expTime = typeof (link.expiresAt as any)?.toDate === 'function'
        ? (link.expiresAt as any).toDate().getTime()
        : new Date(link.expiresAt as any).getTime()
      if (expTime > 0 && expTime < Date.now()) {
        isExpired = true
      }
    }

    if (link.status === 'Paid' || link.paymentStatus === 'Paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={11} /> Paid
        </span>
      )
    }
    if (link.status === 'Cancelled' || link.status === 'disabled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
          <Ban size={11} /> Cancelled
        </span>
      )
    }
    if (isExpired) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle size={11} /> Expired
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={11} /> Pending Payment
      </span>
    )
  }

  const outstandingBalance = project.outstandingBalance !== undefined
    ? Number(project.outstandingBalance)
    : Math.max(0, Number(project.price || 0) - Number(project.amountPaid || 0))

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Link2 size={16} className="text-indigo-600" />
            Payment Requests & Links ({links.length})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage partial and milestone payment requests for this project
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          icon={<Plus size={13} />}
          onClick={onOpenCreateModal}
          disabled={outstandingBalance <= 0}
          className="text-xs"
        >
          Create Payment Link
        </Button>
      </div>

      {/* Empty State */}
      {links.length === 0 ? (
        <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200 space-y-2">
          <Link2 size={24} className="mx-auto text-gray-400" />
          <p className="text-xs text-gray-600 font-medium">No payment requests created yet for this project.</p>
          <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
            You can create a payment link for any custom amount (such as a 40% deposit or milestone) up to the outstanding balance.
          </p>
          {outstandingBalance > 0 && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                icon={<Plus size={13} />}
                onClick={onOpenCreateModal}
                className="text-xs"
              >
                Create First Payment Link
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Payment Requests List */
        <div className="space-y-2.5">
          {links.map((link) => {
            const isPaid = link.status === 'Paid' || link.paymentStatus === 'Paid'
            const isCancelled = link.status === 'Cancelled' || link.status === 'disabled'
            const isCopied = copiedToken === link.token
            const paymentUrl = getPaymentLink(link.token)
            const canCancel = !isPaid && !isCancelled

            return (
              <div
                key={link.id || link.token}
                className={`p-3.5 rounded-xl border transition-all ${
                  isPaid
                    ? 'border-emerald-200/80 bg-emerald-50/20'
                    : isCancelled
                    ? 'border-gray-200 bg-gray-50/40 opacity-75'
                    : 'border-gray-200/80 hover:border-indigo-200 hover:bg-indigo-50/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Left Metadata */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-gray-900 text-sm">
                        {formatCurrency(link.amount || 0, link.currency || project.currency || 'GHS')}
                      </span>
                      {getStatusBadge(link)}
                      {link.token && (
                        <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {link.token.slice(0, 10)}...
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>Created: {formatDate(link.createdAt)}</span>
                      {link.expiresAt && (
                        <span className="text-gray-400">
                          Expires: {formatDate(link.expiresAt)}
                        </span>
                      )}
                      {link.paystackReference && (
                        <span className="font-mono text-[11px] text-emerald-700">
                          Ref: {link.paystackReference}
                        </span>
                      )}
                      {link.title && (
                        <span className="text-gray-600 italic truncate max-w-xs">
                          &ldquo;{link.title}&rdquo;
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(link.token)}
                      title="Copy Public Link"
                      className="h-8 px-2.5 text-xs"
                      icon={isCopied ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    >
                      {isCopied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openExternalUrl(paymentUrl)}
                      title="View Payment Page"
                      className="h-8 px-2.5 text-xs"
                      icon={<ExternalLink size={13} />}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShareWhatsApp(link)}
                      title="Share via WhatsApp"
                      className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                    >
                      <Share2 size={13} />
                    </Button>
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancellingLink(link)}
                        title="Cancel this unpaid payment request"
                        className="h-8 px-2 text-rose-600 hover:bg-rose-50"
                      >
                        <Ban size={13} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingLink && (
        <Modal
          isOpen={!!cancellingLink}
          onClose={() => setCancellingLink(null)}
          title="Cancel Payment Request"
          size="sm"
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
              <p>
                Are you sure you want to cancel the payment request for{' '}
                <strong className="font-mono">
                  {formatCurrency(cancellingLink.amount || 0, cancellingLink.currency || project.currency || 'GHS')}
                </strong>?
                This will prevent clients from paying through this specific link. Historical payments are preserved.
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancellingLink(null)}
                disabled={isCancelling}
              >
                Keep Active
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelRequest}
                loading={isCancelling}
                icon={<Ban size={14} />}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
