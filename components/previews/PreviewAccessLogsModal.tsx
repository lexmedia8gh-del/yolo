'use client'

import React, { useState, useEffect } from 'react'
import {
  Shield,
  Clock,
  User,
  Eye,
  AlertTriangle,
  Lock,
  Printer,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import type { PreviewAccessLog } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface PreviewAccessLogsModalProps {
  isOpen: boolean
  onClose: () => void
  previewId?: string
  previewTitle?: string
}

export function PreviewAccessLogsModal({
  isOpen,
  onClose,
  previewId,
  previewTitle,
}: PreviewAccessLogsModalProps) {
  const [logs, setLogs] = useState<PreviewAccessLog[]>([])
  const [loading, setLoading] = useState(false)
  const [filterEvent, setFilterEvent] = useState<string>('all')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const url = previewId
        ? `/api/preview/admin/logs?previewId=${encodeURIComponent(previewId)}`
        : `/api/preview/admin/logs`
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok && data.logs) {
        setLogs(data.logs)
      }
    } catch (err) {
      console.warn('Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen, previewId])

  const filtered = logs.filter((log) => {
    if (filterEvent !== 'all' && log.event !== filterEvent) return false
    return true
  })

  const getEventBadge = (event: string) => {
    switch (event) {
      case 'access_granted':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 size={11} /> Granted
          </span>
        )
      case 'access_revoked':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <XCircle size={11} /> Revoked Attempt
          </span>
        )
      case 'access_expired':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock size={11} /> Expired Attempt
          </span>
        )
      case 'asset_viewed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Eye size={11} /> Proof Viewed
          </span>
        )
      case 'blur_lock':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Shield size={11} /> Window Blur Shield
          </span>
        )
      case 'print_blocked':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
            <Printer size={11} /> Print Deterred
          </span>
        )
      case 'save_blocked':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
            <Lock size={11} /> Save Deterred
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
            {event}
          </span>
        )
    }
  }

  const formatLogTime = (ts: any) => {
    if (!ts) return 'Just now'
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString()
    return new Date(ts).toLocaleString()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={previewTitle ? `Audit Access Logs — ${previewTitle}` : 'Preview Audit & Access Logs'}
      size="xl"
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterEvent}
              onChange={(e) => setFilterEvent(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none"
            >
              <option value="all">All Events ({logs.length})</option>
              <option value="access_granted">Access Granted</option>
              <option value="asset_viewed">Proof Viewed</option>
              <option value="blur_lock">Blur Shields</option>
              <option value="print_blocked">Print Blocked</option>
              <option value="save_blocked">Save Blocked</option>
              <option value="access_revoked">Revoked Attempts</option>
              <option value="access_expired">Expired Attempts</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
            onClick={fetchLogs}
            disabled={loading}
          >
            Refresh Logs
          </Button>
        </div>

        {/* Technical Notice */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 leading-relaxed">
          <strong className="text-slate-700 dark:text-slate-300">Auditing & Forensic Architecture:</strong>{' '}
          Each client proof access generates a cryptographically unique session token. While client web browsers cannot mathematically block operating-system screenshots, every visible proof is forensic-watermarked with client identity and session ID, and capture attempts trigger deterrent shields.
        </div>

        {/* Table / List */}
        <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center">
              <Spinner size="md" />
              <p className="text-xs text-gray-500 mt-2">Loading audit logs…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500">
              No audit logs recorded for this selection yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900 text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Event</th>
                  <th className="py-2.5 px-3">Session / IP</th>
                  <th className="py-2.5 px-3">Asset / Details</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-2.5 px-3">{getEventBadge(log.event)}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-[11px] text-gray-800 dark:text-gray-200">
                        {log.sessionId ? log.sessionId.slice(0, 14) + '…' : 'None'}
                      </div>
                      <div className="text-[10px] text-gray-400">{log.ipSnippet || 'local'}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {log.assetName ? (
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate block max-w-[200px]">
                          {log.assetName}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Portal session</span>
                      )}
                      {log.userAgent && (
                        <div className="text-[10px] text-gray-400 truncate max-w-[220px]">
                          {log.userAgent}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500 whitespace-nowrap text-[11px]">
                      {formatLogTime(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
