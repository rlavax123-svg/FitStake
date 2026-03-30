'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  useChallenge,
  useParticipants,
  useEthPrice,
  formatStake,
  ethToFiat,
  cmToKm,
  timeRemaining,
  STATE_LABELS,
  TYPE_LABELS,
} from '@/lib/hooks'
import { useAuth } from '@/lib/use-auth'
import { useReadContracts } from 'wagmi'
import { useRouter } from 'next/navigation'
import { FITSTAKE_ADDRESS, FITSTAKE_ABI, CHAIN } from '@/lib/contracts'

export default function ChallengeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = parseInt(idStr)
  const router = useRouter()
  const { data: challenge, isLoading } = useChallenge(id)
  const { data: ethPrice } = useEthPrice()
  const { data: onChainParticipants } = useParticipants(id)
  const { authenticated } = useAuth()

  const [isParticipant, setIsParticipant] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [challengeName, setChallengeName] = useState<string | null>(null)
  const [stakeGbp, setStakeGbp] = useState<number | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [participantNames, setParticipantNames] = useState<Record<number, string>>({})

  // Fetch participant distances from chain
  const distanceContracts = (onChainParticipants || []).map((addr) => ({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getParticipantDistance' as const,
    args: [BigInt(id), addr],
    chainId: CHAIN.id,
  }))

  const { data: distanceResults } = useReadContracts({
    contracts: distanceContracts,
    query: { enabled: distanceContracts.length > 0 },
  })

  const participantDistances = (onChainParticipants || []).map((addr, i) => {
    const dist = distanceResults?.[i]?.status === 'success'
      ? Number(distanceResults[i].result as bigint)
      : 0
    return { address: addr, distanceCm: dist, originalIndex: i }
  })

  // Check participation and fetch metadata
  useEffect(() => {
    fetch(`/api/challenges/${id}/participation`)
      .then((r) => r.json())
      .then((d) => {
        setIsParticipant(d.isParticipant)
        setIsCreator(d.isCreator ?? false)
        if (d.name) setChallengeName(d.name)
        if (d.stakeGbp) setStakeGbp(d.stakeGbp)
      })
      .catch(() => {})
  }, [id, authenticated, joinSuccess])

  // Fetch participant names from Supabase
  useEffect(() => {
    fetch(`/api/challenges/${id}/participants`)
      .then((r) => r.json())
      .then((d) => {
        if (d.participants) {
          const names: Record<number, string> = {}
          d.participants.forEach((p: { index: number; name: string }) => {
            names[p.index] = p.name
          })
          setParticipantNames(names)
        }
      })
      .catch(() => {})
  }, [id, joinSuccess])

  // Fetch balance
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [authenticated, joinSuccess])

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse text-zinc-500">Loading challenge...</div>
      </div>
    )
  }

  if (!challenge || challenge.id === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Challenge Not Found</h1>
        <p className="text-zinc-400 mb-4">This challenge doesn&apos;t exist yet.</p>
        <Link href="/challenges" className="text-indigo-400 hover:text-indigo-300 transition">
          Browse challenges
        </Link>
      </div>
    )
  }

  const distKm = cmToKm(challenge.distanceGoalCm)
  const remaining = timeRemaining(challenge.endTime)
  const stateLabel = STATE_LABELS[challenge.state] || 'Unknown'
  const typeLabel = TYPE_LABELS[challenge.challengeType] || 'Unknown'
  const canJoin = challenge.state === 0 && !isParticipant && authenticated && !joinSuccess
  const canCancel = challenge.state === 0 && isCreator && Number(challenge.participantCount) === 1 && authenticated
  const isSettled = challenge.state === 3
  const isActive = challenge.state === 1

  const handleJoin = async () => {
    setIsJoining(true)
    setJoinError(null)
    try {
      const res = await fetch('/api/challenges/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join')
      setJoinSuccess(true)
      if (data.balance !== undefined) setBalance(data.balance)
      window.dispatchEvent(new Event('balance-updated'))
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsJoining(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this challenge? Your stake will be refunded.')) {
      return
    }
    setIsCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/challenges/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel')
      if (data.balance !== undefined) setBalance(data.balance)
      window.dispatchEvent(new Event('balance-updated'))
      router.push('/challenges')
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsCancelling(false)
    }
  }

  // Find best distance for progress ring
  const maxDistanceCm = Math.max(...participantDistances.map(p => p.distanceCm), 0)
  const goalCm = Number(challenge.distanceGoalCm)
  const progressPct = goalCm > 0 ? Math.min(100, (maxDistanceCm / goalCm) * 100) : 0
  const circumference = 2 * Math.PI * 52 // radius=52
  const dashArray = `${(progressPct / 100) * circumference} ${circumference}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span
            className={`text-xs px-3 py-1 rounded-full ${
              challenge.state === 0
                ? 'bg-blue-500/10 text-blue-400'
                : challenge.state === 1
                  ? 'bg-green-500/10 text-green-400'
                  : challenge.state === 3
                    ? 'bg-purple-500/10 text-purple-400'
                    : challenge.state === 4
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {stateLabel}
          </span>
          <span className="text-xs text-zinc-600">{typeLabel}</span>
        </div>
        <h1 className="text-2xl font-bold">{challengeName || `Challenge #${id}`}</h1>
        <p className="text-sm text-zinc-400">
          {remaining} &middot; {stakeGbp ? `£${(stakeGbp * Number(challenge.participantCount)).toFixed(2)}` : ethToFiat(challenge.totalStaked, ethPrice)} pot &middot;{' '}
          {Number(challenge.participantCount)} runner{Number(challenge.participantCount) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Progress ring */}
      <div className="flex justify-center mb-8">
        <div className="relative w-36 h-36">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#27272a" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={isSettled ? '#a855f7' : '#6366f1'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={dashArray}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isActive || isSettled ? (
              <>
                <div className="text-2xl font-bold text-indigo-400">
                  {(maxDistanceCm / 100_000).toFixed(1)}
                </div>
                <div className="text-xs text-zinc-400">/ {distKm} km</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-indigo-400">{distKm}</div>
                <div className="text-xs text-zinc-400">km goal</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settled results */}
      {isSettled && (
        <div className="mb-6 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 text-center">
          <div className="text-lg font-bold text-purple-400 mb-1">Challenge Complete</div>
          <p className="text-sm text-zinc-400">
            Results are final. Winnings have been distributed.
          </p>
        </div>
      )}

      {/* Join button */}
      {canJoin && (
        <div className="mb-6">
          {joinError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3 text-center">
              <span className="text-red-400 text-sm">{joinError}</span>
            </div>
          )}
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white py-3 rounded-xl font-semibold transition"
          >
            {isJoining
              ? 'Joining...'
              : `Join Challenge — Stake ${stakeGbp ? `£${stakeGbp.toFixed(2)}` : ethToFiat(challenge.stakeAmount, ethPrice)}`}
          </button>
          {balance !== null && (
            <p className="text-xs text-zinc-500 text-center mt-2">Your balance: £{balance.toFixed(2)}</p>
          )}
        </div>
      )}

      {(isParticipant || joinSuccess) && !isSettled && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
          <span className="text-green-400 text-sm font-medium">
            {joinSuccess ? 'Successfully joined!' : "You're in this challenge"}
          </span>
        </div>
      )}

      {/* Cancel button */}
      {canCancel && (
        <div className="mb-6">
          {cancelError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3 text-center">
              <span className="text-red-400 text-sm">{cancelError}</span>
            </div>
          )}
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white py-3 rounded-xl font-semibold transition"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Challenge'}
          </button>
          <p className="text-xs text-zinc-500 text-center mt-2">
            Your stake of {stakeGbp ? `£${stakeGbp.toFixed(2)}` : ''} will be refunded
          </p>
        </div>
      )}

      {/* Participant leaderboard */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">
          {isActive || isSettled ? 'Leaderboard' : 'Participants'} ({Number(challenge.participantCount)})
        </h2>
        <div className="space-y-2">
          {participantDistances
            .sort((a, b) => b.distanceCm - a.distanceCm)
            .map((p, i) => {
              const distanceKm = p.distanceCm / 100_000
              const pctOfGoal = goalCm > 0 ? Math.min(100, (p.distanceCm / goalCm) * 100) : 0
              const metGoal = p.distanceCm >= goalCm
              const name = participantNames[p.originalIndex] || `Runner #${p.originalIndex + 1}`

              return (
                <div
                  key={p.address}
                  className={`p-3 rounded-xl border ${
                    isSettled && metGoal
                      ? 'bg-green-500/5 border-green-500/30'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-zinc-500 font-mono">{i + 1}.</span>
                      <span className="text-sm text-zinc-300">{name}</span>
                      {isSettled && metGoal && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Winner</span>
                      )}
                    </div>
                    {(isActive || isSettled) && (
                      <span className="text-sm font-medium text-zinc-200">
                        {distanceKm.toFixed(1)} km
                      </span>
                    )}
                  </div>
                  {(isActive || isSettled) && goalCm > 0 && (
                    <div className="ml-9">
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            metGoal ? 'bg-green-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${pctOfGoal}%` }}
                        />
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{pctOfGoal.toFixed(0)}% of goal</div>
                    </div>
                  )}
                </div>
              )
            })}
          {participantDistances.length === 0 && (
            Array.from({ length: Number(challenge.participantCount) }, (_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-zinc-500">{i + 1}.</span>
                  <span className="text-sm text-zinc-300">Runner #{i + 1}</span>
                </div>
                {i === 0 && <span className="text-xs text-zinc-500">Creator</span>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Challenge details */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-zinc-400 mb-2">Challenge Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-zinc-500">Type</div>
            <div>{typeLabel}</div>
          </div>
          <div>
            <div className="text-zinc-500">Goal</div>
            <div>{distKm} km</div>
          </div>
          <div>
            <div className="text-zinc-500">Stake</div>
            <div className="text-green-400">{stakeGbp ? `£${stakeGbp.toFixed(2)}` : ethToFiat(challenge.stakeAmount, ethPrice)} per runner</div>
          </div>
          <div>
            <div className="text-zinc-500">Total Pot</div>
            <div className="text-green-400">{stakeGbp ? `£${(stakeGbp * Number(challenge.participantCount)).toFixed(2)}` : ethToFiat(challenge.totalStaked, ethPrice)}</div>
          </div>
          <div>
            <div className="text-zinc-500">Runners</div>
            <div>{Number(challenge.participantCount)}{Number(challenge.maxParticipants) > 0 ? ` / ${Number(challenge.maxParticipants)}` : ''}</div>
          </div>
          <div>
            <div className="text-zinc-500">Time</div>
            <div>{remaining}</div>
          </div>
        </div>
      </div>

      <div className="text-center">
        <Link href="/challenges" className="text-sm text-zinc-400 hover:text-zinc-100 transition">
          &larr; Back to challenges
        </Link>
      </div>
    </div>
  )
}
