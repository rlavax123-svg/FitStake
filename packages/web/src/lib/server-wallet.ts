import { createWalletClient, createPublicClient, http, keccak256, toBytes, type TransactionReceipt } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from './contracts'

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org'

// Lazy initialization — avoids build-time errors when env vars aren't available
let _walletClient: ReturnType<typeof createWalletClient> | null = null
let _publicClient: ReturnType<typeof createPublicClient> | null = null

function getAccount() {
  const pk = process.env.PRIVATE_KEY as `0x${string}`
  if (!pk) throw new Error('PRIVATE_KEY env var required')
  return privateKeyToAccount(pk)
}

export function getWalletClient() {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getAccount(),
      chain: sepolia,
      transport: http(RPC_URL),
    })
  }
  return _walletClient
}

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
})

export function getDeployerAddress() {
  return getAccount().address
}

// Chainlink ETH/USD Price Feed on Sepolia
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const
const PRICE_FEED_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

const USD_TO_GBP = 0.79

/** Get current ETH price in GBP */
export async function getEthPriceGbp(): Promise<number> {
  const data = await publicClient.readContract({
    address: ETH_USD_FEED,
    abi: PRICE_FEED_ABI,
    functionName: 'latestRoundData',
  })
  const ethUsd = Number(data[1]) / 1e8
  return ethUsd * USD_TO_GBP
}

/** Convert GBP amount to wei */
export async function gbpToWei(gbpAmount: number): Promise<bigint> {
  const ethPriceGbp = await getEthPriceGbp()
  const ethAmount = gbpAmount / ethPriceGbp
  return BigInt(Math.round(ethAmount * 1e18))
}

/** Convert wei to GBP */
export async function weiToGbp(wei: bigint): Promise<number> {
  const ethPriceGbp = await getEthPriceGbp()
  const eth = Number(wei) / 1e18
  return eth * ethPriceGbp
}

/** Derive a deterministic Ethereum address from a Strava athlete ID.
 * Used as the on-chain identifier for server-side signing. */
export function stravaIdToAddress(stravaId: number): `0x${string}` {
  const hash = keccak256(toBytes(String(stravaId)))
  return `0x${hash.slice(26)}` as `0x${string}`
}

/** Send a transaction to the FitStake contract and wait for receipt */
export async function sendContractTx(
  functionName: string,
  args: unknown[],
  value?: bigint
): Promise<TransactionReceipt> {
  const hash = await sendContractTxHash(functionName, args, value)
  return publicClient.waitForTransactionReceipt({ hash })
}

/** Send a transaction and return just the hash (no receipt wait) */
export async function sendContractTxHash(
  functionName: string,
  args: unknown[],
  value?: bigint
): Promise<`0x${string}`> {
  const wc = getWalletClient()
  const account = getAccount()
  return wc.writeContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: functionName as any,
    args: args as any,
    value,
    chain: sepolia,
    account,
  })
}
