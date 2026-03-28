import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Nav } from '@/components/nav'
import { ErrorBoundary } from '@/components/error-boundary'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'FitStake — Bet on Your Runs',
  description:
    'Stake money on your running goals. Complete the challenge and win. Verified by Chainlink. Settled by smart contracts.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <Providers>
          <Nav />
          <main className="flex-1">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </Providers>
      </body>
    </html>
  )
}
