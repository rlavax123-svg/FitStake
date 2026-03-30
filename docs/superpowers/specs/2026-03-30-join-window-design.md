# Join Window / Start Time — Design Spec

## Overview

Add a join window to challenges so latecomers aren't disadvantaged. Creators set a start time when creating a challenge. The challenge accepts joins until that time, then locks and activates. Only activity after the start time counts.

## Contract Changes

**Duration:**
- Remove minutes as a duration unit — minimum duration is 1 day (86400 seconds)
- Duration is specified in days, applied from `startTime` to calculate `endTime`

**New field:**
- `startTime` is already in the contract — currently set at creation time. Change so the creator explicitly sets it to a future time (or now).

**Lifecycle:**
- `Created` state: challenge is open for joins. Remains in this state until `startTime`.
- At `startTime`: challenge moves to `Active`. No more joins allowed.
- `endTime = startTime + (durationDays * 86400)`

**Validation:**
- `startTime` must be >= block.timestamp (can't start in the past)
- `endTime` must be > `startTime` (duration >= 1 day)
- No minimum gap between creation and start time

**Join restriction:**
- `joinChallengeFor` reverts if `block.timestamp >= startTime` (join window closed)

## Solo Challenge Handling

- If only the creator is in at `startTime`, challenge still activates (changed from requiring 2+ participants)
- At settlement:
  - Solo participant who hits the distance goal: full stake returned, zero fees
  - Solo participant who misses the goal: stake is forfeited (sent to protocol/fee address)
- Contract logic: `if (participantCount == 1 && winners.length == 1)` → return full stake, no fee deduction

## Auto-Management (Cron)

Update `/api/cron/verify`:
- Auto-activate: challenges past `startTime` with 1+ participants (changed from 2+)
- Auto-cancel: challenges past `endTime` still in `Created` state (never activated — edge case)
- Auto-settle: no change (already settles expired `Active` challenges)

## UI Changes

### Create Challenge Form

- Replace duration picker: remove minutes option, keep hours/days/weeks
- Add start time picker: date + time input, defaults to "now" (immediate start)
- Validation: start time can't be in the past, duration minimum 1 day
- Show computed end time based on start + duration

### Challenge Card (Dashboard + Browse)

- Before start: show "Joining open · Starts [relative time]" (e.g., "Starts in 3h")
- After start: show existing active/ended display
- Join button visible only before `startTime`

### Challenge Detail Page

- Before start: countdown to start time, "Join" button prominent, participant list
- After start: existing active view (leaderboard, progress bars, time remaining)
- After `startTime`: join button hidden or disabled with "Join window closed" text

## Verification Change

When verifying Strava activities for a challenge, filter to only count activities where:
- `activity.start_date >= challenge.startTime`

This applies to both webhook verification and manual admin verification.

## API Changes

### POST /api/challenges/create

- Accept `startTime` parameter (ISO 8601 or unix timestamp)
- Default to current time if not provided (immediate start, backward compatible)
- Pass to contract's `createChallengeFor`

### Strava Webhook + Admin Verify

- When calculating distance for a participant, filter activities by `start_date >= startTime`
- Fetch `startTime` from contract via `getChallenge()`

## Files to Modify

- `packages/contracts/src/FitStake.sol` — join restriction, solo settlement, duration minimum
- `packages/contracts/test/FitStake.t.sol` — update tests for new rules
- `packages/web/src/app/challenges/create/page.tsx` — start time picker, remove minutes
- `packages/web/src/app/challenges/[id]/page.tsx` — join window UI, countdown
- `packages/web/src/app/api/challenges/create/route.ts` — pass startTime
- `packages/web/src/app/api/strava/webhook/route.ts` — filter activities by startTime
- `packages/web/src/app/api/cron/verify/route.ts` — update auto-activate threshold (1+)
- `packages/web/src/app/page.tsx` — challenge card display updates

## Out of Scope

- Extending join windows
- Notifications when join window is closing
- Private challenge invites (already exists via invite codes)
