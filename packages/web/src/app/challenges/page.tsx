'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  useAllChallenges,
  useEthPrice,
  formatStake,
  ethToFiat,
  cmToKm,
  daysRemaining,
  STATE_LABELS,
  TYPE_LABELS,
} from '@/lib/hooks'

type Filter = 'all' | 'group' | 'h2h'

export default function BrowseChallenges() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data: challenges, isLoading } = useAllChallenges()
  const { data: ethPrice } = useEthPrice()

  const [metadata, setMetadata] = useState<Record<number, { name: string; stakeGbp: number | null }>>({})

  useEffect(() => {
    if (!challenges || challenges.length === 0) return
    const ids = challenges.map((c) => c.id).join(',')
    fetch(`/api/challenges/metadata?ids=${ids}`)
      .then((r) => r.json())
      .then((d) => setMetadata(d.metadata || {}))
      .catch(() => {})
  }, [challenges])

  const filtered = (challenges || []).filter((c) => {
    // Hide cancelled/settled
    if (c.state >= 3) return false
    if (filter === 'group') return c.challengeType === 0
    if (filter === 'h2h') return c.challengeType === 1
    return true
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Browse Challenges</h1>
        <Link
          href="/challenges/create"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
        >
          + Create
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'all' as Filter, label: 'All' },
          { key: 'group' as Filter, label: 'Group Goals' },
          { key: 'h2h' as Filter, label: 'Head-to-Head' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm transition ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 animate-pulse">Loading challenges from chain...</p>
        </div>
      )}

      {/* Challenge Cards */}
      {!isLoading && (
        <div className="space-y-3">
          {filtered.map((c) => {
            const days = daysRemaining(c.endTime)
            const distKm = cmToKm(c.distanceGoalCm)
            const stakeUsd = ethToFiat(c.stakeAmount, ethPrice)
            const potUsd = ethToFiat(c.totalStaked, ethPrice)
            const stateLabel = STATE_LABELS[c.state] || 'Unknown'
            const typeLabel = TYPE_LABELS[c.challengeType] || 'Unknown'

            return (
              <Link
                key={c.id}
                href={`/challenges/${c.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{metadata[c.id]?.name || `Challenge #${c.id}`}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          c.state === 0
                            ? 'bg-blue-500/10 text-blue-400'
                            : c.state === 1
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-zinc-700 text-zinc-400'
                        }`}
                      >
                        {stateLabel}
                      </span>
                      <span className="text-xs text-zinc-600">{typeLabel}</span>
                    </div>
                    <p className="text-sm text-zinc-400">
                      Run {distKm}km &middot; {days} days remaining
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-medium">{metadata[c.id]?.stakeGbp ? `£${metadata[c.id].stakeGbp!.toFixed(2)}` : ethToFiat(c.stakeAmount, ethPrice)}</div>
                    <div className="text-xs text-zinc-500">per runner</div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-zinc-500">
                    {Number(c.participantCount)}{c.maxParticipants > 0n ? `/${Number(c.maxParticipants)}` : ''} runners &middot; {potUsd} pot
                  </div>
                  {c.state === 0 && (
                    <span className="bg-indigo-600/20 text-indigo-400 text-sm px-3 py-1 rounded-lg">
                      Join
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 mb-3">No challenges yet</p>
          <Link
            href="/challenges/create"
            className="text-indigo-400 hover:text-indigo-300 text-sm transition"
          >
            Be the first to create one
          </Link>
        </div>
      )}
    </div>
  )
}
