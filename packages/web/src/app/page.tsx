'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/use-auth'
import { useAllChallenges, useEthPrice, ethToFiat, timeRemaining, STATE_LABELS, TYPE_LABELS } from '@/lib/hooks'
import { useUnits } from '@/lib/use-units'
import Link from 'next/link'

const TYPE_CLASSES = ['type-group', 'type-h2h', 'type-endurance', 'type-best', 'type-live'] as const

export default function Home() {
  const { ready, authenticated, login } = useAuth()

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse-soft text-t3">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <LandingPage onLogin={login} />
  }

  return <Dashboard />
}

/* ────────────────────────────────────────────────────────────── */
/*  Landing Page                                                  */
/* ────────────────────────────────────────────────────────────── */

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Hero */}
      <section className="py-16 sm:py-24 animate-fade-up">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-coral-500/10 text-coral-600 dark:text-coral-400 text-sm font-semibold mb-6">
            <span className="w-1.5 h-1.5 bg-coral-500 rounded-full" />
            Now in beta
          </div>

          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.1] mb-5 text-t1">
            Put your money
            <br />
            where your <span className="text-coral-500">miles</span> are
          </h1>

          <p className="text-lg sm:text-xl text-t2 max-w-lg mx-auto mb-8 leading-relaxed">
            Commit real money to running challenges. Hit your goal and earn it back.
            Miss it and your stake goes to those who showed up. No excuses.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onLogin}
              className="w-full sm:w-auto bg-[#FC4C02] hover:bg-[#e04400] text-white text-lg px-8 py-3.5 rounded-xl font-bold transition-colors inline-flex items-center justify-center gap-3 shadow-lg shadow-[#FC4C02]/20"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Sign in with Strava
            </button>
            <span className="text-sm text-t3">Free to join. Takes 10 seconds.</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="pb-16 sm:pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
          {[
            {
              num: '01',
              title: 'Stake it',
              desc: 'Create or join a challenge. Choose your distance, timeframe, and how much you want to put on the line.',
              accent: 'text-coral-500',
            },
            {
              num: '02',
              title: 'Run it',
              desc: 'Track your runs with Strava like you already do. We verify every activity automatically — no manual logging.',
              accent: 'text-blue-500',
            },
            {
              num: '03',
              title: 'Earn it',
              desc: "Hit your goal? You get your stake back, plus a share from those who didn't. Settled instantly.",
              accent: 'text-mint-500',
            },
          ].map((step) => (
            <div key={step.num} className="p-6 rounded-2xl" style={{ background: 'var(--surface)' }}>
              <div className={`font-display text-3xl font-bold ${step.accent} mb-3`}>
                {step.num}
              </div>
              <h3 className="font-display font-bold text-lg text-t1 mb-2">{step.title}</h3>
              <p className="text-sm text-t2 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Challenge Types */}
      <section className="pb-16 sm:pb-24 animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2 className="font-display text-2xl font-bold text-t1 mb-6 text-center">Five ways to compete</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { name: 'Group Goal', desc: 'Hit the distance, earn your stake back', color: 'bg-blue-500' },
            { name: 'Head-to-Head', desc: 'Most distance by deadline', color: 'bg-orange-500' },
            { name: 'Endurance', desc: 'First to the distance', color: 'bg-purple-500' },
            { name: 'Best Effort', desc: 'Fastest single run', color: 'bg-emerald-500' },
            { name: 'Live Race', desc: 'Real-time GPS racing', color: 'bg-red-500' },
          ].map((type) => (
            <div
              key={type.name}
              className="p-4 rounded-xl text-center"
              style={{ background: 'var(--surface)' }}
            >
              <div className={`w-3 h-3 ${type.color} rounded-full mx-auto mb-3`} />
              <div className="font-display font-semibold text-sm text-t1">{type.name}</div>
              <div className="text-xs text-t3 mt-1">{type.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="pb-12 text-center">
        <p className="text-sm text-t3 max-w-md mx-auto leading-relaxed">
          Stakes held in smart contracts — not our database.
          Runs verified by Strava GPS data.
          Nobody can cheat. Not even us.
        </p>
      </section>

      {/* Strava Attribution */}
      <footer className="pb-20 flex flex-col items-center gap-3">
        <a
          href="https://www.strava.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-t3 hover:text-[#FC4C02] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Powered by Strava
        </a>
        <div className="flex items-center gap-4 text-xs text-t3">
          <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" className="hover:text-t2 transition-colors">
            Strava API Agreement
          </a>
          <span>·</span>
          <a href="https://www.strava.com/legal/terms" target="_blank" rel="noopener noreferrer" className="hover:text-t2 transition-colors">
            Strava Terms
          </a>
        </div>
      </footer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────── */
/*  Dashboard                                                     */
/* ────────────────────────────────────────────────────────────── */

function Dashboard() {
  const { data: challenges, isLoading } = useAllChallenges()
  const { data: ethPrice } = useEthPrice()
  const { formatDistance, unit } = useUnits()
  const { user } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [metadata, setMetadata] = useState<Record<number, { name: string; stakeGbp: number | null }>>({})

  useEffect(() => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!challenges || challenges.length === 0) return
    const ids = challenges.map((c) => c.id).join(',')
    fetch(`/api/challenges/metadata?ids=${ids}`)
      .then((r) => r.json())
      .then((d) => setMetadata(d.metadata || {}))
      .catch(() => {})
  }, [challenges])

  const nowSec = Math.floor(Date.now() / 1000)
  const activeChallenges = (challenges || []).filter(
    (c) => c.state <= 1 && Number(c.endTime) > nowSec
  )

  const firstName = user?.name?.split(' ')[0] || 'Runner'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      {/* Greeting + Balance */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-sm text-t3 mb-1">Welcome back</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-t1">{firstName}</h1>
        </div>
        {balance !== null && (
          <div className="text-right">
            <p className="text-xs text-t3 mb-0.5">Balance</p>
            <p className="font-display text-2xl font-bold text-mint-500">£{balance.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Link
          href="/challenges/create"
          className="card card-interactive p-5 flex flex-col items-start gap-2"
        >
          <div className="w-10 h-10 bg-coral-500/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-coral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="font-display font-semibold text-t1">Create Challenge</span>
          <span className="text-xs text-t3">Set a goal, commit to it</span>
        </Link>
        <Link
          href="/challenges"
          className="card card-interactive p-5 flex flex-col items-start gap-2"
        >
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <span className="font-display font-semibold text-t1">Browse Challenges</span>
          <span className="text-xs text-t3">Find something to join</span>
        </Link>
      </div>

      {/* Active Challenges */}
      <div>
        <h2 className="font-display text-lg font-bold text-t1 mb-3">Active Challenges</h2>
        {isLoading ? (
          <div className="space-y-3 stagger">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4 animate-pulse-soft">
                <div className="h-5 bg-edge-subtle rounded w-1/3 mb-2" />
                <div className="h-4 bg-edge-subtle rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : activeChallenges.length > 0 ? (
          <div className="space-y-3 stagger">
            {activeChallenges.map((c) => {
              const typeClass = TYPE_CLASSES[c.challengeType] || 'type-group'
              return (
                <Link
                  key={c.id}
                  href={`/challenges/${c.id}`}
                  className={`card card-interactive accent-stripe ${typeClass} block p-4 pl-5`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-display font-bold text-t1">
                          {metadata[c.id]?.name || `Challenge #${c.id}`}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            c.state === 0
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-400'
                          }`}
                        >
                          {STATE_LABELS[c.state]}
                        </span>
                      </div>
                      <p className="text-sm text-t2">
                        {formatDistance(c.distanceGoalCm)} {unit}
                        <span className="text-t3"> · </span>
                        {c.state === 0 && Number(c.startTime) > nowSec
                          ? `Starts ${timeRemaining(c.startTime)}`
                          : timeRemaining(c.endTime)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-mint-500">
                        {metadata[c.id]?.stakeGbp
                          ? `£${(metadata[c.id].stakeGbp! * Number(c.participantCount)).toFixed(2)}`
                          : ethToFiat(c.totalStaked, ethPrice)}
                      </div>
                      <div className="text-xs text-t3">pot</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-t3 mb-1">No active challenges yet</p>
            <Link
              href="/challenges/create"
              className="text-coral-500 hover:text-coral-600 text-sm font-semibold transition-colors"
            >
              Create your first challenge
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
