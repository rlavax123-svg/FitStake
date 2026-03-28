import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')

  if (!ids) {
    return NextResponse.json({ metadata: {} })
  }

  const idList = ids.split(',').map(Number).filter(Boolean)

  const { data } = await supabaseAdmin
    .from('challenge_metadata')
    .select('chain_challenge_id, name, stake_gbp')
    .in('chain_challenge_id', idList)

  const metadata: Record<number, { name: string; stakeGbp: number | null }> = {}
  for (const row of data || []) {
    metadata[row.chain_challenge_id] = {
      name: row.name,
      stakeGbp: row.stake_gbp,
    }
  }

  return NextResponse.json({ metadata })
}
