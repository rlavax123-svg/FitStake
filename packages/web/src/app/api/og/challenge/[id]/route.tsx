import { ImageResponse } from 'next/og'
import { supabaseAdmin } from '@/lib/supabase'
import { publicClient } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

export const runtime = 'nodejs'

const TYPE_LABELS: Record<number, string> = {
  0: 'Group Goal',
  1: 'Head-to-Head',
  2: 'Head-to-Head',
  3: 'Best Effort',
  4: 'Live Race',
}

const TYPE_COLORS: Record<number, string> = {
  0: '#3B82F6',
  1: '#F97316',
  2: '#8B5CF6',
  3: '#10B981',
  4: '#EF4444',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const chainId = parseInt(id)

  // Fetch challenge data
  let challengeName = `Challenge #${chainId}`
  let stakeGbp = 0
  let distanceKm = 0
  let challengeType = 0
  let participantCount = 0
  let state = 0
  let isTeamBattle = false

  try {
    const challengeData = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'getChallenge',
      args: [BigInt(chainId)],
    }) as any

    challengeType = Number(challengeData.challengeType)
    distanceKm = Number(challengeData.distanceGoalCm) / 100_000
    participantCount = Number(challengeData.participantCount)
    state = Number(challengeData.state)
  } catch {}

  try {
    const { data: meta } = await supabaseAdmin
      .from('challenge_metadata')
      .select('name, stake_gbp, is_team_battle, team_size')
      .eq('chain_challenge_id', chainId)
      .maybeSingle()

    if (meta?.name) challengeName = meta.name
    if (meta?.stake_gbp) stakeGbp = meta.stake_gbp
    if (meta?.is_team_battle) isTeamBattle = true
  } catch {}

  const typeColor = TYPE_COLORS[challengeType] || '#3B82F6'
  const typeLabel = isTeamBattle ? 'Team Battle' : TYPE_LABELS[challengeType] || 'Challenge'
  const stateLabel = state === 3 ? 'Complete' : state === 1 ? 'Active' : 'Open'
  const totalPot = stakeGbp * participantCount

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f0f0f',
          padding: '60px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top bar accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: `linear-gradient(90deg, ${typeColor}, #FF6B6B)`,
            display: 'flex',
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: typeColor,
                display: 'flex',
              }}
            />
            <span style={{ color: '#999', fontSize: '24px', fontWeight: 600 }}>{typeLabel}</span>
          </div>
          <span
            style={{
              color: state === 3 ? '#a855f7' : state === 1 ? '#34d399' : '#60a5fa',
              fontSize: '22px',
              fontWeight: 700,
              padding: '6px 16px',
              borderRadius: '12px',
              backgroundColor: state === 3 ? '#a855f720' : state === 1 ? '#34d39920' : '#60a5fa20',
              display: 'flex',
            }}
          >
            {stateLabel}
          </span>
        </div>

        {/* Challenge Name */}
        <div style={{ fontSize: '56px', fontWeight: 800, color: '#ffffff', marginBottom: '30px', display: 'flex' }}>
          {challengeName}
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', gap: '60px', marginBottom: '50px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#666', fontSize: '18px', marginBottom: '4px', display: 'flex' }}>Distance</span>
            <span style={{ color: '#fff', fontSize: '36px', fontWeight: 700, display: 'flex' }}>
              {distanceKm >= 1 ? `${distanceKm.toFixed(distanceKm % 1 === 0 ? 0 : 1)} km` : `${(distanceKm * 1000).toFixed(0)} m`}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#666', fontSize: '18px', marginBottom: '4px', display: 'flex' }}>Stake</span>
            <span style={{ color: '#34d399', fontSize: '36px', fontWeight: 700, display: 'flex' }}>
              £{stakeGbp.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#666', fontSize: '18px', marginBottom: '4px', display: 'flex' }}>Total Pot</span>
            <span style={{ color: '#34d399', fontSize: '36px', fontWeight: 700, display: 'flex' }}>
              £{totalPot.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#666', fontSize: '18px', marginBottom: '4px', display: 'flex' }}>Runners</span>
            <span style={{ color: '#fff', fontSize: '36px', fontWeight: 700, display: 'flex' }}>
              {participantCount}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#FF6B6B', display: 'flex' }}>FitStake</span>
            <span style={{ color: '#555', fontSize: '20px', display: 'flex' }}>Run with accountability</span>
          </div>
          <span style={{ color: '#444', fontSize: '18px', display: 'flex' }}>Verified by Strava · Settled by smart contracts</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
