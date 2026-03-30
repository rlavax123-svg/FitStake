'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/use-auth'
import { useUnits } from '@/lib/use-units'
import { useTheme } from '@/lib/use-theme'
import { useState, useEffect } from 'react'

export function Nav() {
  const { ready, authenticated, login, logout, user } = useAuth()
  const { unit, toggleUnit } = useUnits()
  const { theme, toggle: toggleTheme } = useTheme()
  const pathname = usePathname()
  const [balance, setBalance] = useState<number | null>(null)

  const refreshBalance = () => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }

  useEffect(() => {
    if (!authenticated) return
    refreshBalance()
    window.addEventListener('balance-updated', refreshBalance)
    return () => window.removeEventListener('balance-updated', refreshBalance)
  }, [authenticated])

  const isActive = (path: string) => pathname === path

  return (
    <>
      {/* ─── Desktop / Top Nav ─── */}
      <nav
        className="sticky top-0 z-50 border-b border-edge"
        style={{ background: 'var(--surface)', backdropFilter: 'blur(12px)' }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-coral-500 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="font-display font-bold text-lg text-t1">FitStake</span>
            </Link>

            {authenticated && (
              <div className="hidden sm:flex items-center gap-1">
                {[
                  { href: '/', label: 'Home' },
                  { href: '/challenges', label: 'Challenges' },
                  { href: '/challenges/create', label: 'Create' },
                  { href: '/profile', label: 'Profile' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? 'bg-coral-500/10 text-coral-600 dark:text-coral-400'
                        : 'text-t2 hover:text-t1 hover:bg-edge-subtle'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-t3 hover:text-t1 hover:bg-edge-subtle transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>

            {/* Unit toggle */}
            {authenticated && (
              <button
                onClick={toggleUnit}
                className="flex items-center text-xs font-semibold border border-edge rounded-lg overflow-hidden"
              >
                <span
                  className={`px-2 py-1 transition-colors ${
                    unit === 'km'
                      ? 'bg-coral-500 text-white'
                      : 'text-t3 hover:text-t2'
                  }`}
                >
                  km
                </span>
                <span
                  className={`px-2 py-1 transition-colors ${
                    unit === 'mi'
                      ? 'bg-coral-500 text-white'
                      : 'text-t3 hover:text-t2'
                  }`}
                >
                  mi
                </span>
              </button>
            )}

            {!ready ? (
              <div className="h-8 w-20 bg-edge-subtle rounded-lg animate-pulse-soft" />
            ) : authenticated ? (
              <div className="flex items-center gap-2">
                {balance !== null && (
                  <span className="text-sm font-bold text-mint-500 font-display">
                    £{balance.toFixed(2)}
                  </span>
                )}
                {user?.image && (
                  <img src={user.image} alt="" className="w-7 h-7 rounded-full ring-2 ring-edge" />
                )}
                <span className="text-sm text-t2 hidden sm:inline">{user?.name || 'Runner'}</span>
                <button
                  onClick={logout}
                  className="text-xs text-t3 hover:text-t1 transition-colors ml-1"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="bg-[#FC4C02] hover:bg-[#e04400] text-white text-sm px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Mobile Bottom Tab Bar ─── */}
      {authenticated && (
        <div
          className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-edge bottom-nav"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-center justify-around h-14 px-2">
            {[
              {
                href: '/',
                label: 'Home',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
                  </svg>
                ),
              },
              {
                href: '/challenges',
                label: 'Explore',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                ),
              },
              {
                href: '/challenges/create',
                label: 'Create',
                icon: (
                  <div className="w-10 h-10 bg-coral-500 rounded-xl flex items-center justify-center -mt-3 shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                ),
              },
              {
                href: '/profile',
                label: 'Profile',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
              },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                  isActive(tab.href)
                    ? 'text-coral-500'
                    : 'text-t3 hover:text-t2'
                }`}
              >
                {tab.icon}
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
