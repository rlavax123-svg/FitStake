import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const chainId = parseInt(id)
  const session = await getSession()

  // Also fetch challenge name from metadata
  const { data: meta } = await supabaseAdmin
    .from('challenge_metadata')
    .select('name, stake_gbp')
    .eq('chain_challenge_id', chainId)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ isParticipant: false, name: meta?.name || null, stakeGbp: meta?.stake_gbp || null })
  }

  const { data } = await supabaseAdmin
    .from('challenge_participants')
    .select('id')
    .eq('chain_challenge_id', chainId)
    .eq('strava_athlete_id', session.stravaId)
    .maybeSingle()

  return NextResponse.json({
    isParticipant: !!data,
    name: meta?.name || null,
    stakeGbp: meta?.stake_gbp || null,
  })
}
