# Transaction History — Design Spec

## Overview

Add a transaction history section to the existing Profile page. Shows all financial activity (stakes, winnings, refunds, top-ups) in a chronological list with challenge context.

## Location

New section in `packages/web/src/app/profile/page.tsx`, placed between the balance/stats header and the completed challenges section.

## API Endpoint

**`GET /api/me/transactions`**

- File: `packages/web/src/app/api/me/transactions/route.ts`
- Auth: requires session via `getSession()`
- Query: Supabase `transactions` table filtered by `user_id`, ordered by `created_at DESC`
- Join: left join `challenge_metadata` on `chain_challenge_id` to get challenge `name`
- Response shape:

```json
[
  {
    "id": "uuid",
    "type": "stake" | "winnings" | "refund" | "topup",
    "amount": 5.00,
    "chain_challenge_id": 1,
    "challenge_name": "Morning 5K",
    "tx_hash": "0x...",
    "created_at": "2026-03-30T12:00:00Z"
  }
]
```

## UI Design

### Row Layout

Each transaction is a row inside a single card container. Per row:

- **Left:** Type badge with color coding
  - Top-up: `bg-blue-500/10 text-blue-400` — "Top-up"
  - Staked: `bg-orange-500/10 text-orange-400` — "Staked"
  - Won: `bg-green-500/10 text-green-400` — "Won"
  - Refund: `bg-zinc-500/10 text-zinc-400` — "Refund"
- **Center:** Description text
  - Stakes/winnings/refunds: challenge name as a link to `/challenges/[chain_challenge_id]`
  - Top-ups: "Balance top-up" (no link)
- **Right:** Amount with color
  - Positive (topup, winnings, refund): `text-green-400` with "+" prefix
  - Negative (stake): `text-red-400` with "-" prefix
- **Below description:** Relative timestamp in `text-xs text-zinc-500` ("2h ago", "Mar 28")

### Container

```
bg-zinc-900 border border-zinc-800 rounded-xl
```

Rows separated by `border-t border-zinc-800`. No individual cards per row.

### Section Header

```
<h2 className="text-lg font-semibold mb-3">Transaction History</h2>
```

### States

- **Loading:** 3-4 skeleton rows with `animate-pulse`
- **Empty:** "No transactions yet. Create a challenge to get started!" with link to `/challenges/create`
- **Populated:** Scrollable list, no pagination

## Data Flow

1. Profile page mounts
2. Fetch `GET /api/me/transactions`
3. Render transaction list
4. Challenge names link to challenge detail pages

## Files to Create/Modify

- **Create:** `packages/web/src/app/api/me/transactions/route.ts` — API endpoint
- **Modify:** `packages/web/src/app/profile/page.tsx` — Add transaction history section

## Out of Scope

- Filtering by type
- Running balance column
- Pagination / infinite scroll
- Transaction detail modal
