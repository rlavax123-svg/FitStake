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

export default function CreateChallenge() {
  const { authenticated, login } = useAuth()
  const { unit, parseToKm } = useUnits()
  const router = useRouter()

  const [challengeType, setChallengeType] = useState<0 | 1>(0)
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
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Create a Challenge</h1>
        <p className="text-zinc-400 mb-6">Sign in to create your first challenge</p>
        <button
          onClick={login}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition"
        >
          Sign In
        </button>
      </div>
    )
  }

  const stakeNum = parseFloat(stakeGbp) || 0
  const insufficientBalance = balance !== null && stakeNum > balance
  const totalMinutes = durationToMinutes(parseInt(durationValue) || 0, durationUnit)
  const invalidDuration = totalMinutes < 1440 || totalMinutes > 525600
  const startTimestamp = startOption === 'now'
    ? Math.floor(Date.now() / 1000)
    : startDate && startTimeField
      ? Math.floor(new Date(`${startDate}T${startTimeField}`).getTime() / 1000)
      : null
  const invalidStartTime = startOption === 'scheduled' && (!startTimestamp || startTimestamp < Math.floor(Date.now() / 1000))

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
          maxParticipants: challengeType === 1 ? 2 : parseInt(maxParticipants),
          isPrivate,
          inviteCode: isPrivate ? inviteCode : undefined,
          startTime: startTimestamp,
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
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">Challenge Created!</h1>
        <p className="text-zinc-400 mb-6">Your challenge is live. Share the link to invite runners.</p>
        <div className="flex gap-3 justify-center">
          {newChallengeId && (
            <Link
              href={`/challenges/${newChallengeId}`}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition"
            >
              View Challenge
            </Link>
          )}
          <Link
            href="/challenges"
            className="border border-zinc-700 text-zinc-400 hover:text-zinc-100 px-6 py-2 rounded-lg transition"
          >
            Browse Challenges
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Create a Challenge</h1>

      {balance !== null && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-zinc-400">Your balance</span>
          <span className="text-lg font-bold text-green-400">£{balance.toFixed(2)}</span>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm text-zinc-400 mb-2">Challenge Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setChallengeType(0)}
            className={`p-4 rounded-xl border text-left transition ${
              challengeType === 0
                ? 'border-indigo-500 bg-indigo-600/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="font-semibold mb-1">Group Goal</div>
            <div className="text-sm text-zinc-400">
              Set a distance. Everyone who hits it splits the pot.
            </div>
          </button>
          <button
            onClick={() => setChallengeType(1)}
            className={`p-4 rounded-xl border text-left transition ${
              challengeType === 1
                ? 'border-indigo-500 bg-indigo-600/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="font-semibold mb-1">Head-to-Head</div>
            <div className="text-sm text-zinc-400">
              1v1 race. Whoever runs more wins everything.
            </div>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-zinc-400 mb-2">Challenge Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. New Year New Me"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Distance Goal ({unit === 'mi' ? 'miles' : 'km'})</label>
          <input
            type="number"
            value={distanceInput}
            onChange={(e) => setDistanceInput(e.target.value)}
            min="1"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Duration</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              min="1"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="hours">hrs</option>
              <option value="days">days</option>
              <option value="weeks">wks</option>
            </select>
          </div>
          {invalidDuration && (
            <p className="text-red-400 text-xs mt-1">Duration must be 1 day to 365 days</p>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-zinc-400 mb-2">Start Time</label>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            onClick={() => setStartOption('now')}
            className={`p-3 rounded-xl border text-sm transition ${
              startOption === 'now'
                ? 'border-indigo-500 bg-indigo-600/10 text-zinc-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            Start immediately
          </button>
          <button
            onClick={() => setStartOption('scheduled')}
            className={`p-3 rounded-xl border text-sm transition ${
              startOption === 'scheduled'
                ? 'border-indigo-500 bg-indigo-600/10 text-zinc-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
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
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
            />
            <input
              type="time"
              value={startTimeField}
              onChange={(e) => setStartTimeField(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        )}
        {invalidStartTime && (
          <p className="text-red-400 text-xs mt-1">Start time must be in the future</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Stake (£)</label>
          <input
            type="number"
            value={stakeGbp}
            onChange={(e) => setStakeGbp(e.target.value)}
            min="1"
            step="1"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
        {challengeType === 0 && (
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Max Participants</label>
            <input
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              min="2"
              max="100"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
        )}
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsPrivate(!isPrivate)}
            className={`w-10 h-6 rounded-full transition ${
              isPrivate ? 'bg-indigo-600' : 'bg-zinc-700'
            } relative`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full absolute top-1 transition ${
                isPrivate ? 'left-5' : 'left-1'
              }`}
            />
          </div>
          <span className="text-sm text-zinc-300">Private (invite only)</span>
        </label>
      </div>

      {isPrivate && (
        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-2">Invite Code</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter a secret code for your friends"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="text-sm text-zinc-400 mb-2">Challenge Preview</div>
        <div className="text-zinc-100">
          <span className="font-semibold">{name || 'Untitled Challenge'}</span>
          {' — '}
          Run {distanceInput} {unit === 'mi' ? 'miles' : 'km'} in {formatDuration(durationValue, durationUnit)}.{' '}
          <span className="text-amber-400">£{stakeGbp}</span> to join.
          {challengeType === 0
            ? ` Up to ${maxParticipants} runners.`
            : ' 1v1 — winner takes all.'}
          {isPrivate && ' Private.'}
          {startOption === 'scheduled' && startDate && ` Starts ${startDate}.`}
        </div>
      </div>

      {insufficientBalance && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-400 text-sm">
            Insufficient balance. You need £{stakeNum.toFixed(2)} but have £{(balance ?? 0).toFixed(2)}.{' '}
            <Link href="/profile" className="underline">Top up</Link>
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={isSubmitting || !name || insufficientBalance || invalidDuration || invalidStartTime}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white py-3 rounded-xl font-semibold transition"
      >
        {isSubmitting
          ? 'Creating challenge...'
          : `Create Challenge — Stake £${stakeGbp}`}
      </button>
    </div>
  )
}
