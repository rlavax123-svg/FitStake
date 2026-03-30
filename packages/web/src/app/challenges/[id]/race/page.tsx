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

const RUNNER_COLORS = ['bg-coral-500', 'bg-blue-500'] as const
const RUNNER_BAR_COLORS = ['bg-coral-500', 'bg-blue-500'] as const

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

  useEffect(() => {
    if (!authenticated) return
    const poll = () => {
      fetch(`/api/race/state?challengeId=${id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.participants) setParticipants(d.participants)
        })
        .catch(() => {})
    }
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [id, authenticated])

  useEffect(() => {
    if (participants.length >= 2 && participants.every((p) => p.isReady)) {
      if (!allReady) {
        setAllReady(true)
        setCountdown(3)
      }
    }
  }, [participants, allReady])

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

  useEffect(() => {
    if (!raceStarted || finished) return
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device')
      return
    }

    if ('wakeLock' in navigator) {
      ;(navigator as any).wakeLock.request('screen').catch(() => {})
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        fetch('/api/race/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: id, lat: latitude, lng: longitude, accuracy }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.distanceCm) setMyDistance(d.distanceCm)
          })
          .catch(() => {})
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [raceStarted, finished, id])

  useEffect(() => {
    if (!challenge || !raceStarted) return
    const goalCm = Number(challenge.distanceGoalCm)
    const winner = participants.find((p) => p.distanceCm >= goalCm)
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
        <div className="animate-pulse-soft text-t3">Loading race...</div>
      </div>
    )
  }

  if (!challenge || Number(challenge.challengeType) !== 4) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-up">
        <h1 className="font-display text-xl font-bold text-t1 mb-2">Not a Live Race</h1>
        <Link href={`/challenges/${id}`} className="text-coral-500 font-semibold">
          Back to challenge
        </Link>
      </div>
    )
  }

  const goalCm = Number(challenge.distanceGoalCm)
  const goalDisplay = formatDistance(goalCm)

  return (
    <div className="max-w-md mx-auto px-4 py-6 sm:py-8 animate-fade-up">
      {/* Race Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider mb-3">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          Live Race
        </div>
        <h1 className="font-display text-4xl font-bold text-t1 mb-1">
          {goalDisplay} {unit}
        </h1>
        <p className="text-sm text-t3">First to the distance wins</p>
      </div>

      {/* Countdown */}
      {countdown !== null && (
        <div className="fixed inset-0 bg-page/90 flex items-center justify-center z-50" style={{ background: 'color-mix(in oklch, var(--page-bg) 90%, transparent)' }}>
          <div className="font-display text-[120px] font-bold text-coral-500 animate-scale-in">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
        </div>
      )}

      {/* Finished */}
      {finished && (
        <div className="card p-6 mb-6 text-center bg-mint-50 dark:bg-mint-500/5 border-mint-200 dark:border-mint-500/20 animate-scale-in">
          <p className="font-display text-2xl font-bold text-mint-500 mb-2">Race Complete!</p>
          <p className="text-sm text-t2 mb-4">Results are being settled on-chain.</p>
          <Link
            href={`/challenges/${id}`}
            className="inline-block bg-coral-500 hover:bg-coral-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
          >
            View Results
          </Link>
        </div>
      )}

      {/* GPS Error */}
      {gpsError && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-600 dark:text-red-400 text-sm">{gpsError}</span>
        </div>
      )}

      {/* Progress Bars */}
      <div className="space-y-4 mb-8">
        {participants.map((p, i) => {
          const pct = goalCm > 0 ? Math.min(100, (p.distanceCm / goalCm) * 100) : 0
          const distDisplay = formatDistance(p.distanceCm)
          const isFinisher = p.distanceCm >= goalCm
          const color = RUNNER_COLORS[i] || 'bg-coral-500'
          const barColor = RUNNER_BAR_COLORS[i] || 'bg-coral-500'

          return (
            <div key={p.userId} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="font-display font-semibold text-t1">{p.name}</span>
                  {!raceStarted && p.isReady && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400 font-semibold">
                      Ready
                    </span>
                  )}
                  {isFinisher && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mint-100 dark:bg-mint-500/10 text-mint-600 dark:text-mint-400 font-semibold">
                      Finished!
                    </span>
                  )}
                </div>
                <span className="font-display text-sm font-bold text-t1">
                  {distDisplay} {unit}
                </span>
              </div>
              <div className="w-full h-3 bg-edge-subtle rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isFinisher ? 'bg-mint-500' : barColor
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-t3 mt-1">{pct.toFixed(0)}%</div>
            </div>
          )
        })}

        {participants.length < 2 && (
          <div className="card p-6 text-center">
            <p className="text-t3 text-sm animate-pulse-soft">Waiting for opponent to join...</p>
          </div>
        )}
      </div>

      {/* Ready / Status */}
      {!raceStarted && !finished && (
        <div className="text-center">
          {!isReady ? (
            <button
              onClick={handleReady}
              className="w-full bg-coral-500 hover:bg-coral-600 text-white py-4 rounded-xl font-bold font-display text-lg transition-colors shadow-lg shadow-coral-500/20"
            >
              Ready Up
            </button>
          ) : !allReady ? (
            <div className="card p-6 text-center">
              <p className="font-display font-semibold text-coral-500 mb-1">You're ready!</p>
              <p className="text-sm text-t3 animate-pulse-soft">Waiting for opponent...</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Running indicator */}
      {raceStarted && !finished && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-mint-50 dark:bg-mint-500/10 border border-mint-200 dark:border-mint-500/20 rounded-full px-4 py-2">
            <span className="w-2 h-2 bg-mint-500 rounded-full animate-pulse" />
            <span className="text-mint-600 dark:text-mint-400 text-sm font-semibold">
              GPS tracking active
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
