'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Package,
  Wrench,
  FileText,
  CreditCard,
  Link2,
  Globe,
  MessageSquare,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: Users,
  },
  {
    label: 'Services',
    href: '/services',
    icon: Wrench,
  },
  {
    label: 'Packages',
    href: '/packages',
    icon: Package,
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    label: 'Invoices',
    href: '/invoices',
    icon: FileText,
  },
  {
    label: 'Payments',
    href: '/payments',
    icon: CreditCard,
  },
  {
    label: 'Payment Links',
    href: '/links',
    icon: Link2,
  },
  {
    label: 'Website Content',
    href: '/website',
    icon: Globe,
  },
  {
    label: 'WhatsApp',
    href: '/whatsapp',
    icon: MessageSquare,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { lexUser } = useAuth()

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-xs z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col z-40',
          'transition-transform duration-200 ease-in-out',
          'lg:translate-x-0 lg:relative lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 border-b border-gray-200 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              LM
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm tracking-tight block leading-tight">
                LexMedia
              </span>
              <span className="text-[11px] text-gray-500 font-medium block leading-tight">
                Admin Suite
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-indigo-50/80 text-indigo-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon
                      size={18}
                      className={cn(
                        'shrink-0',
                        isActive ? 'text-indigo-600' : 'text-gray-400'
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User Profile */}
        {lexUser && (
          <div className="p-3 border-t border-gray-200 shrink-0 bg-gray-50/50">
            <Link
              href="/settings"
              onClick={onClose}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-3">
                <Avatar name={lexUser?.name || 'Admin'} src={lexUser?.photoURL} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {lexUser?.name || 'Lexmedia Admin'}
                  </p>
                  <p className="text-[11px] text-gray-700 truncate">
                    {lexUser?.email || ''}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}
