import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  Menu,
  Bell,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/useAuth'
import { signOut } from '@/lib/firebase/auth'
import { Avatar } from '@/components/ui/Avatar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import toast from 'react-hot-toast'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { lexUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const getPageTitle = (path: string) => {
    if (path.startsWith('/dashboard')) return 'Dashboard'
    if (path.startsWith('/clients/')) return 'Clients / Profile'
    if (path.startsWith('/clients')) return 'Clients'
    if (path.startsWith('/services')) return 'Services'
    if (path.startsWith('/packages')) return 'Packages'
    if (path.startsWith('/projects/')) return 'Projects / Detail'
    if (path.startsWith('/projects')) return 'Projects'
    if (path.startsWith('/invoices')) return 'Invoices'
    if (path.startsWith('/payments')) return 'Payments'
    if (path.startsWith('/links')) return 'Payment Links'
    if (path.startsWith('/website')) return 'Website Content'
    if (path.startsWith('/whatsapp')) return 'WhatsApp'
    if (path.startsWith('/settings')) return 'Settings'
    return 'Dashboard'
  }

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      document.cookie = '__session=; Max-Age=0; path=/'
      router.push('/login')
      toast.success('Signed out successfully')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  return (
    <header className="h-16 border-b border-gray-200 bg-white/95 backdrop-blur-xs flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-20">
      {/* Left: Mobile menu toggle or Desktop breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        {/* Mobile Page Title */}
        <span className="font-semibold text-gray-900 text-sm lg:hidden">
          {getPageTitle(pathname).split(' / ')[0]}
        </span>

        {/* Desktop Breadcrumb */}
        <div className="hidden lg:flex items-center gap-2 text-sm">
          <span className="text-gray-400 font-medium">LexMedia</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-semibold">{getPageTitle(pathname)}</span>
        </div>
      </div>

      {/* Right: Actions & User Menu */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        {lexUser && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={cn(
                'flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-lg transition-colors text-sm border border-transparent',
                userMenuOpen
                  ? 'bg-gray-100 border-gray-200'
                  : 'hover:bg-gray-50'
              )}
            >
              <Avatar name={lexUser?.name || 'Admin'} src={lexUser?.photoURL} size="sm" />
              <span className="font-medium text-gray-700 hidden sm:block max-w-[120px] truncate text-xs">
                {lexUser?.name || 'Admin'}
              </span>
              <ChevronDown
                size={13}
                className={cn(
                  'text-gray-400 transition-transform',
                  userMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-3.5 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {lexUser.name}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{lexUser.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User size={14} className="text-gray-400" />
                  My Profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings size={14} className="text-gray-400" />
                  Settings
                </Link>
                <div className="border-t border-gray-100 mt-1">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
