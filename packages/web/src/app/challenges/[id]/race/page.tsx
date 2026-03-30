'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import { useChallenge, timeRemaining } from '@/lib/hooks'
import { useAuth } from '@/lib/use-auth'
import { useUnits } from '@/lib/use-units'
import Link from 'next/link'

interface RaceParticipant {
  userId: string
  name: string
  isReady: boolean
  distanceCm: number
  updatedAt: string
}

export default function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params)
  const id = parseInt(idStr)
  const { data: challenge, isLoading } = useChallenge(id)
  const { authenticated } = useAuth()
  const { formatDistance, unit } = useUnits()

  const [participants, setParticipants] = useState<RaceParticipant[]>([])
  const [myDistance, setMyDistance] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [allReady, setAllReady] = useState(false)
  const [raceStarted, setRaceStarted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll race state every 2 seconds
  useEffect(() => {
    if (!authenticated) return
    const poll = () => {
      fetch(`/api/race/state?challengeId=${id}`)
        .then(r => r.json())
        .then(d => {
          if (d.participants) setParticipants(d.participants)
        })
        .catch(() => {})
    }
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id, authenticated])

  // Check if all ready
  useEffect(() => {
    if (participants.length >= 2 && participants.every(p => p.isReady)) {
      if (!allReady) {
        setAllReady(true)
        // Start countdown
        setCountdown(3)
      }
    }
  }, [participants, allReady])

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setRaceStarted(true)
      setCountdown(null)
      return
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Start GPS tracking when race starts
  useEffect(() => {
    if (!raceStarted || finished) return
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device')
      return
    }

    // Request wake lock to keep screen on
    if ('wakeLock' in navigator) {
      (navigator as any).wakeLock.request('screen').catch(() => {})
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        fetch('/api/race/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: id,
            lat: latitude,
            lng: longitude,
            accuracy,
          }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.distanceCm) setMyDistance(d.distanceCm)
          })
          .catch(() => {})
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [raceStarted, finished, id])

  // Check for finish
  useEffect(() => {
    if (!challenge || !raceStarted) return
    const goalCm = Number(challenge.distanceGoalCm)
    const winner = participants.find(p => p.distanceCm >= goalCm)
    if (winner) {
      setFinished(true)
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [participants, challenge, raceStarted])

  const handleReady = useCallback(async () => {
    const res = await fetch('/api/race/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: id }),
    })
    const data = await res.json()
    if (data.ready) setIsReady(true)
    if (data.allReady) setAllReady(true)
  }, [id])

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="animate-pulse text-zinc-500">Loading race...</div>
      </div>
    )
  }

  if (!challenge || Number(challenge.challengeType) !== 4) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold mb-2">Not a Live Race</h1>
        <Link href={`/challenges/${id}`} className="text-indigo-400">Back to challenge</Link>
      </div>
    )
  }

  const goalCm = Number(challenge.distanceGoalCm)
  const goalDisplay = formatDistance(goalCm)

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Race Header */}
      <div className="text-center mb-8">
        <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">Live Race</div>
        <h1 className="text-3xl font-bold mb-1">{goalDisplay} {unit}</h1>
        <p className="text-zinc-500 text-sm">First to the distance wins</p>
      </div>

      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-8xl font-bold text-indigo-400 animate-pulse">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {finished && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-6 text-center">
          <div className="text-2xl font-bold text-green-400 mb-2">Race Complete!</div>
          <p className="text-zinc-400 text-sm">Results are being settled on-chain.</p>
          <Link
            href={`/challenges/${id}`}
            className="inline-block mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition"
          >
            View Results
          </Link>
        </div>
      )}

      {/* GPS Error */}
      {gpsError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-400 text-sm">{gpsError}</span>
        </div>
      )}

      {/* Progress bars */}
      <div className="space-y-4 mb-8">
        {participants.map((p, i) => {
          const pct = goalCm > 0 ? Math.min(100, (p.distanceCm / goalCm) * 100) : 0
          const distDisplay = formatDistance(p.distanceCm)
          const isFinisher = p.distanceCm >= goalCm

          return (
            <div key={p.userId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-indigo-500' : 'bg-orange-500'}`} />
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  {isFinisher && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Finished!</span>}
                </div>
                <span className="text-sm font-semibold text-zinc-300">{distDisplay} {unit}</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isFinisher ? 'bg-green-500' : i === 0 ? 'bg-indigo-500' : 'bg-orange-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-zinc-500 mt-1">{pct.toFixed(0)}%</div>
            </div>
          )
        })}

        {participants.length < 2 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-zinc-500 text-sm">Waiting for opponent to join...</p>
          </div>
        )}
      </div>

      {/* Ready / Status */}
      {!raceStarted && !finished && (
        <div className="text-center">
          {!isReady ? (
            <button
              onClick={handleReady}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold text-lg transition"
            >
              Ready Up
            </button>
          ) : !allReady ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="text-indigo-400 font-semibold mb-1">You're ready!</div>
              <p className="text-zinc-500 text-sm animate-pulse">Waiting for opponent...</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Running indicator */}
      {raceStarted && !finished && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 text-sm font-medium">GPS tracking active</span>
          </div>
        </div>
      )}
    </div>
  )
}
