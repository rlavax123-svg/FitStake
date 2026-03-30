'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  useAllChallenges,
  useEthPrice,
  ethToFiat,
  timeRemaining,
  STATE_LABELS,
  TYPE_LABELS,
} from '@/lib/hooks'
import { useUnits } from '@/lib/use-units'

type Filter = 'all' | 'group' | 'h2h' | 'endurance' | 'best' | 'live'

const TYPE_CLASSES = ['type-group', 'type-h2h', 'type-endurance', 'type-best', 'type-live'] as const
const TYPE_DOTS = ['bg-blue-500', 'bg-orange-500', 'bg-purple-500', 'bg-emerald-500', 'bg-red-500'] as const

export default function BrowseChallenges() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data: challenges, isLoading } = useAllChallenges()
  const { data: ethPrice } = useEthPrice()
  const { formatDistance, unit } = useUnits()
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

  const filtered = (challenges || []).filter((c) => {
    if (c.state >= 3) return false
    if (c.state <= 1 && Number(c.endTime) <= nowSec) return false
    if (filter === 'group') return c.challengeType === 0
    if (filter === 'h2h') return c.challengeType === 1
    if (filter === 'endurance') return c.challengeType === 2
    if (filter === 'best') return c.challengeType === 3
    if (filter === 'live') return c.challengeType === 4
    return true
  })

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'group', label: 'Group' },
    { key: 'h2h', label: '1v1' },
    { key: 'endurance', label: 'Endurance' },
    { key: 'best', label: 'Best Effort' },
    { key: 'live', label: 'Live' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-t1">Challenges</h1>
        <Link
          href="/challenges/create"
          className="bg-coral-500 hover:bg-coral-600 text-white text-sm px-4 py-2 rounded-xl font-semibold transition-colors shadow-sm"
        >
          + Create
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-coral-500 text-white shadow-sm'
                : 'bg-surface text-t2 hover:text-t1 border border-edge'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3 stagger">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse-soft">
              <div className="h-5 bg-edge-subtle rounded w-2/5 mb-2" />
              <div className="h-4 bg-edge-subtle rounded w-3/5" />
            </div>
          ))}
        </div>
      )}

      {/* Challenge Cards */}
      {!isLoading && (
        <div className="space-y-3 stagger">
          {filtered.map((c) => {
            const remaining = timeRemaining(c.endTime)
            const dist = formatDistance(c.distanceGoalCm)
            const typeClass = TYPE_CLASSES[c.challengeType] || 'type-group'
            const dotClass = TYPE_DOTS[c.challengeType] || 'bg-blue-500'
            const typeLabel = TYPE_LABELS[c.challengeType] || 'Unknown'
            const stateLabel = STATE_LABELS[c.state] || 'Unknown'

            return (
              <Link
                key={c.id}
                href={`/challenges/${c.id}`}
                className={`card card-interactive accent-stripe ${typeClass} block p-4 pl-5`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-t1">
                        {metadata[c.id]?.name || `Challenge #${c.id}`}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.state === 0
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-400'
                        }`}
                      >
                        {stateLabel}
                      </span>
                    </div>
                    <p className="text-sm text-t2">
                      {dist} {unit}
                      <span className="text-t3"> · </span>
                      {remaining}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-mint-500 text-lg">
                      {metadata[c.id]?.stakeGbp
                        ? `£${metadata[c.id].stakeGbp!.toFixed(2)}`
                        : ethToFiat(c.stakeAmount, ethPrice)}
                    </div>
                    <div className="text-xs text-t3">to enter</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-t3">
                    <span className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      {typeLabel}
                    </span>
                    <span>
                      {Number(c.participantCount)}
                      {c.maxParticipants > 0n ? `/${Number(c.maxParticipants)}` : ''} runners
                    </span>
                    <span>
                      {metadata[c.id]?.stakeGbp
                        ? `£${(metadata[c.id].stakeGbp! * Number(c.participantCount)).toFixed(2)}`
                        : ethToFiat(c.totalStaked, ethPrice)}{' '}
                      pot
                    </span>
                  </div>
                  {c.state === 0 && (
                    <span className="bg-coral-500/10 text-coral-600 dark:text-coral-400 text-xs font-semibold px-3 py-1 rounded-lg">
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
        <div className="card p-12 text-center">
          <p className="text-t3 mb-2">No challenges found</p>
          <Link
            href="/challenges/create"
            className="text-coral-500 hover:text-coral-600 text-sm font-semibold transition-colors"
          >
            Be the first to create one
          </Link>
        </div>
      )}
    </div>
  )
}
