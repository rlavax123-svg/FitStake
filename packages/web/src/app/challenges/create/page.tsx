'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/use-auth'
import { useUnits } from '@/lib/use-units'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type DurationUnit = 'hours' | 'days' | 'weeks'

function durationToMinutes(value: number, unit: DurationUnit): number {
  switch (unit) {
    case 'hours': return value * 60
    case 'days': return value * 1440
    case 'weeks': return value * 10080
  }
}

function formatDuration(value: string, unit: DurationUnit): string {
  const n = parseInt(value) || 0
  if (unit === 'hours') return `${n} hour${n !== 1 ? 's' : ''}`
  if (unit === 'days') return `${n} day${n !== 1 ? 's' : ''}`
  return `${n} week${n !== 1 ? 's' : ''}`
}

type UIMode = 'group' | 'h2h' | 'team' | 'best' | 'live'

const UI_TYPES: { mode: UIMode; name: string; desc: string; dot: string }[] = [
  { mode: 'group', name: 'Group Goal', desc: 'Hit the distance, split the pot', dot: 'bg-blue-500' },
  { mode: 'h2h', name: 'Head-to-Head', desc: '1v1 — race or outlast your opponent', dot: 'bg-orange-500' },
  { mode: 'team', name: 'Team Battle', desc: 'Team vs team — combined distance wins', dot: 'bg-purple-500' },
  { mode: 'best', name: 'Best Effort', desc: '1v1 — fastest single run wins', dot: 'bg-emerald-500' },
  { mode: 'live', name: 'Live Race', desc: '1v1 — real-time GPS race', dot: 'bg-red-500' },
]

export default function CreateChallenge() {
  const { authenticated, login } = useAuth()
  const { unit, parseToKm } = useUnits()
  const router = useRouter()

  const [uiMode, setUiMode] = useState<UIMode>('group')
  const [h2hVariant, setH2hVariant] = useState<'distance' | 'race'>('distance')
  const [teamSize, setTeamSize] = useState(3)
  const [name, setName] = useState('')
  const [distanceInput, setDistanceInput] = useState('50')
  const [durationValue, setDurationValue] = useState('30')
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days')
  const [stakeGbp, setStakeGbp] = useState('10')
  const [maxParticipants, setMaxParticipants] = useState('10')
  const [isPrivate, setIsPrivate] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [startOption, setStartOption] = useState<'now' | 'scheduled'>('now')
  const [startDate, setStartDate] = useState('')
  const [startTimeField, setStartTimeField] = useState('')

  const [balance, setBalance] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [newChallengeId, setNewChallengeId] = useState<number | null>(null)

  useEffect(() => {
    if (!authenticated) return
    fetch('/api/balance')
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [authenticated])

  if (!authenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-2xl font-bold text-t1 mb-3">Create a Challenge</h1>
        <p className="text-t2 mb-6">Sign in to create your first challenge</p>
        <button
          onClick={login}
          className="bg-coral-500 hover:bg-coral-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
        >
          Sign In
        </button>
      </div>
    )
  }

  // Derive on-chain type from UI mode
  const challengeType =
    uiMode === 'group' ? 0
    : uiMode === 'h2h' ? (h2hVariant === 'race' ? 2 : 1)
    : uiMode === 'team' ? 0 // Team Battle uses GroupGoal on-chain
    : uiMode === 'best' ? 3
    : 4 // live
  const isTeamBattle = uiMode === 'team'
  const is1v1 = uiMode === 'h2h' || uiMode === 'best' || uiMode === 'live'

  const stakeNum = parseFloat(stakeGbp) || 0
  const insufficientBalance = balance !== null && stakeNum > balance
  const totalMinutes = durationToMinutes(parseInt(durationValue) || 0, durationUnit)
  const invalidDuration = totalMinutes < 1440 || totalMinutes > 525600
  const startTimestamp =
    startOption === 'now'
      ? Math.floor(Date.now() / 1000)
      : startDate && startTimeField
        ? Math.floor(new Date(`${startDate}T${startTimeField}`).getTime() / 1000)
        : null
  const invalidStartTime =
    startOption === 'scheduled' && (!startTimestamp || startTimestamp < Math.floor(Date.now() / 1000))

  const handleCreate = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/challenges/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          challengeType,
          distanceKm: parseToKm(parseFloat(distanceInput)),
          durationMinutes: totalMinutes,
          stakeGbp: stakeNum,
          maxParticipants: is1v1 ? 2 : isTeamBattle ? teamSize * 2 : parseInt(maxParticipants),
          isPrivate,
          inviteCode: isPrivate ? inviteCode : undefined,
          startTime: startTimestamp,
          ...(isTeamBattle ? { isTeamBattle: true, teamSize } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create challenge')
      setIsSuccess(true)
      setNewChallengeId(data.challengeId)
      setBalance(data.balance)
      window.dispatchEvent(new Event('balance-updated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center animate-scale-in">
        <div className="w-16 h-16 bg-mint-100 dark:bg-mint-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-mint-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-t1 mb-2">Challenge Created</h1>
        <p className="text-t2 mb-6">Share the link to invite runners.</p>
        <div className="flex gap-3 justify-center">
          {newChallengeId && (
            <Link
              href={`/challenges/${newChallengeId}`}
              className="bg-coral-500 hover:bg-coral-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
            >
              View Challenge
            </Link>
          )}
          <Link
            href="/challenges"
            className="border border-edge text-t2 hover:text-t1 px-6 py-2.5 rounded-xl font-medium transition-colors"
          >
            Browse
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      <h1 className="font-display text-2xl font-bold text-t1 mb-6">Create a Challenge</h1>

      {/* Balance */}
      {balance !== null && (
        <div className="card p-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-t2">Your balance</span>
          <span className="font-display text-lg font-bold text-mint-500">£{balance.toFixed(2)}</span>
        </div>
      )}

      {/* Challenge Type */}
      <fieldset className="mb-6">
        <legend className="text-sm font-semibold text-t2 mb-3">Challenge Type</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {UI_TYPES.map((t) => {
            const selected = uiMode === t.mode
            return (
              <button
                key={t.mode}
                onClick={() => setUiMode(t.mode)}
                className={`p-4 text-left rounded-2xl border transition-all ${
                  selected
                    ? 'bg-coral-500/10 border-coral-500 ring-2 ring-coral-500/30 shadow-md'
                    : 'bg-surface border-edge hover:border-t3'
                }`}
                style={{ boxShadow: selected ? 'var(--shadow-md)' : undefined }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full ${selected ? 'ring-2 ring-coral-500/40' : ''} ${t.dot}`} />
                  <span className={`font-display font-bold text-sm ${selected ? 'text-coral-600 dark:text-coral-400' : 'text-t1'}`}>{t.name}</span>
                </div>
                <p className={`text-xs pl-5 ${selected ? 'text-t1' : 'text-t3'}`}>{t.desc}</p>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* H2H Sub-option */}
      {uiMode === 'h2h' && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-t2 mb-2">Win Condition</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setH2hVariant('distance')}
              className={`card p-3 text-sm font-medium text-center transition-all ${
                h2hVariant === 'distance'
                  ? 'ring-2 ring-coral-500 border-coral-500/30 text-t1'
                  : 'text-t2'
              }`}
            >
              Most distance by deadline
            </button>
            <button
              onClick={() => setH2hVariant('race')}
              className={`card p-3 text-sm font-medium text-center transition-all ${
                h2hVariant === 'race'
                  ? 'ring-2 ring-coral-500 border-coral-500/30 text-t1'
                  : 'text-t2'
              }`}
            >
              First to the distance
            </button>
          </div>
        </div>
      )}

      {/* Team Size */}
      {isTeamBattle && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-t2 mb-2">Team Size</label>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setTeamSize(s)}
                className={`flex-1 card p-3 text-center font-display font-bold transition-all ${
                  teamSize === s
                    ? 'ring-2 ring-coral-500 border-coral-500/30 text-coral-500'
                    : 'text-t2'
                }`}
              >
                {s}v{s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-t2 mb-2">Challenge Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. New Year New Me"
          className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
        />
      </div>

      {/* Distance + Duration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semibold text-t2 mb-2">
            {uiMode === 'best' || uiMode === 'live' ? 'Race Distance' : isTeamBattle ? 'Team Distance Goal' : 'Distance Goal'} ({unit === 'mi' ? 'miles' : 'km'})
          </label>
          <input
            type="number"
            value={distanceInput}
            onChange={(e) => setDistanceInput(e.target.value)}
            min="1"
            className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-t2 mb-2">Duration</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              min="1"
              className="flex-1 bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              className="bg-surface border border-edge rounded-xl px-3 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 transition"
            >
              <option value="hours">hrs</option>
              <option value="days">days</option>
              <option value="weeks">wks</option>
            </select>
          </div>
          {invalidDuration && (
            <p className="text-red-500 text-xs mt-1.5">Duration must be 1 day to 365 days</p>
          )}
        </div>
      </div>

      {/* Start Time */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-t2 mb-2">Start Time</label>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setStartOption('now')}
            className={`card p-3 text-sm font-medium text-center transition-all ${
              startOption === 'now'
                ? 'ring-2 ring-coral-500 border-coral-500/30 text-t1'
                : 'text-t2'
            }`}
          >
            Start immediately
          </button>
          <button
            onClick={() => setStartOption('scheduled')}
            className={`card p-3 text-sm font-medium text-center transition-all ${
              startOption === 'scheduled'
                ? 'ring-2 ring-coral-500 border-coral-500/30 text-t1'
                : 'text-t2'
            }`}
          >
            Schedule start
          </button>
        </div>
        {startOption === 'scheduled' && (
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="flex-1 bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 transition"
            />
            <input
              type="time"
              value={startTimeField}
              onChange={(e) => setStartTimeField(e.target.value)}
              className="bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 transition"
            />
          </div>
        )}
        {invalidStartTime && (
          <p className="text-red-500 text-xs mt-1.5">Start time must be in the future</p>
        )}
      </div>

      {/* Stake + Max Participants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semibold text-t2 mb-2">Stake (£)</label>
          <input
            type="number"
            value={stakeGbp}
            onChange={(e) => setStakeGbp(e.target.value)}
            min="1"
            step="1"
            className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
          />
        </div>
        {uiMode === 'group' && (
          <div>
            <label className="block text-sm font-semibold text-t2 mb-2">Max Participants</label>
            <input
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              min="2"
              max="100"
              className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 focus:outline-none focus:ring-2 focus:ring-coral-500/40 focus:border-coral-500/60 transition"
            />
          </div>
        )}
      </div>

      {/* Private Toggle */}
      <div className="mb-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={isPrivate}
            onClick={() => setIsPrivate(!isPrivate)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              isPrivate ? 'bg-coral-500' : 'bg-edge'
            }`}
          >
            <span
              className={`block w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${
                isPrivate ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-t1">Private (invite only)</span>
        </label>
      </div>

      {isPrivate && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-t2 mb-2">Invite Code</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter a secret code for your friends"
            className="w-full bg-surface border border-edge rounded-xl px-4 py-3 text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-coral-500/40 transition"
          />
        </div>
      )}

      {/* Preview */}
      <div className="card p-4 mb-6 border-dashed">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider mb-2">Preview</p>
        <p className="text-sm text-t1">
          <span className="font-display font-bold">{name || 'Untitled Challenge'}</span>
          {' — '}
          Run {distanceInput} {unit === 'mi' ? 'miles' : 'km'} in {formatDuration(durationValue, durationUnit)}.{' '}
          <span className="font-bold text-coral-500">£{stakeGbp}</span> to join.
          {uiMode === 'group'
            ? ` Up to ${maxParticipants} runners.`
            : isTeamBattle
              ? ` ${teamSize}v${teamSize} — team with more distance wins!`
              : uiMode === 'h2h' && h2hVariant === 'race'
                ? ' 1v1 — first to the distance wins!'
                : uiMode === 'best'
                  ? ' 1v1 — fastest single run wins.'
                  : uiMode === 'live'
                    ? ' 1v1 — live GPS race!'
                    : ' 1v1 — whoever runs more wins.'}
          {isPrivate && ' Private.'}
          {startOption === 'scheduled' && startDate && ` Starts ${startDate}.`}
        </p>
      </div>

      {/* Errors */}
      {insufficientBalance && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-600 dark:text-red-400 text-sm">
            Insufficient balance. You need £{stakeNum.toFixed(2)} but have £{(balance ?? 0).toFixed(2)}.{' '}
            <Link href="/profile" className="underline font-semibold">
              Top up
            </Link>
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-600 dark:text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleCreate}
        disabled={isSubmitting || !name || insufficientBalance || invalidDuration || invalidStartTime}
        className="w-full bg-coral-500 hover:bg-coral-600 disabled:bg-edge disabled:text-t3 text-white py-3.5 rounded-xl font-bold font-display transition-colors shadow-lg shadow-coral-500/20 disabled:shadow-none"
      >
        {isSubmitting ? 'Creating...' : `Create Challenge — Stake £${stakeGbp}`}
      </button>
    </div>
  )
}
