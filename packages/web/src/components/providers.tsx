'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from './auth-provider'
import { UnitsProvider } from '@/lib/use-units'

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <AuthProvider>
      <UnitsProvider>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
        </QueryClientProvider>
      </UnitsProvider>
    </AuthProvider>
  )
}
