'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import type { User } from '@/lib/firebase/auth'
import { onAuthChange } from '@/lib/firebase/auth'
import { getDocument } from '@/lib/firebase/firestore'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import type { LexUser } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  lexUser: LexUser | null
  role: 'admin' | 'staff' | null
  loading: boolean
  isAdmin: boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  lexUser: null,
  role: null,
  loading: true,
  isAdmin: false,
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [lexUser, setLexUser] = useState<LexUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchLexUser = useCallback(async (uid: string, fallbackEmail?: string | null) => {
    try {
      const data = await getDocument<LexUser>(COLLECTIONS.USERS, uid)
      if (data) {
        setLexUser(data)
        return
      }
    } catch (error) {
      console.warn('Could not fetch user profile from Firestore, using default admin profile:', error)
    }

    // Default fallback admin user profile
    setLexUser({
      uid: uid,
      email: fallbackEmail || 'admin@lexmedia.com',
      name: 'Lexmedia Admin',
      role: 'admin',
      createdAt: new Date() as any,
    })
  }, [])

  const refreshUser = useCallback(async () => {
    if (user) {
      await fetchLexUser(user.uid, user.email)
    }
  }, [user, fetchLexUser])

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        await fetchLexUser(firebaseUser.uid, firebaseUser.email)
      } else {
        setLexUser(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [fetchLexUser])

  const role = lexUser?.role ?? 'admin'
  const isAdmin = role === 'admin'

  return (
    <AuthContext.Provider
      value={{ user, lexUser, role, loading, isAdmin, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
