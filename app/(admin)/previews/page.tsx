'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Eye,
  Plus,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Clock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Trash2,
  RefreshCw,
  Power,
  Layers,
  Calendar,
  User,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  FileText,
  FileCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import {
  COLLECTIONS,
  subscribeToCollection,
  getDocuments,
} from '@/lib/firebase/firestore'
import type { ClientPreview, PreviewStatus } from '@/lib/types'
import { formatDate, copyToClipboard, buildClientPreviewUrl } from '@/lib/utils'
import { CreatePreviewModal } from '@/components/previews/CreatePreviewModal'
import { ChangeExpirationModal } from '@/components/previews/ChangeExpirationModal'
import { PreviewAccessLogsModal } from '@/components/previews/PreviewAccessLogsModal'
import toast, { Toaster } from 'react-hot-toast'

export default function AdminPreviewsPage() {
  const [previews, setPreviews] = useState<ClientPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [expirationModalPreview, setExpirationModalPreview] = useState<ClientPreview | null>(null)
  const [auditLogsModalPreview, setAuditLogsModalPreview] = useState<ClientPreview | null>(null)
  const [revokingPreview, setRevokingPreview] = useState<ClientPreview | null>(null)
  const [deletingPreview, setDeletingPreview] = useState<ClientPreview | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const getTimestampMillis = (ts: any): number => {
    if (!ts) return 0
    if (typeof ts.toDate === 'function') return ts.toDate().getTime()
    if (ts.seconds) return ts.seconds * 1000
    if (typeof ts === 'number') return ts
    const parsed = new Date(ts).getTime()
    return isNaN(parsed) ? 0 : parsed
  }

  // Real-time listener for client previews
  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribeToCollection<ClientPreview>(
      COLLECTIONS.CLIENT_PREVIEWS,
      [],
      (data) => {
        // Sort newest first
        const sorted = [...data].sort((a, b) => {
          const aTime = getTimestampMillis(a.createdAt)
          const bTime = getTimestampMillis(b.createdAt)
          return bTime - aTime
        })
        setPreviews(sorted)
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Check if preview has naturally expired
  const isPreviewExpired = (p: ClientPreview) => {
    if (p.status === 'Expired') return true
    if (!p.expiresAt) return false
    const time = getTimestampMillis(p.expiresAt)
    return time > 0 && time <= Date.now()
  }

  // Filtered list
  const filtered = previews.filter((p) => {
    const expired = isPreviewExpired(p)
    if (statusFilter === 'active' && (p.status !== 'Active' || expired)) return false
    if (statusFilter === 'expired' && !expired && p.status !== 'Expired') return false
    if (statusFilter === 'revoked' && p.status !== 'Revoked') return false
    if (statusFilter === 'draft' && p.status !== 'Draft') return false

    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (p.title || '').toLowerCase().includes(q) ||
      (p.clientName || '').toLowerCase().includes(q) ||
      (p.projectName || '').toLowerCase().includes(q) ||
      (p.token || '').toLowerCase().includes(q)
    )
  })

  // Quick Stats
  const activeCount = previews.filter((p) => p.status === 'Active' && !isPreviewExpired(p)).length
  const expiredCount = previews.filter((p) => isPreviewExpired(p)).length
  const totalViews = previews.reduce((acc, curr) => acc + (curr.viewCount || 0), 0)

  // Toggle Revoke / Reactivate Preview
  const handleToggleRevoke = async () => {
    if (!revokingPreview) return
    setIsProcessing(true)
    const newStatus: PreviewStatus = revokingPreview.status === 'Revoked' ? 'Active' : 'Revoked'
    try {
      const res = await fetch(`/api/preview/admin/${revokingPreview.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          revokedReason: newStatus === 'Revoked' ? 'Revoked by studio administrator' : '',
        }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      toast.success(newStatus === 'Revoked' ? 'Preview access revoked' : 'Preview restored to active')
      setRevokingPreview(null)
    } catch {
      toast.error('Unable to update preview status')
    } finally {
      setIsProcessing(false)
    }
  }

  // Delete Preview
  const handleDeletePreview = async () => {
    if (!deletingPreview) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/preview/admin/${deletingPreview.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete preview')
      toast.success('Client preview deleted')
      setDeletingPreview(null)
    } catch {
      toast.error('Unable to delete preview')
    } finally {
      setIsProcessing(false)
    }
  }

  // Copy Preview Link
  const handleCopyLink = (token: string) => {
    const url = buildClientPreviewUrl(token)
    copyToClipboard(url)
    toast.success('Client preview link copied to clipboard!')
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <PageHeader
        title="Client Previews"
        subtitle="Secure view-only client review portals with forensic watermarking & access auditing"
        action={
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={16} />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Client Preview
          </Button>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Total Previews</span>
            <Eye size={16} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{previews.length}</div>
          <div className="text-[11px] text-gray-400 mt-1">Proof sessions generated</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
            <span className="text-xs font-medium">Active Proofs</span>
            <ShieldCheck size={16} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Available for review</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between text-amber-500 mb-2">
            <span className="text-xs font-medium">Expired Proofs</span>
            <Clock size={16} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{expiredCount}</div>
          <div className="text-[11px] text-amber-500 mt-1">Review window elapsed</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between text-indigo-500 mb-2">
            <span className="text-xs font-medium">Total Client Views</span>
            <Layers size={16} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalViews}</div>
          <div className="text-[11px] text-gray-400 mt-1">Audited view sessions</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by client, deliverable title, or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Previews' },
            { id: 'active', label: 'Active' },
            { id: 'expired', label: 'Expired' },
            { id: 'revoked', label: 'Revoked' },
            { id: 'draft', label: 'Draft' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                statusFilter === pill.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Spinner size="lg" />
            <p className="text-xs text-gray-500 mt-2">Loading client previews...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center">
              <Eye size={24} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              No Client Previews Found
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Create a secure, watermarked client preview to share proof deliverables without granting raw file downloads.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              Create Preview
            </Button>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-950 text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Proof Deliverable</th>
                    <th className="py-3 px-4">Client & Project</th>
                    <th className="py-3 px-4">Status & Expiration</th>
                    <th className="py-3 px-4">Assets & Watermark</th>
                    <th className="py-3 px-4">Audited Views</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filtered.map((item) => {
                    const expired = isPreviewExpired(item)
                    const previewUrl = buildClientPreviewUrl(item.token)

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition"
                      >
                        {/* Deliverable Info */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-900 dark:text-white text-xs flex items-center gap-1.5">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5 font-mono truncate max-w-[200px]">
                            Token: {item.token}
                          </div>
                        </td>

                        {/* Client & Project */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {item.clientName}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate max-w-[180px]">
                            {item.projectName}
                          </div>
                        </td>

                        {/* Status & Expiration */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {item.status === 'Revoked' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                <ShieldX size={11} /> Revoked
                              </span>
                            ) : expired ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <Clock size={11} /> Expired
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <ShieldCheck size={11} /> Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {item.expiresAt ? (
                              <>Expires {formatDate(item.expiresAt)}</>
                            ) : (
                              'No expiration'
                            )}
                          </div>
                        </td>

                        {/* Assets & Watermark */}
                        <td className="py-3.5 px-4">
                          <div className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                            {item.assets?.length || 0} {item.assets?.length === 1 ? 'file' : 'files'}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {item.watermark?.enabled !== false ? '🛡️ Forensic watermark' : 'Plain proof'}
                          </div>
                        </td>

                        {/* Audited Views */}
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-semibold text-gray-900 dark:text-white">
                            {item.viewCount || 0} views
                          </div>
                          {item.lastViewedAt && (
                            <div className="text-[10px] text-gray-400">
                              Last: {formatDate(item.lastViewedAt)}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(item.token)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                              title="Copy Client Preview URL"
                            >
                              <Copy size={14} />
                            </button>

                            <a
                              href={`/client-preview/${encodeURIComponent(item.token)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                              title="Open Preview Portal"
                            >
                              <ExternalLink size={14} />
                            </a>

                            <button
                              type="button"
                              onClick={() => setAuditLogsModalPreview(item)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                              title="View Forensic Audit Logs"
                            >
                              <Shield size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpirationModalPreview(item)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                              title="Adjust Expiration"
                            >
                              <Clock size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setRevokingPreview(item)}
                              className={`p-1.5 rounded-lg transition ${
                                item.status === 'Revoked'
                                  ? 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  : 'text-gray-500 hover:text-rose-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                              }`}
                              title={item.status === 'Revoked' ? 'Reactivate Preview' : 'Revoke Preview'}
                            >
                              <Power size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingPreview(item)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                              title="Delete Preview"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((item) => {
                const expired = isPreviewExpired(item)
                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                          {item.title}
                        </h4>
                        <div className="text-[11px] font-mono text-gray-400 mt-0.5 truncate">
                          Token: {item.token}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {item.status === 'Revoked' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <ShieldX size={11} /> Revoked
                          </span>
                        ) : expired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock size={11} /> Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck size={11} /> Active
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/70 dark:bg-gray-800/50 p-2.5 rounded-xl">
                      <div>
                        <span className="text-[10px] text-gray-400 block">Client</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">
                          {item.clientName || 'Valued Client'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block">Project</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">
                          {item.projectName || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block">Assets</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {item.assets?.length || 0} file{(item.assets?.length || 0) === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block">Audited Views</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {item.viewCount || 0} views
                        </span>
                      </div>
                    </div>

                    {/* Primary & Secondary Action Bar */}
                    <div className="pt-1 space-y-2">
                      <a
                        href={`/client-preview/${encodeURIComponent(item.token)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <ExternalLink size={14} /> Open Client Preview
                      </a>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(item.token)}
                          className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5"
                        >
                          <Copy size={13} className="text-gray-400" /> Copy Link
                        </button>

                        <button
                          type="button"
                          onClick={() => setAuditLogsModalPreview(item)}
                          className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5"
                        >
                          <Shield size={13} className="text-emerald-500" /> Audit Logs
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpirationModalPreview(item)}
                          className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5"
                        >
                          <Clock size={13} className="text-amber-500" /> Expiration
                        </button>

                        <button
                          type="button"
                          onClick={() => setRevokingPreview(item)}
                          className="h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5"
                        >
                          <Power size={13} className={item.status === 'Revoked' ? 'text-emerald-500' : 'text-rose-500'} />
                          {item.status === 'Revoked' ? 'Reactivate' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create Preview Modal */}
      <CreatePreviewModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false)
        }}
      />

      {/* Adjust Expiration Modal */}
      <ChangeExpirationModal
        isOpen={!!expirationModalPreview}
        onClose={() => setExpirationModalPreview(null)}
        preview={expirationModalPreview}
        onSuccess={() => {
          setExpirationModalPreview(null)
        }}
      />

      {/* Audit Logs Modal */}
      <PreviewAccessLogsModal
        isOpen={!!auditLogsModalPreview}
        onClose={() => setAuditLogsModalPreview(null)}
        previewId={auditLogsModalPreview?.id}
        previewTitle={auditLogsModalPreview?.title}
      />

      {/* Revoke / Reactivate Confirmation Modal */}
      <Modal
        isOpen={!!revokingPreview}
        onClose={() => setRevokingPreview(null)}
        title={
          revokingPreview?.status === 'Revoked'
            ? 'Reactivate Client Preview'
            : 'Revoke Client Preview'
        }
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {revokingPreview?.status === 'Revoked'
              ? `Restore view-only access to "${revokingPreview?.title}" for ${revokingPreview?.clientName}?`
              : `Immediately suspend client access to "${revokingPreview?.title}"? Clients opening the link will see the Revoked state.`}
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevokingPreview(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant={revokingPreview?.status === 'Revoked' ? 'primary' : 'danger'}
              size="sm"
              onClick={handleToggleRevoke}
              disabled={isProcessing}
            >
              {isProcessing
                ? 'Updating...'
                : revokingPreview?.status === 'Revoked'
                ? 'Reactivate'
                : 'Revoke Access'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingPreview}
        onClose={() => setDeletingPreview(null)}
        title="Delete Client Preview"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Are you sure you want to permanently delete <strong className="text-gray-900 dark:text-white">{deletingPreview?.title}</strong>? Any links shared with the client will immediately stop working.
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingPreview(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeletePreview}
              disabled={isProcessing}
            >
              {isProcessing ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
