'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/use-auth'
import { useAllChallenges, useEthPrice, ethToFiat, timeRemaining, STATE_LABELS } from '@/lib/hooks'
import { useUnits } from '@/lib/use-units'
import Link from 'next/link'

export default function Home() {
  const { ready, authenticated, login } = useAuth()

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <LandingPage onLogin={login} />
  }

  return <Dashboard />
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-5xl sm:text-6xl font-bold mb-4">
          Bet on <span className="text-indigo-400">Your Runs</span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Stake money on your running goals. Complete the challenge and win. Fail and your stake goes
          to the winners. No cheating — verified by Chainlink oracles.
        </p>
        <button
          onClick={onLogin}
          className="bg-[#FC4C02] hover:bg-[#e04400] text-white text-lg px-8 py-3 rounded-xl font-semibold transition inline-flex items-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Sign in with Strava
        </button>
        <p className="text-zinc-600 text-sm mt-3">Free to join. Connect your Strava to get started.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
        {[
          {
            step: '1',
            title: 'Create or Join',
            desc: 'Set a running goal and stake. Invite friends or join public challenges.',
          },
          {
            step: '2',
            title: 'Run',
            desc: 'Track your runs with Strava. Our oracle verifies every activity automatically.',
          },
          {
            step: '3',
            title: 'Get Paid',
            desc: "Hit your goal? You split the pot from those who didn't. Settled instantly.",
          },
        ].map((item) => (
          <div
            key={item.step}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center"
          >
            <div className="w-10 h-10 bg-indigo-600/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              {item.step}
            </div>
            <h3 className="font-semibold mb-1">{item.title}</h3>
            <p className="text-sm text-zinc-400">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center text-zinc-500 text-sm">
        <p>
          Stakes held in smart contracts — not our database. Runs verified by Chainlink DON
          consensus. Nobody can cheat. Not even us.
        </p>
      </div>
    </div>
  )
}

function Dashboard() {
  const { data: challenges, isLoading } = useAllChallenges()
  const { data: ethPrice } = useEthPrice()
  const { formatDistance, unit } = useUnits()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [])

  const [metadata, setMetadata] = useState<Record<number, { name: string; stakeGbp: number | null }>>({})

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="text-sm text-zinc-400 mb-1">FitStake</div>
        <div className="text-xl font-bold text-zinc-100">Your Dashboard</div>
        <p className="text-sm text-zinc-500 mt-1">
          {balance !== null && <span className="text-green-400 font-medium">£{balance.toFixed(2)}</span>}
          {balance !== null && ' · '}
          {activeChallenges.length} active challenge{activeChallenges.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          href="/challenges/create"
          className="bg-indigo-600/10 border border-indigo-600/30 hover:border-indigo-500 rounded-xl p-4 text-center transition"
        >
          <div className="text-2xl mb-1">+</div>
          <div className="font-medium text-indigo-400">Create Challenge</div>
        </Link>
        <Link
          href="/challenges"
          className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 text-center transition"
        >
          <div className="text-2xl mb-1">🔍</div>
          <div className="font-medium text-zinc-300">Browse Challenges</div>
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Active Challenges</h2>
        {isLoading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 animate-pulse">Loading challenges...</p>
          </div>
        ) : activeChallenges.length > 0 ? (
          <div className="space-y-3">
            {activeChallenges.map((c) => (
              <Link
                key={c.id}
                href={`/challenges/${c.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{metadata[c.id]?.name || `Challenge #${c.id}`}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        c.state === 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-green-500/10 text-green-400'
                      }`}>
                        {STATE_LABELS[c.state]}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400">
                      {formatDistance(c.distanceGoalCm)} {unit} &middot;{' '}
                      {c.state === 0 && Number(c.startTime) > nowSec
                        ? `Joining open · Starts ${timeRemaining(c.startTime)}`
                        : timeRemaining(c.endTime)}
                    </p>
                  </div>
                  <div className="text-green-400 font-medium">{ethToFiat(c.totalStaked, ethPrice)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 mb-3">No active challenges yet</p>
            <Link
              href="/challenges/create"
              className="text-indigo-400 hover:text-indigo-300 text-sm transition"
            >
              Create your first challenge
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
