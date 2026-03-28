'use client'

import { useAuthContext } from '@/components/auth-provider'

export function useAuth() {
  const { ready, authenticated, user } = useAuthContext()

  return {
    ready,
    authenticated,
    login: () => {
      window.location.href = '/api/auth/login'
    },
    logout: () => {
      window.location.href = '/api/auth/logout'
    },
    user: user
      ? {
          name: user.name,
          image: user.image,
          stravaId: user.stravaId,
          email: null as { address?: string } | null,
          wallet: null as { address?: string } | null,
        }
      : null,
  }
}
