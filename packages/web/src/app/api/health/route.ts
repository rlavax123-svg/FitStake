import { NextResponse } from 'next/server'
import { publicClient, getDeployerAddress, gbpToWei } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { formatEther } from 'viem'

export async function GET() {
  const checks: Record<string, unknown> = {
    contractAddress: FITSTAKE_ADDRESS,
    chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  }

  // Check contract exists
  try {
    const code = await publicClient.getCode({ address: FITSTAKE_ADDRESS })
    checks.contractDeployed = code && code.length > 2
  } catch (e) {
    checks.contractDeployed = false
    checks.contractError = e instanceof Error ? e.message : String(e)
  }

  // Check nextChallengeId (proves contract is the right one)
  try {
    const nextId = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'nextChallengeId',
    })
    checks.nextChallengeId = Number(nextId)
  } catch (e) {
    checks.nextChallengeId = null
    checks.readError = e instanceof Error ? e.message : String(e)
  }

  // Check server wallet balance
  try {
    const deployer = getDeployerAddress()
    checks.serverWallet = deployer
    const balance = await publicClient.getBalance({ address: deployer })
    checks.serverWalletEth = formatEther(balance)
  } catch (e) {
    checks.serverWalletEth = null
    checks.walletError = e instanceof Error ? e.message : String(e)
  }

  // Check price feed (gbpToWei)
  try {
    const wei = await gbpToWei(10)
    checks.gbpToWeiWorks = true
    checks.tenPoundsInWei = wei.toString()
  } catch (e) {
    checks.gbpToWeiWorks = false
    checks.priceError = e instanceof Error ? e.message : String(e)
  }

  const healthy = checks.contractDeployed && checks.nextChallengeId !== null && checks.gbpToWeiWorks
  checks.healthy = healthy

  return NextResponse.json(checks, { status: healthy ? 200 : 500 })
}
