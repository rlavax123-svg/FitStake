'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  useChallenge,
  useParticipants,
  useEthPrice,
  ethToFiat,
  timeRemaining,
  STATE_LABELS,
  TYPE_LABELS,
} from '@/lib/hooks'
import { useAuth } from '@/lib/use-auth'
import { useUnits } from '@/lib/use-units'
import { useReadContracts } from 'wagmi'
import { useRouter } from 'next/navigation'
import { FITSTAKE_ADDRESS, FITSTAKE_ABI, CHAIN } from '@/lib/contracts'

const TYPE_DOTS = ['bg-blue-500', 'bg-orange-500', 'bg-purple-500', 'bg-emerald-500', 'bg-red-500'] as const
const PROGRESS_COLORS = ['bg-blue-500', 'bg-orange-500', 'bg-purple-500', 'bg-emerald-500', 'bg-red-500'] as const

export default function ChallengeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = parseInt(idStr)
  const router = useRouter()
  const { data: challenge, isLoading } = useChallenge(id)
  const { data: ethPrice } = useEthPrice()
  const { data: onChainParticipants } = useParticipants(id)
  const { authenticated } = useAuth()
  const { formatDistance, unit } = useUnits()

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
  const [participantTeams, setParticipantTeams] = useState<Record<number, number>>({})
  const [isTeamBattle, setIsTeamBattle] = useState(false)
  const [teamSizeMeta, setTeamSizeMeta] = useState(3)
  const [isPrivateChallenge, setIsPrivateChallenge] = useState(false)
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [creatorInviteCode, setCreatorInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Read invite code from URL params (for shared links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) setInviteCodeInput(code)
  }, [])

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
    const dist =
      distanceResults?.[i]?.status === 'success'
        ? Number(distanceResults[i].result as bigint)
        : 0
    return { address: addr, distanceCm: dist, originalIndex: i }
  })

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
    // Fetch challenge metadata (team battle, private status, invite code)
    fetch(`/api/challenges/metadata?ids=${id}`)
      .then((r) => r.json())
      .then((d) => {
        const m = d.metadata?.[id]
        if (m?.isTeamBattle) {
          setIsTeamBattle(true)
          setTeamSizeMeta(m.teamSize || 3)
        }
        if (m?.isPrivate) setIsPrivateChallenge(true)
        if (m?.inviteCode) setCreatorInviteCode(m.inviteCode)
      })
      .catch(() => {})
  }, [id, authenticated, joinSuccess])

  useEffect(() => {
    fetch(`/api/challenges/${id}/participants`)
      .then((r) => r.json())
      .then((d) => {
        if (d.participants) {
          const names: Record<number, string> = {}
          const teams: Record<number, number> = {}
          d.participants.forEach((p: { index: number; name: string; team?: number }) => {
            names[p.index] = p.name
            if (p.team) teams[p.index] = p.team
          })
          setParticipantNames(names)
          setParticipantTeams(teams)
        }
      })
      .catch(() => {})
  }, [id, joinSuccess])

  useEffect(() => {
    if (!authenticated) return
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [authenticated, joinSuccess])

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="animate-pulse-soft text-t3">Loading challenge...</div>
      </div>
    )
  }

  if (!challenge || challenge.id === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-t1 mb-2">Challenge Not Found</h1>
        <p className="text-t2 mb-4">This challenge doesn&apos;t exist yet.</p>
        <Link href="/challenges" className="text-coral-500 hover:text-coral-600 font-semibold transition-colors">
          Browse challenges
        </Link>
      </div>
    )
  }

  const distFormatted = formatDistance(challenge.distanceGoalCm)
  const remaining = timeRemaining(challenge.endTime)
  const stateLabel = STATE_LABELS[challenge.state] || 'Unknown'
  const typeLabel = isTeamBattle
    ? `Team Battle (${teamSizeMeta}v${teamSizeMeta})`
    : challenge.challengeType === 2
      ? 'Head-to-Head'
      : (TYPE_LABELS[challenge.challengeType] || 'Unknown')
  const dotClass = isTeamBattle ? 'bg-purple-500' : (TYPE_DOTS[challenge.challengeType] || 'bg-blue-500')
  const progressColor = PROGRESS_COLORS[challenge.challengeType] || 'bg-blue-500'
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const joinWindowOpen = challenge.state === 0 && challenge.startTime > nowSec
  const canJoin = joinWindowOpen && !isParticipant && authenticated && !joinSuccess
  const canCancel =
    challenge.state === 0 &&
    isCreator &&
    Number(challenge.participantCount) === 1 &&
    authenticated
  const isSettled = challenge.state === 3
  const isActive = challenge.state === 1

  const handleJoin = async () => {
    if (isPrivateChallenge && !inviteCodeInput) {
      setJoinError('Enter the invite code to join this private challenge')
      return
    }
    setIsJoining(true)
    setJoinError(null)
    try {
      const res = await fetch('/api/challenges/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: id,
          ...(isPrivateChallenge && inviteCodeInput ? { inviteCode: inviteCodeInput } : {}),
        }),
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
    if (!confirm('Cancel this challenge? Your stake will be refunded.')) return
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

  const maxDistanceCm = Math.max(...participantDistances.map((p) => p.distanceCm), 0)
  const goalCm = Number(challenge.distanceGoalCm)
  const progressPct = goalCm > 0 ? Math.min(100, (maxDistanceCm / goalCm) * 100) : 0
  const circumference = 2 * Math.PI * 52
  const dashArray = `${(progressPct / 100) * circumference} ${circumference}`

  const ringColor =
    isSettled
      ? '#a855f7'
      : challenge.challengeType === 0
        ? '#3B82F6'
        : challenge.challengeType === 1
          ? '#F97316'
          : challenge.challengeType === 2
            ? '#8B5CF6'
            : challenge.challengeType === 3
              ? '#10B981'
              : '#EF4444'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-t3">
            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
            {typeLabel}
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              challenge.state === 0
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : challenge.state === 1
                  ? 'bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-400'
                  : challenge.state === 3
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                    : challenge.state === 4
                      ? 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      : 'bg-edge text-t3'
            }`}
          >
            {stateLabel}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold text-t1 mb-1">
          {challengeName || `Challenge #${id}`}
        </h1>
        <p className="text-sm text-t2">
          {remaining}
          <span className="text-t3"> · </span>
          {stakeGbp
            ? `£${(stakeGbp * Number(challenge.participantCount)).toFixed(2)}`
            : ethToFiat(challenge.totalStaked, ethPrice)}{' '}
          pot
          <span className="text-t3"> · </span>
          {Number(challenge.participantCount)} runner
          {Number(challenge.participantCount) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Progress Ring */}
      <div className="flex justify-center mb-8">
        <div className="relative w-36 h-36">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={dashArray}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isActive || isSettled ? (
              <>
                <div className="font-display text-2xl font-bold text-t1">
                  {formatDistance(maxDistanceCm)}
                </div>
                <div className="text-xs text-t3">
                  / {distFormatted} {unit}
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-2xl font-bold text-t1">{distFormatted}</div>
                <div className="text-xs text-t3">{unit} goal</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settled Banner + Share Card */}
      {isSettled && (
        <div className="card p-4 mb-6 border-purple-200 dark:border-purple-500/20 bg-purple-50 dark:bg-purple-500/5">
          <p className="font-display font-bold text-purple-600 dark:text-purple-400 mb-1 text-center">
            Challenge Complete
          </p>
          <p className="text-sm text-t2 text-center mb-4">Results are final. Winnings distributed.</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = `${window.location.origin}/challenges/${id}`
                const myDist = participantDistances.find(
                  (p) => isParticipant && p.distanceCm === maxDistanceCm
                )
                const text = myDist && myDist.distanceCm >= goalCm
                  ? `I completed the "${challengeName || `Challenge #${id}`}" challenge on FitStake — ${formatDistance(myDist.distanceCm)} ${unit}!`
                  : `Check out the results of "${challengeName || `Challenge #${id}`}" on FitStake!`
                if (navigator.share) {
                  navigator.share({ title: 'FitStake Results', text, url })
                } else {
                  navigator.clipboard.writeText(text + ' ' + url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 rounded-xl py-2.5 text-sm font-bold text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? 'Copied!' : 'Share Results'}
            </button>
            <a
              href={`/api/og/challenge/${id}`}
              download={`fitstake-${challengeName || id}.png`}
              className="flex items-center justify-center gap-2 bg-edge-subtle hover:bg-edge rounded-xl px-4 py-2.5 text-sm font-medium text-t1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save Card
            </a>
          </div>
        </div>
      )}

      {/* Join Window */}
      {joinWindowOpen && (
        <div className="card p-3 mb-4 text-center bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20">
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Joining open · Starts {timeRemaining(challenge.startTime)}
          </span>
        </div>
      )}
      {challenge.state === 0 && !joinWindowOpen && (
        <div className="card p-3 mb-4 text-center">
          <p className="text-sm text-t3">Join window closed. Challenge starting soon.</p>
        </div>
      )}

      {/* Share / Invite */}
      {(isParticipant || isCreator || joinSuccess) && !isSettled && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-bold text-t3 uppercase tracking-wider mb-3">Invite Runners</h3>
          {isPrivateChallenge && creatorInviteCode && (
            <div className="mb-3">
              <p className="text-xs text-t3 mb-1">Invite code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-edge-subtle rounded-lg px-3 py-2 text-sm text-t1 font-mono">{creatorInviteCode}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(creatorInviteCode)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="px-3 py-2 rounded-lg bg-edge-subtle hover:bg-edge text-t2 text-sm transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = isPrivateChallenge && creatorInviteCode
                  ? `${window.location.origin}/challenges/${id}?code=${encodeURIComponent(creatorInviteCode)}`
                  : `${window.location.origin}/challenges/${id}`
                navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-edge-subtle hover:bg-edge rounded-xl py-2.5 text-sm font-medium text-t1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {copied ? 'Link Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={() => {
                const url = isPrivateChallenge && creatorInviteCode
                  ? `${window.location.origin}/challenges/${id}?code=${encodeURIComponent(creatorInviteCode)}`
                  : `${window.location.origin}/challenges/${id}`
                const text = `Join my FitStake challenge "${challengeName || `Challenge #${id}`}" — ${distFormatted} ${unit}, ${stakeGbp ? `£${stakeGbp.toFixed(2)}` : ''} stake!`
                if (navigator.share) {
                  navigator.share({ title: 'FitStake Challenge', text, url })
                } else {
                  const waUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`
                  window.open(waUrl, '_blank')
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-mint-500 hover:bg-mint-600 rounded-xl py-2.5 text-sm font-bold text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>
      )}

      {/* Invite Code Input (for private challenges) */}
      {isPrivateChallenge && canJoin && (
        <div className="mb-4">
          <label className="block text-sm font-semibold text-t2 mb-2">Invite Code</label>
          <input
            type="text"
            value={inviteCodeInput}
            onChange={(e) => setInviteCodeInput(e.target.value)}
            placeholder="Enter the invite code"
            className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
          />
        </div>
      )}

      {/* Join Button */}
      {canJoin && (
        <div className="mb-6">
          {joinError && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-3 text-center">
              <span className="text-red-600 dark:text-red-400 text-sm">{joinError}</span>
            </div>
          )}
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-coral-500 hover:bg-coral-600 disabled:bg-edge disabled:text-t3 text-white py-3.5 rounded-xl font-bold font-display transition-colors shadow-lg shadow-coral-500/20 disabled:shadow-none"
          >
            {isJoining
              ? 'Joining...'
              : `Join — Stake ${stakeGbp ? `£${stakeGbp.toFixed(2)}` : ethToFiat(challenge.stakeAmount, ethPrice)}`}
          </button>
          {balance !== null && (
            <p className="text-xs text-t3 text-center mt-2">Your balance: £{balance.toFixed(2)}</p>
          )}
        </div>
      )}

      {/* Participant status */}
      {(isParticipant || joinSuccess) && !isSettled && (
        <div className="card p-3 mb-6 text-center bg-mint-50 dark:bg-mint-500/5 border-mint-200 dark:border-mint-500/20">
          <span className="text-mint-600 dark:text-mint-400 text-sm font-semibold">
            {joinSuccess ? 'Successfully joined!' : "You're in this challenge"}
          </span>
        </div>
      )}

      {/* Live Race button */}
      {(isParticipant || joinSuccess) &&
        Number(challenge.challengeType) === 4 &&
        !isSettled && (
          <div className="mb-6">
            <Link
              href={`/challenges/${id}/race`}
              className="block w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-xl font-bold font-display text-center text-lg transition-colors shadow-lg shadow-red-500/20"
            >
              Go to Race
            </Link>
          </div>
        )}

      {/* Cancel */}
      {canCancel && (
        <div className="mb-6">
          {cancelError && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-3 text-center">
              <span className="text-red-600 dark:text-red-400 text-sm">{cancelError}</span>
            </div>
          )}
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5 disabled:opacity-50 py-3 rounded-xl font-semibold transition-colors"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Challenge'}
          </button>
          <p className="text-xs text-t3 text-center mt-2">
            Your stake of {stakeGbp ? `£${stakeGbp.toFixed(2)}` : ''} will be refunded
          </p>
        </div>
      )}

      {/* Leaderboard / Team View */}
      <div className="mb-6">
        {isTeamBattle ? (
          <>
            <h2 className="font-display text-lg font-bold text-t1 mb-3">
              Teams ({teamSizeMeta}v{teamSizeMeta})
            </h2>
            {(() => {
              const team1 = participantDistances.filter(p => participantTeams[p.originalIndex] === 1)
              const team2 = participantDistances.filter(p => participantTeams[p.originalIndex] === 2)
              const team1Total = team1.reduce((s, p) => s + p.distanceCm, 0)
              const team2Total = team2.reduce((s, p) => s + p.distanceCm, 0)
              const winning = team1Total > team2Total ? 1 : team2Total > team1Total ? 2 : 0

              return (
                <div className="space-y-4 stagger">
                  {[
                    { num: 1, members: team1, total: team1Total, color: 'coral', bar: 'bg-coral-500' },
                    { num: 2, members: team2, total: team2Total, color: 'blue', bar: 'bg-blue-500' },
                  ].map((team) => (
                    <div
                      key={team.num}
                      className={`card p-4 ${
                        isSettled && winning === team.num
                          ? 'bg-mint-50 dark:bg-mint-500/5 border-mint-200 dark:border-mint-500/20'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${team.bar}`} />
                          <span className="font-display font-bold text-t1">Team {team.num}</span>
                          {isSettled && winning === team.num && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400 font-semibold">
                              Winners
                            </span>
                          )}
                        </div>
                        {(isActive || isSettled) && (
                          <span className="font-display font-bold text-t1">
                            {formatDistance(team.total)} {unit}
                          </span>
                        )}
                      </div>
                      {(isActive || isSettled) && (
                        <div className="mb-3">
                          <div className="w-full h-2 bg-edge-subtle rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${team.bar}`}
                              style={{
                                width: `${Math.min(100, goalCm > 0 ? (team.total / goalCm) * 100 : 0)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {team.members
                          .sort((a, b) => b.distanceCm - a.distanceCm)
                          .map((p) => {
                            const name = participantNames[p.originalIndex] || `Runner #${p.originalIndex + 1}`
                            return (
                              <div key={p.address} className="flex items-center justify-between text-sm">
                                <span className="text-t2">{name}</span>
                                {(isActive || isSettled) && (
                                  <span className="text-t3 font-medium">
                                    {formatDistance(p.distanceCm)} {unit}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        {team.members.length === 0 && (
                          <p className="text-xs text-t3">Waiting for runners...</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </>
        ) : (
          <>
            <h2 className="font-display text-lg font-bold text-t1 mb-3">
              {isActive || isSettled ? 'Leaderboard' : 'Participants'} ({Number(challenge.participantCount)})
            </h2>
            <div className="space-y-2 stagger">
              {participantDistances
                .sort((a, b) => b.distanceCm - a.distanceCm)
                .map((p, i) => {
                  const distDisplay = formatDistance(p.distanceCm)
                  const pctOfGoal = goalCm > 0 ? Math.min(100, (p.distanceCm / goalCm) * 100) : 0
                  const metGoal = p.distanceCm >= goalCm
                  const name = participantNames[p.originalIndex] || `Runner #${p.originalIndex + 1}`

                  return (
                    <div
                      key={p.address}
                      className={`card p-3 ${
                        isSettled && metGoal
                          ? 'bg-mint-50 dark:bg-mint-500/5 border-mint-200 dark:border-mint-500/20'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-edge-subtle flex items-center justify-center text-xs font-bold text-t2">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-t1">{name}</span>
                          {isSettled && metGoal && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400 font-semibold">
                              Winner
                            </span>
                          )}
                        </div>
                        {(isActive || isSettled) && (
                          <span className="text-sm font-bold font-display text-t1">
                            {distDisplay} {unit}
                          </span>
                        )}
                      </div>
                      {(isActive || isSettled) && goalCm > 0 && (
                        <div className="ml-9">
                          <div className="w-full h-1.5 bg-edge-subtle rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                metGoal ? 'bg-mint-500' : progressColor
                              }`}
                              style={{ width: `${pctOfGoal}%` }}
                            />
                          </div>
                          <div className="text-xs text-t3 mt-0.5">{pctOfGoal.toFixed(0)}% of goal</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              {participantDistances.length === 0 &&
                Array.from({ length: Number(challenge.participantCount) }, (_, i) => (
                  <div
                    key={i}
                    className="card flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-edge-subtle flex items-center justify-center text-xs font-bold text-t2">
                        {i + 1}
                      </span>
                      <span className="text-sm text-t2">Runner #{i + 1}</span>
                    </div>
                    {i === 0 && <span className="text-xs text-t3">Creator</span>}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Details */}
      <div className="card p-4 mb-6">
        <h3 className="text-xs font-bold text-t3 uppercase tracking-wider mb-3">Details</h3>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
          <div>
            <div className="text-t3 text-xs">Type</div>
            <div className="font-medium text-t1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${dotClass}`} />
              {typeLabel}
            </div>
          </div>
          <div>
            <div className="text-t3 text-xs">Goal</div>
            <div className="font-medium text-t1">
              {distFormatted} {unit}
            </div>
          </div>
          <div>
            <div className="text-t3 text-xs">Stake</div>
            <div className="font-bold text-mint-500">
              {stakeGbp
                ? `£${stakeGbp.toFixed(2)}`
                : ethToFiat(challenge.stakeAmount, ethPrice)}{' '}
              per runner
            </div>
          </div>
          <div>
            <div className="text-t3 text-xs">Total Pot</div>
            <div className="font-bold text-mint-500">
              {stakeGbp
                ? `£${(stakeGbp * Number(challenge.participantCount)).toFixed(2)}`
                : ethToFiat(challenge.totalStaked, ethPrice)}
            </div>
          </div>
          <div>
            <div className="text-t3 text-xs">Runners</div>
            <div className="font-medium text-t1">
              {Number(challenge.participantCount)}
              {Number(challenge.maxParticipants) > 0
                ? ` / ${Number(challenge.maxParticipants)}`
                : ''}
            </div>
          </div>
          <div>
            <div className="text-t3 text-xs">Time</div>
            <div className="font-medium text-t1">{remaining}</div>
          </div>
        </div>
      </div>

      <div className="text-center">
        <Link
          href="/challenges"
          className="text-sm text-t3 hover:text-t1 transition-colors"
        >
          &larr; All challenges
        </Link>
      </div>
    </div>
  )
}
