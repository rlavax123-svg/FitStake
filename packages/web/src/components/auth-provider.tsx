'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface AuthUser {
  stravaId: number
  name: string
  image: string | null
}

interface AuthState {
  ready: boolean
  authenticated: boolean
  user: AuthUser | null
}

const AuthContext = createContext<AuthState>({
  ready: false,
  authenticated: false,
  user: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ready: false,
    authenticated: false,
    user: null,
  })

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        setState({
          ready: true,
          authenticated: data.authenticated || false,
          user: data.user || null,
        })
      })
      .catch(() => {
        setState({ ready: true, authenticated: false, user: null })
      })
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  return useContext(AuthContext)
}
