'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/use-auth'
import { useState, useEffect } from 'react'

export function Nav() {
  const { ready, authenticated, login, logout, user } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const refreshBalance = () => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }

  useEffect(() => {
    if (!authenticated) return
    refreshBalance()
    // Listen for balance changes from other components
    window.addEventListener('balance-updated', refreshBalance)
    return () => window.removeEventListener('balance-updated', refreshBalance)
  }, [authenticated])

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-indigo-400">
            FitStake
          </Link>
          {authenticated && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden text-zinc-400 hover:text-zinc-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          )}
          {authenticated && (
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/challenges" className="text-zinc-400 hover:text-zinc-100 transition">
                Challenges
              </Link>
              <Link
                href="/challenges/create"
                className="text-zinc-400 hover:text-zinc-100 transition"
              >
                Create
              </Link>
              <Link href="/profile" className="text-zinc-400 hover:text-zinc-100 transition">
                Profile
              </Link>
            </div>
          )}
        </div>

        <div>
          {!ready ? (
            <div className="h-8 w-20 bg-zinc-800 rounded animate-pulse" />
          ) : authenticated ? (
            <div className="flex items-center gap-3">
              {balance !== null && (
                <span className="text-sm font-medium text-green-400">
                  £{balance.toFixed(2)}
                </span>
              )}
              {user?.image && (
                <img
                  src={user.image}
                  alt=""
                  className="w-7 h-7 rounded-full"
                />
              )}
              <span className="text-sm text-zinc-400 hidden sm:inline">
                {user?.name || 'Runner'}
              </span>
              <button
                onClick={logout}
                className="text-sm text-zinc-400 hover:text-zinc-100 transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="bg-[#FC4C02] hover:bg-[#e04400] text-white text-sm px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Sign in with Strava
            </button>
          )}
        </div>
      </div>
      {mobileOpen && authenticated && (
        <div className="sm:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-2 space-y-2">
          <Link href="/challenges" className="block text-sm text-zinc-400 py-1" onClick={() => setMobileOpen(false)}>Challenges</Link>
          <Link href="/challenges/create" className="block text-sm text-zinc-400 py-1" onClick={() => setMobileOpen(false)}>Create</Link>
          <Link href="/profile" className="block text-sm text-zinc-400 py-1" onClick={() => setMobileOpen(false)}>Profile</Link>
        </div>
      )}
    </nav>
  )
}
