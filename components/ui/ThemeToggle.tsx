'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Laptop, Check } from 'lucide-react'
import { useTheme, ThemePreference } from '@/lib/contexts/ThemeContext'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown' | 'segmented'
  className?: string
  showLabel?: boolean
}

export function ThemeToggle({
  variant = 'button',
  className,
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, themePreference, setThemePreference, toggleTheme, isDark } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 1. Simple 1-click toggle button
  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          'relative p-2 rounded-xl border border-gray-200 dark:border-gray-800',
          'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200',
          'hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
          className
        )}
        title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      >
        {isDark ? (
          <Sun size={17} className="text-amber-400 animate-fade-in" />
        ) : (
          <Moon size={17} className="text-gray-600 animate-fade-in" />
        )}
        {showLabel && (
          <span className="ml-2 text-xs font-medium">
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </span>
        )}
      </button>
    )
  }

  // 2. Segmented Pill Selector (Ideal for Settings & Profile)
  if (variant === 'segmented') {
    const options: { id: ThemePreference; label: string; icon: React.ElementType }[] = [
      { id: 'light', label: 'Light', icon: Sun },
      { id: 'dark', label: 'Dark', icon: Moon },
      { id: 'system', label: 'System', icon: Laptop },
    ]

    return (
      <div
        className={cn(
          'inline-flex p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700/60',
          className
        )}
      >
        {options.map((opt) => {
          const Icon = opt.icon
          const isActive = themePreference === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setThemePreference(opt.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xs font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              )}
            >
              <Icon size={14} className={isActive ? 'text-indigo-600 dark:text-indigo-400' : ''} />
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // 3. Dropdown Menu
  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={cn(
          'p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
          className
        )}
        aria-label="Theme options"
      >
        {theme === 'dark' ? (
          <Moon size={17} className="text-indigo-400" />
        ) : (
          <Sun size={17} className="text-amber-500" />
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg p-1 z-50 animate-scale-in">
          <button
            type="button"
            onClick={() => {
              setThemePreference('light')
              setDropdownOpen(false)
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sun size={14} className="text-amber-500" />
              <span>Light</span>
            </div>
            {themePreference === 'light' && <Check size={13} className="text-indigo-600" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setThemePreference('dark')
              setDropdownOpen(false)
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Moon size={14} className="text-indigo-400" />
              <span>Dark</span>
            </div>
            {themePreference === 'dark' && <Check size={13} className="text-indigo-600" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setThemePreference('system')
              setDropdownOpen(false)
            }}
            className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Laptop size={14} className="text-gray-400" />
              <span>System</span>
            </div>
            {themePreference === 'system' && <Check size={13} className="text-indigo-600" />}
          </button>
        </div>
      )}
    </div>
  )
}
