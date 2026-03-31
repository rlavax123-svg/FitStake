import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const chainId = parseInt(id)

  let title = `Challenge #${chainId} — FitStake`
  let description = 'Stake money on your running goals. Verified by Strava.'

  try {
    const { data: meta } = await supabaseAdmin
      .from('challenge_metadata')
      .select('name, stake_gbp')
      .eq('chain_challenge_id', chainId)
      .maybeSingle()

    if (meta?.name) {
      title = `${meta.name} — FitStake`
      description = `Join this FitStake challenge! £${meta.stake_gbp?.toFixed(2) ?? '?'} stake. Verified by Strava, settled by smart contracts.`
    }
  } catch {}

  const ogUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://web-ashy-sigma.vercel.app'}/api/og/challenge/${chainId}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  }
}

export default function ChallengeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
