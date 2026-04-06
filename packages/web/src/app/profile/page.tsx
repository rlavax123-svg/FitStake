'use client'

import { useAuth } from '@/lib/use-auth'
import { useUnits } from '@/lib/use-units'
import { useEffect, useState } from 'react'

interface Run {
  id: number
  name: string
  distanceKm: string
  durationMin: number
  pace: string
  date: string
  elevationM: number
  manual: boolean
  flagged: boolean
}

interface Stats {
  totalDistanceKm: string
  totalRuns: number
}

interface UserChallenge {
  challengeId: number
  name: string
  stakeGbp: number
  state: number
  distanceGoalKm: number
  won: boolean
  payoutGbp: number
}

interface Transaction {
  id: string
  type: 'topup' | 'stake' | 'refund' | 'winnings'
  amount: number
  chain_challenge_id: number | null
  challenge_name: string | null
  tx_hash: string | null
  created_at: string
}

export default function Profile() {
  const { authenticated, login, user } = useAuth()
  const { unit } = useUnits()
  const [runs, setRuns] = useState<Run[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState<number | null>(null)
  const [isTopping, setIsTopping] = useState(false)
  const [myChallenges, setMyChallenges] = useState<UserChallenge[]>([])
  const [challengesLoading, setChallengesLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [txExpanded, setTxExpanded] = useState(false)

  useEffect(() => {
    if (!authenticated) return
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [authenticated])

  const handleTopUp = async () => {
    setIsTopping(true)
    try {
      const res = await fetch('/api/balance/topup', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setBalance(data.balance)
        window.dispatchEvent(new Event('balance-updated'))
      }
    } catch {
    } finally {
      setIsTopping(false)
    }
  }

  useEffect(() => {
    if (!authenticated) return
    setChallengesLoading(true)
    fetch('/api/me/challenges')
      .then((res) => res.json())
      .then((data) => {
        if (data.challenges) setMyChallenges(data.challenges)
      })
      .catch(() => {})
      .finally(() => setChallengesLoading(false))
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) return
    setTxLoading(true)
    fetch('/api/me/transactions')
      .then((res) => res.json())
      .then((data) => {
        if (data.transactions) setTransactions(data.transactions)
      })
      .catch(() => {})
      .finally(() => setTxLoading(false))
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) return
    setLoading(true)
    fetch('/api/me/activities')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setRuns(data.runs || [])
          setStats(data.stats || null)
        }
      })
      .catch(() => setError('Failed to load activities'))
      .finally(() => setLoading(false))
  }, [authenticated])

  if (!authenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-t1 mb-3">Profile</h1>
        <p className="text-t2 mb-6">Sign in to view your profile</p>
        <button
          onClick={login}
          className="bg-[#FC4C02] hover:bg-[#e04400] text-white px-6 py-2.5 rounded-xl font-semibold transition-colors flex items-center gap-2 mx-auto"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Sign in with Strava
        </button>
      </div>
    )
  }

  const KM_PER_MILE = 1.60934
  const kmToDisplay = (km: number) => (unit === 'mi' ? (km / KM_PER_MILE).toFixed(1) : km.toFixed(1))
  const unitLabel = unit === 'mi' ? 'miles' : 'km'

  const formatTimeAgo = (dateStr: string) => {
    const then = new Date(dateStr).getTime()
    if (isNaN(then)) return 'Unknown'
    const diffMs = Date.now() - then
    if (diffMs < 0) return 'just now'
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDays = Math.floor(diffHr / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const totalKm = parseFloat(stats?.totalDistanceKm || '0')
  const weeklyAvg = totalKm / 4
  const suggestions = [
    {
      label: 'Easy',
      desc: 'A comfortable goal you can hit without changing your routine',
      km: weeklyAvg > 30 ? 50 : weeklyAvg > 15 ? 30 : weeklyAvg > 5 ? 15 : 5,
      color: 'text-mint-500',
      bg: 'bg-mint-50 dark:bg-mint-500/5 border-mint-200 dark:border-mint-500/20',
    },
    {
      label: 'Challenging',
      desc: "You'll need to stay consistent and push on a few runs",
      km: weeklyAvg > 30 ? 100 : weeklyAvg > 15 ? 60 : weeklyAvg > 5 ? 30 : 15,
      color: 'text-coral-500',
      bg: 'bg-coral-50 dark:bg-coral-500/5 border-coral-200 dark:border-coral-500/20',
    },
    {
      label: 'Ambitious',
      desc: 'A real stretch — expect to dig deep and earn every km',
      km: weeklyAvg > 30 ? 160 : weeklyAvg > 15 ? 100 : weeklyAvg > 5 ? 50 : 25,
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20',
    },
  ]

  const validRuns = runs.filter((r) => !r.manual && !r.flagged)
  const invalidRuns = runs.filter((r) => r.manual || r.flagged)

  const settled = myChallenges.filter((c) => c.state === 3)
  const wins = settled.filter((c) => c.won).length
  const losses = settled.filter((c) => !c.won).length
  const earned = settled.reduce((sum, c) => sum + c.payoutGbp, 0)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      {/* User Info */}
      <div className="flex items-center gap-4 mb-8">
        {user?.image ? (
          <img src={user.image} alt="" className="w-14 h-14 rounded-2xl ring-2 ring-edge" />
        ) : (
          <div className="w-14 h-14 bg-coral-500 rounded-2xl flex items-center justify-center text-xl font-bold text-white">
            {(user?.name?.[0] || 'R').toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-display text-xl font-bold text-t1">{user?.name || 'Runner'}</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 bg-[#FC4C02] rounded-full" />
            <span className="text-xs text-t3">Strava connected</span>
          </div>
        </div>
      </div>

      {/* Running Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6 stagger">
          <div className="card p-4 text-center">
            <div className="font-display text-2xl font-bold text-coral-500">{kmToDisplay(totalKm)}</div>
            <div className="text-xs text-t3 mt-0.5">{unitLabel} this month</div>
          </div>
          <div className="card p-4 text-center">
            <div className="font-display text-2xl font-bold text-t1">{stats.totalRuns}</div>
            <div className="text-xs text-t3 mt-0.5">runs</div>
          </div>
          <div className="card p-4 text-center">
            <div className="font-display text-2xl font-bold text-t1">
              {unit === 'mi' ? (weeklyAvg / KM_PER_MILE).toFixed(0) : weeklyAvg.toFixed(0)}
            </div>
            <div className="text-xs text-t3 mt-0.5">{unitLabel}/week</div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {stats && (
        <div className="mb-6">
          <h2 className="font-display text-lg font-bold text-t1 mb-1">Suggested Challenges</h2>
          <p className="text-xs text-t3 mb-3">
            Based on your {kmToDisplay(totalKm)} {unitLabel} this month
          </p>
          <div className="space-y-2 stagger">
            {suggestions.map((s) => (
              <a
                key={s.label}
                href={`/challenges/create`}
                className={`card card-interactive block p-4 border ${s.bg}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-display font-bold text-sm ${s.color}`}>{s.label}</span>
                  <span className="font-display font-bold text-t1">
                    {kmToDisplay(s.km)} {unitLabel}
                    <span className="text-t3 font-normal text-xs"> in 30 days</span>
                  </span>
                </div>
                <p className="text-xs text-t2">{s.desc}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Verification */}
      {runs.length > 0 && (
        <div className="card p-4 mb-6">
          <p className="text-xs font-bold text-t3 uppercase tracking-wider mb-2">Verification</p>
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-mint-500 rounded-full" />
              <span className="text-t1 font-medium">{validRuns.length} verified</span>
            </span>
            {invalidRuns.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-400 rounded-full" />
                <span className="text-t2">{invalidRuns.length} excluded</span>
              </span>
            )}
          </div>
          <p className="text-xs text-t3 mt-2">
            Only GPS-verified, non-manual runs count toward challenges.
          </p>
        </div>
      )}

      {/* Balance */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-t3 mb-0.5">Balance</p>
            <p className="font-display text-3xl font-bold text-mint-500">
              £{balance !== null ? balance.toFixed(2) : '...'}
            </p>
          </div>
          <button
            onClick={handleTopUp}
            disabled={isTopping}
            className="bg-mint-500 hover:bg-mint-600 disabled:bg-edge disabled:text-t3 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors"
          >
            {isTopping ? 'Adding...' : 'Top Up £50'}
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="mb-6">
        <h2 className="font-display text-lg font-bold text-t1 mb-3">Transactions</h2>
        {txLoading ? (
          <div className="card divide-y divide-edge">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 flex items-center justify-between animate-pulse-soft">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-5 bg-edge-subtle rounded-full" />
                  <div>
                    <div className="w-28 h-4 bg-edge-subtle rounded mb-1" />
                    <div className="w-14 h-3 bg-edge-subtle rounded" />
                  </div>
                </div>
                <div className="w-14 h-5 bg-edge-subtle rounded" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-t3 mb-1">No transactions yet.</p>
            <a
              href="/challenges/create"
              className="text-coral-500 hover:text-coral-600 text-sm font-semibold transition-colors"
            >
              Create a challenge to get started
            </a>
          </div>
        ) : (
          <div className="card divide-y divide-edge overflow-hidden">
            {(txExpanded ? transactions : transactions.slice(0, 5)).map((tx) => {
              const badge = {
                topup: { label: 'Top-up', cls: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' },
                stake: { label: 'Staked', cls: 'bg-coral-100 dark:bg-coral-500/10 text-coral-600 dark:text-coral-400' },
                winnings: { label: 'Won', cls: 'bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400' },
                refund: { label: 'Refund', cls: 'bg-edge text-t2' },
              }[tx.type] ?? { label: tx.type, cls: 'bg-edge text-t2' }

              const isPositive = tx.type !== 'stake'
              const absAmount = Math.abs(tx.amount).toFixed(2)

              return (
                <div key={tx.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <div>
                      <div className="text-sm text-t1">
                        {tx.challenge_name ? (
                          <a
                            href={`/challenges/${tx.chain_challenge_id}`}
                            className="hover:text-coral-500 transition-colors"
                          >
                            {tx.challenge_name}
                          </a>
                        ) : tx.type === 'topup' ? (
                          'Balance top-up'
                        ) : (
                          `Challenge #${tx.chain_challenge_id}`
                        )}
                      </div>
                      <div className="text-xs text-t3">{formatTimeAgo(tx.created_at)}</div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold font-display ${
                      isPositive ? 'text-mint-500' : 'text-red-500'
                    }`}
                  >
                    {isPositive ? '+' : '-'}£{absAmount}
                  </span>
                </div>
              )
            })}
            {transactions.length > 5 && (
              <button
                onClick={() => setTxExpanded(!txExpanded)}
                className="w-full p-3 text-sm font-semibold text-coral-500 hover:text-coral-600 hover:bg-coral-500/5 transition-colors text-center"
              >
                {txExpanded ? 'Show less' : `View all ${transactions.length} transactions`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* FitStake Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 stagger">
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-bold text-mint-500">{wins}</div>
          <div className="text-xs text-t3 mt-0.5">Wins</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-bold text-red-500">{losses}</div>
          <div className="text-xs text-t3 mt-0.5">Losses</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-display text-2xl font-bold text-coral-500">
            {earned > 0 ? `£${earned.toFixed(2)}` : '£0'}
          </div>
          <div className="text-xs text-t3 mt-0.5">Earned</div>
        </div>
      </div>

      {/* Completed Challenges */}
      {challengesLoading ? (
        <div className="mb-6">
          <h2 className="font-display text-lg font-bold text-t1 mb-3">Completed</h2>
          <div className="card p-8 text-center">
            <p className="text-t3 animate-pulse-soft">Loading challenges...</p>
          </div>
        </div>
      ) : settled.length > 0 ? (
        <div className="mb-6">
          <h2 className="font-display text-lg font-bold text-t1 mb-3">Completed</h2>
          <div className="space-y-2 stagger">
            {settled.map((c) => (
              <a
                key={c.challengeId}
                href={`/challenges/${c.challengeId}`}
                className="card card-interactive block p-3"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-t1">{c.name}</span>
                    {c.won ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400 font-semibold">
                        Won
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">
                        Lost
                      </span>
                    )}
                  </div>
                  {c.won && c.payoutGbp > 0 && (
                    <span className="text-sm font-bold font-display text-mint-500">
                      +£{c.payoutGbp.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-t3">
                  {kmToDisplay(c.distanceGoalKm)} {unitLabel} goal · £{c.stakeGbp.toFixed(2)} stake
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent Runs */}
      <div>
        <h2 className="font-display text-lg font-bold text-t1 mb-3">Recent Runs</h2>
        {loading && (
          <div className="card p-8 text-center">
            <p className="text-t3 animate-pulse-soft">Loading your Strava runs...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}
        {!loading && !error && runs.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-t3">No runs in the last 30 days. Time to lace up!</p>
          </div>
        )}
        {!loading && runs.length > 0 && (
          <div className="space-y-2 stagger mb-4">
            {runs.map((run) => {
              const date = new Date(run.date)
              const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              const isValid = !run.manual && !run.flagged

              return (
                <a
                  key={run.id}
                  href={`https://www.strava.com/activities/${run.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`card card-interactive p-3 flex items-center justify-between ${
                    !isValid ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-t3 w-12 font-medium">{dateStr}</div>
                    <div>
                      <div className="text-sm font-medium text-t1 flex items-center gap-2">
                        {run.name}
                        {!isValid && (
                          <span className="text-xs text-red-500 bg-red-100 dark:bg-red-500/10 px-1.5 py-0.5 rounded font-semibold">
                            {run.manual ? 'manual' : 'flagged'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-t3">
                        {run.pace} · {run.durationMin}min
                        {run.elevationM > 0 && ` · ${run.elevationM}m elev`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-display text-coral-500">
                      {kmToDisplay(parseFloat(run.distanceKm))} {unitLabel}
                    </div>
                    {isValid && <div className="text-xs text-mint-500 font-medium">verified</div>}
                  </div>
                </a>
              )
            })}
          </div>
        )}
        {!loading && runs.length > 0 && (
          <a
            href="https://www.strava.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-t3 hover:text-[#FC4C02] transition-colors mt-3"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Powered by Strava
          </a>
        )}
      </div>
    </div>
  )
}
