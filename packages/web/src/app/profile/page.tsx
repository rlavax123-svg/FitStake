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

  // Fetch balance
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
      // ignore
    } finally {
      setIsTopping(false)
    }
  }

  // Fetch user's challenges
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
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <p className="text-zinc-400 mb-6">Sign in to view your profile</p>
        <button
          onClick={login}
          className="bg-[#FC4C02] hover:bg-[#e04400] text-white px-6 py-2 rounded-lg transition"
        >
          Sign in with Strava
        </button>
      </div>
    )
  }

  const KM_PER_MILE = 1.60934
  const kmToDisplay = (km: number) => unit === 'mi' ? (km / KM_PER_MILE).toFixed(1) : km.toFixed(1)
  const unitLabel = unit === 'mi' ? 'miles' : 'km'

  const formatTimeAgo = (dateStr: string) => {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
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
  // Suggest challenges based on their running volume
  const weeklyAvg = totalKm / 4 // 30 days ≈ 4 weeks
  const suggestedGoalKm = weeklyAvg > 30 ? 100 : weeklyAvg > 15 ? 50 : weeklyAvg > 5 ? 20 : 10
  const suggestedGoal = `${kmToDisplay(suggestedGoalKm)} ${unitLabel}`

  // Count valid vs invalid runs for anti-cheat display
  const validRuns = runs.filter((r) => !r.manual && !r.flagged)
  const invalidRuns = runs.filter((r) => r.manual || r.flagged)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* User Info */}
      <div className="text-center mb-8">
        {user?.image ? (
          <img src={user.image} alt="" className="w-16 h-16 rounded-full mx-auto mb-3" />
        ) : (
          <div className="w-16 h-16 bg-[#FC4C02] rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
            {(user?.name?.[0] || 'R').toUpperCase()}
          </div>
        )}
        <h1 className="text-xl font-bold">{user?.name || 'Runner'}</h1>
        <div className="flex items-center justify-center gap-2 mt-1">
          <div className="w-3 h-3 bg-[#FC4C02] rounded-full" />
          <span className="text-sm text-zinc-400">Strava connected</span>
        </div>
      </div>

      {/* Running Stats (last 30 days) */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-indigo-400">{kmToDisplay(totalKm)}</div>
            <div className="text-xs text-zinc-500">{unitLabel} this month</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-indigo-400">{stats.totalRuns}</div>
            <div className="text-xs text-zinc-500">runs</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-indigo-400">{unit === 'mi' ? (weeklyAvg / KM_PER_MILE).toFixed(0) : weeklyAvg.toFixed(0)}</div>
            <div className="text-xs text-zinc-500">{unitLabel}/week avg</div>
          </div>
        </div>
      )}

      {/* Challenge Recommendation */}
      {stats && (
        <div className="bg-indigo-600/10 border border-indigo-600/30 rounded-xl p-4 mb-6">
          <div className="text-sm text-indigo-400 font-semibold mb-1">Recommended Challenge</div>
          <p className="text-zinc-300 text-sm">
            Based on your recent runs, you could take on a{' '}
            <span className="text-indigo-400 font-bold">{suggestedGoal} in 30 days</span> challenge.
            {weeklyAvg > 15
              ? " You're consistently running — this should be achievable with your current volume."
              : " Start with something comfortable and build from there."}
          </p>
        </div>
      )}

      {/* Anti-Cheat Status */}
      {runs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="text-sm font-semibold text-zinc-400 mb-2">Verification Status</div>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-zinc-300">{validRuns.length} verified runs</span>
            </div>
            {invalidRuns.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400 rounded-full" />
                <span className="text-zinc-400">
                  {invalidRuns.length} excluded (manual/flagged)
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Only GPS-verified, non-manual runs count toward challenges. Verified by Chainlink oracles.
          </p>
        </div>
      )}

      {/* Balance + Top Up */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-400">Your Balance</div>
            <div className="text-3xl font-bold text-green-400">
              £{balance !== null ? balance.toFixed(2) : '...'}
            </div>
          </div>
          <button
            onClick={handleTopUp}
            disabled={isTopping}
            className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            {isTopping ? 'Adding...' : 'Top Up £50'}
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
        {txLoading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-5 bg-zinc-800 rounded-full" />
                  <div>
                    <div className="w-32 h-4 bg-zinc-800 rounded mb-1" />
                    <div className="w-16 h-3 bg-zinc-800 rounded" />
                  </div>
                </div>
                <div className="w-16 h-5 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500">No transactions yet.</p>
            <a href="/challenges/create" className="text-indigo-400 hover:text-indigo-300 text-sm mt-1 inline-block">
              Create a challenge to get started
            </a>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {transactions.map((tx) => {
              const badge = {
                topup: { label: 'Top-up', cls: 'bg-blue-500/10 text-blue-400' },
                stake: { label: 'Staked', cls: 'bg-orange-500/10 text-orange-400' },
                winnings: { label: 'Won', cls: 'bg-green-500/10 text-green-400' },
                refund: { label: 'Refund', cls: 'bg-zinc-500/10 text-zinc-400' },
              }[tx.type]

              const isPositive = tx.type !== 'stake'
              const absAmount = Math.abs(tx.amount).toFixed(2)

              return (
                <div key={tx.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <div>
                      <div className="text-sm text-zinc-200">
                        {tx.challenge_name ? (
                          <a
                            href={`/challenges/${tx.chain_challenge_id}`}
                            className="hover:text-indigo-400 transition"
                          >
                            {tx.challenge_name}
                          </a>
                        ) : (
                          'Balance top-up'
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{formatTimeAgo(tx.created_at)}</div>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : '-'}£{absAmount}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FitStake Stats */}
      {(() => {
        const settled = myChallenges.filter((c) => c.state === 3)
        const wins = settled.filter((c) => c.won).length
        const losses = settled.filter((c) => !c.won).length
        const earned = settled.reduce((sum, c) => sum + c.payoutGbp, 0)
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{wins}</div>
              <div className="text-xs text-zinc-500">Wins</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{losses}</div>
              <div className="text-xs text-zinc-500">Losses</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">
                {earned > 0 ? `£${earned.toFixed(2)}` : '£0'}
              </div>
              <div className="text-xs text-zinc-500">Earned</div>
            </div>
          </div>
        )
      })()}

      {/* Completed Challenges */}
      {(() => {
        const settled = myChallenges.filter((c) => c.state === 3)
        if (challengesLoading) {
          return (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Completed Challenges</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <p className="text-zinc-500 animate-pulse">Loading challenges...</p>
              </div>
            </div>
          )
        }
        if (settled.length === 0) return null
        return (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Completed Challenges</h2>
            <div className="space-y-2">
              {settled.map((c) => (
                <a
                  key={c.challengeId}
                  href={`/challenges/${c.challengeId}`}
                  className="block bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">{c.name}</span>
                      {c.won ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Won</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Lost</span>
                      )}
                    </div>
                    {c.won && c.payoutGbp > 0 && (
                      <span className="text-sm font-bold text-green-400">+£{c.payoutGbp.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {kmToDisplay(c.distanceGoalKm)} {unitLabel} goal · £{c.stakeGbp.toFixed(2)} stake
                  </div>
                </a>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Recent Runs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Runs</h2>
        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500 animate-pulse">Loading your Strava runs...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {!loading && !error && runs.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-500">No runs in the last 30 days. Time to lace up!</p>
          </div>
        )}
        {!loading && runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((run) => {
              const date = new Date(run.date)
              const dateStr = date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })
              const isValid = !run.manual && !run.flagged

              return (
                <div
                  key={run.id}
                  className={`bg-zinc-900 border rounded-xl p-3 flex items-center justify-between ${
                    isValid ? 'border-zinc-800' : 'border-red-500/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-zinc-500 w-12">{dateStr}</div>
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {run.name}
                        {!isValid && (
                          <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                            {run.manual ? 'manual' : 'flagged'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {run.pace} &middot; {run.durationMin}min
                        {run.elevationM > 0 && ` · ${run.elevationM}m elevation`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-indigo-400">{kmToDisplay(parseFloat(run.distanceKm))} {unitLabel}</div>
                    {isValid && (
                      <div className="text-xs text-green-500">✓ verified</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
