'use client'

import { usePrivy } from '@privy-io/react-auth'

export function StravaConnect() {
  const { user } = usePrivy()

  const walletAddress = user?.wallet?.address

  if (!walletAddress) {
    return null
  }

  const handleConnect = () => {
    window.location.href = `/api/strava/auth?wallet=${walletAddress}`
  }

  return (
    <button
      onClick={handleConnect}
      className="flex items-center gap-2 bg-[#FC4C02] hover:bg-[#e04400] text-white text-sm px-4 py-2 rounded-lg font-medium transition"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
      </svg>
      Connect Strava
    </button>
  )
}
