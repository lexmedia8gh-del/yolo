'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, CreditCard, ExternalLink, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { COLLECTIONS, subscribeToCollection, updateDocument } from '@/lib/firebase/firestore'
import { formatDate } from '@/lib/utils'

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  clientId?: string
  clientName?: string
  invoiceId?: string
  invoiceNumber?: string
  projectId?: string
  paymentId?: string
  amount?: number
  currency?: string
  paystackReference?: string
  createdAt: any
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Real-time listener for notifications
    const unsubscribe = subscribeToCollection<NotificationItem>(
      COLLECTIONS.NOTIFICATIONS,
      [],
      (data) => {
        const sorted = [...(data || [])].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt).getTime() : 0
          const bTime = b.createdAt ? new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt).getTime() : 0
          return bTime - aTime
        })
        setNotifications(sorted)
      }
    )

    return () => unsubscribe()
  }, [])

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter((n) => !n.isRead).length

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await updateDocument(COLLECTIONS.NOTIFICATIONS, id, { isRead: true })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead)
    for (const n of unread) {
      try {
        await updateDocument(COLLECTIONS.NOTIFICATIONS, n.id, { isRead: true })
      } catch (err) {
        console.error('Error marking all as read:', err)
      }
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-fade-in">
          <div className="p-3.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-600">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="py-10 text-center px-4">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No notifications yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Payments and project delivery updates will show up here.
                </p>
              </div>
            ) : (
              notifications.slice(0, 15).map((n) => {
                const linkHref = n.clientId
                  ? `/clients/${n.clientId}`
                  : n.invoiceId
                  ? `/invoices`
                  : `/dashboard`

                return (
                  <div
                    key={n.id}
                    className={`p-3.5 hover:bg-gray-50 transition-colors flex items-start gap-3 relative ${
                      !n.isRead ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <CreditCard size={15} />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-900 truncate">
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-gray-400">
                          {formatDate(n.createdAt)}
                        </span>
                        <Link
                          href={linkHref}
                          onClick={() => setIsOpen(false)}
                          className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5 font-medium"
                        >
                          View Details <ExternalLink size={10} />
                        </Link>
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => handleMarkAsRead(n.id, e)}
                        title="Mark as read"
                        className="absolute top-3.5 right-3 text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-200/50"
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
