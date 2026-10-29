'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react'
import type { User } from '@/lib/firebase/auth'
import {
  onAuthChange,
  reloadAndSyncAdminAuthUser,
  getActiveIdToken,
} from '@/lib/firebase/auth'
import {
  COLLECTIONS,
  getDocument,
  setDocument,
  subscribeToDocument,
} from '@/lib/firebase/firestore'
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

function buildNormalizedLexUser(
  firebaseUser: User,
  docData: Partial<LexUser> | null
): LexUser {
  const authoritativeEmail =
    firebaseUser.email?.trim() || docData?.email?.trim() || 'admin@lexmedia.com'
  const resolvedName =
    docData?.name?.trim() ||
    docData?.displayName?.trim() ||
    firebaseUser.displayName?.trim() ||
    'Lexmedia Admin'

  const rawPendingEmail = docData?.pendingEmail?.trim() || null
  const pendingEmail =
    rawPendingEmail &&
    rawPendingEmail.toLowerCase() !== authoritativeEmail.toLowerCase()
      ? rawPendingEmail
      : null

  return {
    ...(docData || {}),
    uid: firebaseUser.uid,
    email: authoritativeEmail,
    name: resolvedName,
    displayName: resolvedName,
    pendingEmail,
    pendingEmailRequestedAt: pendingEmail ? docData?.pendingEmailRequestedAt ?? null : null,
    role: docData?.role || 'admin',
    createdAt: docData?.createdAt || new Date().toISOString(),
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [lexUser, setLexUser] = useState<LexUser | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)

  const reconcileEmailWithFirestore = useCallback(
    async (firebaseUser: User, docData: Partial<LexUser> | null) => {
      const authEmail = firebaseUser.email?.trim()
      if (!authEmail || !docData) return

      const docEmail = (docData.email || '').trim()
      const pendingMatchesAuth =
        Boolean(docData.pendingEmail) &&
        docData.pendingEmail!.trim().toLowerCase() === authEmail.toLowerCase()
      const emailOutOfSync =
        Boolean(docEmail) && docEmail.toLowerCase() !== authEmail.toLowerCase()

      if (emailOutOfSync || pendingMatchesAuth) {
        try {
          await setDocument(
            COLLECTIONS.USERS,
            firebaseUser.uid,
            {
              uid: firebaseUser.uid,
              email: authEmail,
              role: docData.role || 'admin',
              pendingEmail: null,
              pendingEmailRequestedAt: null,
            },
            true
          )
          const token = await getActiveIdToken()
          if (token) {
            fetch('/api/admin/account', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ pendingEmail: null }),
            }).catch(() => {})
          }
        } catch (err) {
          console.warn('[AuthContext] Could not reconcile verified email to Firestore:', err)
        }
      }
    },
    []
  )

  const refreshUser = useCallback(async () => {
    const reloadedUser = await reloadAndSyncAdminAuthUser().catch(() => userRef.current)
    const activeUser = reloadedUser || userRef.current
    if (!activeUser) return

    userRef.current = activeUser
    setUser(activeUser)

    try {
      const data = await getDocument<LexUser>(COLLECTIONS.USERS, activeUser.uid)
      if (data) {
        await reconcileEmailWithFirestore(activeUser, data)
      }
      setLexUser(buildNormalizedLexUser(activeUser, data))
    } catch (error) {
      console.warn('Could not refresh user profile from Firestore:', error)
      setLexUser((prev) => buildNormalizedLexUser(activeUser, prev))
    }
  }, [reconcileEmailWithFirestore])

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null

    const authUnsubscribe = onAuthChange((firebaseUser) => {
      userRef.current = firebaseUser
      setUser(firebaseUser)

      if (profileUnsubscribe) {
        profileUnsubscribe()
        profileUnsubscribe = null
      }

      if (!firebaseUser) {
        setLexUser(null)
        setLoading(false)
        return
      }

      profileUnsubscribe = subscribeToDocument<LexUser>(
        COLLECTIONS.USERS,
        firebaseUser.uid,
        (docData) => {
          const latestAuthUser = userRef.current || firebaseUser
          if (docData) {
            reconcileEmailWithFirestore(latestAuthUser, docData)
          }
          setLexUser(buildNormalizedLexUser(latestAuthUser, docData))
          setLoading(false)
        }
      )
    })

    return () => {
      authUnsubscribe()
      if (profileUnsubscribe) {
        profileUnsubscribe()
      }
    }
  }, [reconcileEmailWithFirestore])

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
