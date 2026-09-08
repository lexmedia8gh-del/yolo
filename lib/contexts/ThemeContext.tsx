'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: ResolvedTheme
  themePreference: ThemePreference
  setThemePreference: (pref: ThemePreference) => void
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'ctrlroom_theme_preference'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system')
  const [theme, setTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  // Initialize theme from storage or system on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
      const validPref: ThemePreference =
        saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
      
      setThemePreferenceState(validPref)

      const resolved = validPref === 'system' ? getSystemTheme() : validPref
      setTheme(resolved)
      applyThemeClass(resolved)
    } catch {
      // Fallback
      const resolved = getSystemTheme()
      setTheme(resolved)
      applyThemeClass(resolved)
    } finally {
      setMounted(true)
    }
  }, [])

  // Listen to OS system theme changes if preference is 'system'
  useEffect(() => {
    if (!mounted) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (themePreference === 'system') {
        const newResolved: ResolvedTheme = e.matches ? 'dark' : 'light'
        setTheme(newResolved)
        applyThemeClass(newResolved)
      }
    }

    mediaQuery.addEventListener('change', handleSystemChange)
    return () => mediaQuery.removeEventListener('change', handleSystemChange)
  }, [themePreference, mounted])

  const setThemePreference = useCallback((pref: ThemePreference) => {
    setThemePreferenceState(pref)
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch (err) {
      console.warn('Failed to persist theme preference:', err)
    }

    const resolved = pref === 'system' ? getSystemTheme() : pref
    setTheme(resolved)
    applyThemeClass(resolved)
  }, [])

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemePreference = theme === 'dark' ? 'light' : 'dark'
    setThemePreference(nextTheme)
  }, [theme, setThemePreference])

  const value: ThemeContextValue = {
    theme,
    themePreference,
    setThemePreference,
    toggleTheme,
    isDark: theme === 'dark',
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
