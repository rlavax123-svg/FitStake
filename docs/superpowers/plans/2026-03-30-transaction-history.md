# Transaction History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transaction history section to the Profile page showing all financial activity with challenge context.

**Architecture:** New API route queries the `transactions` table joined with `challenge_metadata` for names. Profile page gets a new section between "Balance + Top Up" and "Completed Challenges" that fetches and renders the transaction list.

**Tech Stack:** Next.js API route, Supabase queries, React client component (existing patterns)

---

### Task 1: Create the API endpoint

**Files:**
- Create: `packages/web/src/app/api/me/transactions/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: transactions, error } = await supabaseAdmin
    .from('transactions')
    .select('id, type, amount, chain_challenge_id, tx_hash, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ transactions: [] })
  }

  // Get challenge names for transactions that have a chain_challenge_id
  const challengeIds = [
    ...new Set(
      transactions
        .filter((t) => t.chain_challenge_id !== null)
        .map((t) => t.chain_challenge_id!)
    ),
  ]

  let nameMap = new Map<number, string>()
  if (challengeIds.length > 0) {
    const { data: metadataRows } = await supabaseAdmin
      .from('challenge_metadata')
      .select('chain_challenge_id, name')
      .in('chain_challenge_id', challengeIds)

    nameMap = new Map(
      (metadataRows || []).map((m) => [m.chain_challenge_id, m.name])
    )
  }

  const result = transactions.map((t) => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    chain_challenge_id: t.chain_challenge_id,
    challenge_name: t.chain_challenge_id ? nameMap.get(t.chain_challenge_id) ?? null : null,
    tx_hash: t.tx_hash,
    created_at: t.created_at,
  }))

  return NextResponse.json({ transactions: result })
}
```

- [ ] **Step 2: Verify the endpoint works**

Run the dev server and test manually:
```bash
cd packages/web && npm run dev
```
Then in another terminal:
```bash
curl http://localhost:3000/api/me/transactions
```
Expected: 401 (no session cookie) — confirms the route is loaded and auth check works.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/api/me/transactions/route.ts
git commit -m "Add GET /api/me/transactions endpoint"
```

---

### Task 2: Add transaction history section to Profile page

**Files:**
- Modify: `packages/web/src/app/profile/page.tsx`

- [ ] **Step 1: Add the Transaction interface and state**

At the top of the file, after the existing `UserChallenge` interface, add:

```typescript
interface Transaction {
  id: string
  type: 'topup' | 'stake' | 'refund' | 'winnings'
  amount: number
  chain_challenge_id: number | null
  challenge_name: string | null
  tx_hash: string | null
  created_at: string
}
```

Inside the `Profile` component, after the existing `challengesLoading` state, add:

```typescript
const [transactions, setTransactions] = useState<Transaction[]>([])
const [txLoading, setTxLoading] = useState(false)
```

- [ ] **Step 2: Add the fetch effect**

After the existing `useEffect` that fetches challenges, add:

```typescript
useEffect(() => {
  if (!authenticated) return
  setTxLoading(true)
  fetch('/api/me/transactions')
    .then((res) => res.json())
    .then((data) => {
      if (data.transactions) setTransactions(data.transactions)
    })
    .catch(() => {})
    .finally(() => setTxLoading(false))
}, [authenticated])
```

- [ ] **Step 3: Add the formatTimeAgo helper**

Inside the `Profile` component, after the `kmToDisplay` / `unitLabel` declarations, add:

```typescript
const formatTimeAgo = (dateStr: string) => {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
```

- [ ] **Step 4: Add the Transaction History JSX section**

Insert this block in the JSX between the "Balance + Top Up" section and the "FitStake Stats" section (after the closing `</div>` of Balance + Top Up, before the `{(() => {` of FitStake Stats):

```tsx
{/* Transaction History */}
<div className="mb-6">
  <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
  {txLoading ? (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-16 h-5 bg-zinc-800 rounded-full" />
            <div>
              <div className="w-32 h-4 bg-zinc-800 rounded mb-1" />
              <div className="w-16 h-3 bg-zinc-800 rounded" />
            </div>
          </div>
          <div className="w-16 h-5 bg-zinc-800 rounded" />
        </div>
      ))}
    </div>
  ) : transactions.length === 0 ? (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <p className="text-zinc-500">No transactions yet.</p>
      <a href="/challenges/create" className="text-indigo-400 hover:text-indigo-300 text-sm mt-1 inline-block">
        Create a challenge to get started
      </a>
    </div>
  ) : (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
      {transactions.map((tx) => {
        const badge = {
          topup: { label: 'Top-up', cls: 'bg-blue-500/10 text-blue-400' },
          stake: { label: 'Staked', cls: 'bg-orange-500/10 text-orange-400' },
          winnings: { label: 'Won', cls: 'bg-green-500/10 text-green-400' },
          refund: { label: 'Refund', cls: 'bg-zinc-500/10 text-zinc-400' },
        }[tx.type]

        const isPositive = tx.type !== 'stake'
        const absAmount = Math.abs(tx.amount).toFixed(2)

        return (
          <div key={tx.id} className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              <div>
                <div className="text-sm text-zinc-200">
                  {tx.challenge_name ? (
                    <a
                      href={`/challenges/${tx.chain_challenge_id}`}
                      className="hover:text-indigo-400 transition"
                    >
                      {tx.challenge_name}
                    </a>
                  ) : (
                    'Balance top-up'
                  )}
                </div>
                <div className="text-xs text-zinc-500">{formatTimeAgo(tx.created_at)}</div>
              </div>
            </div>
            <span className={`text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : '-'}£{absAmount}
            </span>
          </div>
        )
      })}
    </div>
  )}
</div>
```

- [ ] **Step 5: Verify in the browser**

Run: `cd packages/web && npm run dev`

Open `http://localhost:3000/profile` in the browser. Verify:
- Transaction history section appears between balance and FitStake stats
- Loading skeleton shows briefly
- If transactions exist: rows show with correct badges, amounts, challenge links, timestamps
- If no transactions: empty state shows with "Create a challenge" link
- Top-up badge is blue, Staked is orange, Won is green, Refund is grey
- Positive amounts are green with "+", negative (stake) amounts are red with "-"

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/app/profile/page.tsx
git commit -m "Add transaction history section to profile page"
```
