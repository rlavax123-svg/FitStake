# Join Window / Start Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a join window so creators set a start time, challenges accept joins until then, and only post-start activity counts. Solo challenges allowed.

**Architecture:** Contract changes enforce join window + solo settlement. Backend passes startTime through. UI adds start time picker and join window display. Cron activates challenges with 1+ participants.

**Tech Stack:** Solidity 0.8.24 (Foundry), Next.js API routes, React client components, Supabase, wagmi/viem

---

### Task 1: Contract changes — join window, solo settlement, duration minimum

**Files:**
- Modify: `packages/contracts/src/FitStake.sol`

- [ ] **Step 1: Add JoinWindowClosed error**

After the existing `error InvalidParticipant();` line (line 101), add:

```solidity
error JoinWindowClosed();
```

- [ ] **Step 2: Change minimum duration from 10 minutes to 1440 minutes (1 day)**

In `_createChallenge` (line 181), change:

```solidity
if (durationMinutes < 10 || durationMinutes > 525600) revert InvalidDuration();
```

to:

```solidity
if (durationMinutes < 1440 || durationMinutes > 525600) revert InvalidDuration();
```

- [ ] **Step 3: Add join window check to _joinChallenge**

In `_joinChallenge` (after line 248 `Challenge storage c = challenges[challengeId];`), add:

```solidity
if (block.timestamp >= c.startTime) revert JoinWindowClosed();
```

- [ ] **Step 4: Remove H2H auto-activate from _joinChallenge**

Delete the entire H2H auto-activate block (lines 264-271):

```solidity
// Auto-activate HeadToHead when 2 players join
if (c.challengeType == ChallengeType.HeadToHead && c.participantCount == 2) {
    uint256 originalDuration = c.endTime - c.startTime;
    c.state = ChallengeState.Active;
    c.startTime = block.timestamp;
    c.endTime = c.startTime + originalDuration;
    emit ChallengeActivated(challengeId);
}
```

- [ ] **Step 5: Change activateChallenge to allow solo challenges**

In `activateChallenge` (lines 288-292), replace:

```solidity
if (c.participantCount < 2) {
    // Not enough participants — cancel and refund
    _cancelAndRefund(challengeId);
    return;
}
```

with:

```solidity
// participantCount is always >= 1 (creator). Solo challenges are allowed.
```

(Just remove the block entirely — all challenges activate regardless of participant count.)

- [ ] **Step 6: Add solo settlement logic in settle**

In `settle`, after `uint256 distributablePot = totalPot - fee;` (line 348) and before `bool skipFee = false;` (line 350), replace the settlement logic from line 350 to line 368 with:

```solidity
// Solo challenge: no fee if winner, forfeit to feeRecipient if loser
if (c.participantCount == 1) {
    c.state = ChallengeState.Settled;
    address soloParticipant = challengeParticipants[challengeId][0];
    bool hitGoal = false;

    if (c.challengeType == ChallengeType.GroupGoal) {
        hitGoal = verifiedDistanceCm[challengeId][soloParticipant] >= c.distanceGoalCm;
    } else {
        hitGoal = verifiedDistanceCm[challengeId][soloParticipant] > 0;
    }

    if (hitGoal) {
        // Full stake back, no fee
        _safeTransfer(creForwarder, totalPot);
        emit ChallengeSettled(challengeId, 1, totalPot);
    } else {
        // Forfeit to fee recipient
        _safeTransfer(feeRecipient, totalPot);
        emit ChallengeSettled(challengeId, 0, 0);
    }
    return;
}

bool skipFee = false;
uint256 winnersCount = 0;

if (c.challengeType == ChallengeType.GroupGoal) {
    winnersCount = _countGroupGoalWinners(challengeId, participants, c.distanceGoalCm);
} else {
    (winnersCount, skipFee) = _determineHeadToHeadResult(challengeId, participants);
}

// Send all funds to creForwarder for off-chain distribution
uint256 payout = skipFee ? totalPot : distributablePot;
_safeTransfer(creForwarder, payout);

// Transfer platform fee (skip on H2H ties — full refund)
if (fee > 0 && !skipFee) {
    _safeTransfer(feeRecipient, fee);
}

emit ChallengeSettled(challengeId, winnersCount, payout);
```

Note: The `c.state = ChallengeState.Settled;` line that was on line 343 should remain before this block. The `address[] storage participants` and `totalPot`/`fee`/`distributablePot` declarations also remain. The solo check goes right after those declarations, before the multi-participant path.

- [ ] **Step 7: Commit**

```bash
cd packages/contracts && forge build
git add packages/contracts/src/FitStake.sol
git commit -m "Add join window, solo settlement, 1-day minimum duration"
```

---

### Task 2: Update contract tests

**Files:**
- Modify: `packages/contracts/test/FitStake.t.sol`

- [ ] **Step 1: Update duration constant and too-short-duration test**

Change `DURATION_30_DAYS` constant (line 20) — it's already 43200 minutes (30 days), which is fine.

Update `test_revert_createWithTooShortDuration` (line 85-91) to use 1439 instead of 9:

```solidity
function test_revert_createWithTooShortDuration() public {
    vm.prank(alice);
    vm.expectRevert(FitStake.InvalidDuration.selector);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, 1439, block.timestamp + 1 days, 10, false, bytes32(0)
    );
}
```

- [ ] **Step 2: Update helper functions to use future startTime**

All helpers currently use `block.timestamp` as startTime. Update `_createGroupGoalChallenge` to use `block.timestamp + 1 hours` so join window is open:

```solidity
function _createGroupGoalChallenge(address creator) internal {
    vm.prank(creator);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp + 1 hours, 10, false, bytes32(0)
    );
}

function _createGroupGoalChallengeFor(address participant) internal {
    vm.prank(creForwarder);
    fitStake.createChallengeFor{value: STAKE}(
        participant,
        FitStake.ChallengeType.GroupGoal,
        DISTANCE_50KM,
        DURATION_30_DAYS,
        block.timestamp + 1 hours,
        10,
        false,
        bytes32(0)
    );
}
```

Update `_createAndActivateGroupGoal` to warp past startTime before activating:

```solidity
function _createAndActivateGroupGoal() internal {
    _createGroupGoalChallenge(alice);

    vm.prank(bob);
    fitStake.joinChallenge{value: STAKE}(1, "");

    // Warp past startTime so activation works
    vm.warp(block.timestamp + 2 hours);

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);
}
```

Update `_createAndActivateHeadToHead` — H2H no longer auto-activates on join, so we need to warp + activate:

```solidity
function _createAndActivateHeadToHead() internal {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.HeadToHead, DISTANCE_50KM, 20160, block.timestamp + 1 hours, 0, false, bytes32(0)
    );

    vm.prank(bob);
    fitStake.joinChallenge{value: STAKE}(1, "");

    // Warp past startTime and activate
    vm.warp(block.timestamp + 2 hours);

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);
}
```

- [ ] **Step 3: Update H2H auto-activate tests**

Replace `test_headToHeadAutoActivates` (line 216-227) with a join window test:

```solidity
function test_headToHead_doesNotAutoActivateOnJoin() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.HeadToHead, DISTANCE_50KM, 20160, block.timestamp + 1 hours, 0, false, bytes32(0)
    );

    vm.prank(bob);
    fitStake.joinChallenge{value: STAKE}(1, "");

    // Should still be Created (not auto-activated)
    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Created));
}
```

Replace `test_joinChallengeFor_headToHeadAutoActivates` (line 244-262) with:

```solidity
function test_joinChallengeFor_headToHead_staysCreated() public {
    vm.prank(creForwarder);
    fitStake.createChallengeFor{value: STAKE}(
        alice,
        FitStake.ChallengeType.HeadToHead,
        DISTANCE_50KM,
        20160,
        block.timestamp + 1 hours,
        0,
        false,
        bytes32(0)
    );

    vm.prank(creForwarder);
    fitStake.joinChallengeFor{value: STAKE}(1, bob, "");

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Created));
}
```

- [ ] **Step 4: Add join window closed test**

After the join tests section, add:

```solidity
function test_revert_joinAfterStartTime() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp + 1 hours, 10, false, bytes32(0)
    );

    // Warp past startTime
    vm.warp(block.timestamp + 2 hours);

    vm.prank(bob);
    vm.expectRevert(FitStake.JoinWindowClosed.selector);
    fitStake.joinChallenge{value: STAKE}(1, "");
}
```

- [ ] **Step 5: Update activate test — solo now activates instead of cancelling**

Replace `test_activateCancelsIfNotEnoughParticipants` (line 292-307) with:

```solidity
function test_activateSoloChallenge() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp, 10, false, bytes32(0)
    );

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Active));
}
```

- [ ] **Step 6: Add solo settlement tests**

After the settlement tests section, add:

```solidity
function test_settleSolo_winnerGetsFullRefund() public {
    // Create solo challenge (startTime = now, so it activates immediately)
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp, 10, false, bytes32(0)
    );

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);

    // Verify distance exceeds goal
    vm.prank(creForwarder);
    fitStake.submitVerification(1, alice, 60_000_00); // 60km > 50km goal

    vm.warp(block.timestamp + 31 days);

    uint256 creBefore = creForwarder.balance;
    uint256 feeRecipientBefore = feeRecipient.balance;

    vm.prank(creForwarder);
    fitStake.settle(1);

    // Full stake returned to creForwarder, NO fee
    assertEq(creForwarder.balance, creBefore + STAKE);
    assertEq(feeRecipient.balance, feeRecipientBefore); // No fee taken
}

function test_settleSolo_loserForfeitsTofeeRecipient() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp, 10, false, bytes32(0)
    );

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);

    // Verify distance below goal
    vm.prank(creForwarder);
    fitStake.submitVerification(1, alice, 20_000_00); // 20km < 50km goal

    vm.warp(block.timestamp + 31 days);

    uint256 creBefore = creForwarder.balance;
    uint256 feeRecipientBefore = feeRecipient.balance;

    vm.prank(creForwarder);
    fitStake.settle(1);

    // Stake forfeited to feeRecipient
    assertEq(feeRecipient.balance, feeRecipientBefore + STAKE);
    assertEq(creForwarder.balance, creBefore); // Nothing to creForwarder
}
```

- [ ] **Step 7: Update the short duration test and full lifecycle test**

Replace `test_shortDuration_10minutes` (line 557-586) — 10 minutes is no longer valid. Replace with a 1-day test:

```solidity
function test_shortDuration_1day() public {
    vm.prank(creForwarder);
    fitStake.createChallengeFor{value: STAKE}(
        alice,
        FitStake.ChallengeType.GroupGoal,
        100_00, // 1km
        1440, // 1 day in minutes
        block.timestamp,
        0,
        false,
        bytes32(0)
    );

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(c.endTime, c.startTime + 1 days);
}
```

Update `test_fullServerSideLifecycle` (line 592-634) — change duration from 30 minutes to 1440 and add explicit activation:

```solidity
function test_fullServerSideLifecycle() public {
    // 1. Create challenge for alice with future startTime
    vm.prank(creForwarder);
    fitStake.createChallengeFor{value: STAKE}(
        alice,
        FitStake.ChallengeType.HeadToHead,
        100_00, // 1km
        1440, // 1 day
        block.timestamp + 1 hours,
        0,
        false,
        bytes32(0)
    );

    // 2. Join for bob (stays Created — no auto-activate)
    vm.prank(creForwarder);
    fitStake.joinChallengeFor{value: STAKE}(1, bob, "");

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Created));

    // 3. Warp past startTime and activate
    vm.warp(block.timestamp + 2 hours);
    vm.prank(creForwarder);
    fitStake.activateChallenge(1);

    c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Active));

    // 4. Submit verification
    vm.startPrank(creForwarder);
    fitStake.submitVerification(1, alice, 200_00); // 2km
    fitStake.submitVerification(1, bob, 50_00); // 0.5km

    // 5. Settle after expiry
    vm.warp(block.timestamp + 2 days);

    uint256 creBefore = creForwarder.balance;
    fitStake.settle(1);
    vm.stopPrank();

    // 6. All funds go to creForwarder
    uint256 totalPot = STAKE * 2;
    uint256 fee = (totalPot * 500) / 10_000;
    uint256 distributable = totalPot - fee;

    assertEq(creForwarder.balance, creBefore + distributable);

    c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Settled));
}
```

- [ ] **Step 8: Fix remaining tests that use block.timestamp as startTime**

Update `test_createGroupGoalChallenge` — change startTime from `block.timestamp + 1 days` to keep as-is (it already uses future startTime, which is correct).

Update `test_activateGroupGoal` (line 276-289) to use future startTime and warp:

```solidity
function test_activateGroupGoal() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.GroupGoal, DISTANCE_50KM, DURATION_30_DAYS, block.timestamp + 1 hours, 10, false, bytes32(0)
    );

    vm.prank(bob);
    fitStake.joinChallenge{value: STAKE}(1, "");

    vm.warp(block.timestamp + 2 hours);

    vm.prank(creForwarder);
    fitStake.activateChallenge(1);

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(uint256(c.state), uint256(FitStake.ChallengeState.Active));
}
```

Update `test_createHeadToHeadChallenge` to use future startTime:

```solidity
function test_createHeadToHeadChallenge() public {
    vm.prank(alice);
    fitStake.createChallenge{value: STAKE}(
        FitStake.ChallengeType.HeadToHead,
        DISTANCE_50KM,
        20160,
        block.timestamp + 1 hours,
        0,
        false,
        bytes32(0)
    );

    FitStake.Challenge memory c = fitStake.getChallenge(1);
    assertEq(c.maxParticipants, 2);
}
```

- [ ] **Step 9: Run tests and commit**

```bash
cd packages/contracts && forge test -v
git add packages/contracts/test/FitStake.t.sol
git commit -m "Update contract tests for join window and solo settlement"
```

---

### Task 3: Backend changes — create API + cron

**Files:**
- Modify: `packages/web/src/app/api/challenges/create/route.ts`
- Modify: `packages/web/src/app/api/cron/verify/route.ts`

- [ ] **Step 1: Update create API to accept startTime and enforce 1-day minimum**

In `packages/web/src/app/api/challenges/create/route.ts`:

Change the body destructuring (line 15) to include startTime:

```typescript
const { name, challengeType, distanceKm, durationMinutes, stakeGbp, maxParticipants, isPrivate, inviteCode, startTime: startTimeInput } = body
```

Update duration validation (line 27-29):

```typescript
if (!durationMinutes || durationMinutes < 1440 || durationMinutes > 525600) {
  return NextResponse.json({ error: 'Duration must be at least 1 day (up to 365 days)' }, { status: 400 })
}
```

Replace the startTime line (line 77) with:

```typescript
const startTime = startTimeInput
  ? Math.max(Math.floor(startTimeInput), Math.floor(Date.now() / 1000))
  : Math.floor(Date.now() / 1000)
```

- [ ] **Step 2: Update cron to activate with 1+ participants**

In `packages/web/src/app/api/cron/verify/route.ts`, line 85, change:

```typescript
else if (nowSec >= startTime && participantCount >= 2) {
```

to:

```typescript
else if (nowSec >= startTime && participantCount >= 1) {
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/api/challenges/create/route.ts packages/web/src/app/api/cron/verify/route.ts
git commit -m "Accept startTime in create API, activate solo challenges in cron"
```

---

### Task 4: Create challenge UI — start time picker, remove minutes

**Files:**
- Modify: `packages/web/src/app/challenges/create/page.tsx`

- [ ] **Step 1: Remove minutes from DurationUnit and update helpers**

Replace the type and helper functions at the top of the file (lines 9-24) with:

```typescript
type DurationUnit = 'hours' | 'days' | 'weeks'

function durationToMinutes(value: number, unit: DurationUnit): number {
  switch (unit) {
    case 'hours': return value * 60
    case 'days': return value * 1440
    case 'weeks': return value * 10080
  }
}

function formatDuration(value: string, unit: DurationUnit): string {
  const n = parseInt(value) || 0
  if (unit === 'hours') return `${n} hour${n !== 1 ? 's' : ''}`
  if (unit === 'days') return `${n} day${n !== 1 ? 's' : ''}`
  return `${n} week${n !== 1 ? 's' : ''}`
}
```

- [ ] **Step 2: Add startTime state and update defaults**

After the existing state declarations (around line 35-39), change `durationUnit` default and add startTime state:

```typescript
const [durationUnit, setDurationUnit] = useState<DurationUnit>('days')
```

After the `inviteCode` state, add:

```typescript
const [startOption, setStartOption] = useState<'now' | 'scheduled'>('now')
const [startDate, setStartDate] = useState('')
const [startTimeInput, setStartTimeInput] = useState('')
```

- [ ] **Step 3: Update validation**

Replace the `invalidDuration` line (line 73) with:

```typescript
const invalidDuration = totalMinutes < 1440 || totalMinutes > 525600
```

Add after it:

```typescript
const startTimestamp = startOption === 'now'
  ? Math.floor(Date.now() / 1000)
  : startDate && startTimeInput
    ? Math.floor(new Date(`${startDate}T${startTimeInput}`).getTime() / 1000)
    : null
const invalidStartTime = startOption === 'scheduled' && (!startTimestamp || startTimestamp < Math.floor(Date.now() / 1000))
```

- [ ] **Step 4: Update handleCreate to pass startTime**

In the `body: JSON.stringify({...})` call (lines 82-91), add startTime:

```typescript
body: JSON.stringify({
  name,
  challengeType,
  distanceKm: parseToKm(parseFloat(distanceInput)),
  durationMinutes: totalMinutes,
  stakeGbp: stakeNum,
  maxParticipants: challengeType === 1 ? 2 : parseInt(maxParticipants),
  isPrivate,
  inviteCode: isPrivate ? inviteCode : undefined,
  startTime: startTimestamp,
}),
```

- [ ] **Step 5: Add start time picker to the form**

After the duration picker `</div></div>` (after line 221) and before the stake input, add:

```tsx
<div className="mb-4">
  <label className="block text-sm text-zinc-400 mb-2">Start Time</label>
  <div className="grid grid-cols-2 gap-3 mb-3">
    <button
      onClick={() => setStartOption('now')}
      className={`p-3 rounded-xl border text-sm transition ${
        startOption === 'now'
          ? 'border-indigo-500 bg-indigo-600/10 text-zinc-100'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
      }`}
    >
      Start immediately
    </button>
    <button
      onClick={() => setStartOption('scheduled')}
      className={`p-3 rounded-xl border text-sm transition ${
        startOption === 'scheduled'
          ? 'border-indigo-500 bg-indigo-600/10 text-zinc-100'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
      }`}
    >
      Schedule start
    </button>
  </div>
  {startOption === 'scheduled' && (
    <div className="flex gap-2">
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        min={new Date().toISOString().split('T')[0]}
        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
      />
      <input
        type="time"
        value={startTimeInput}
        onChange={(e) => setStartTimeInput(e.target.value)}
        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
      />
    </div>
  )}
  {invalidStartTime && (
    <p className="text-red-400 text-xs mt-1">Start time must be in the future</p>
  )}
</div>
```

- [ ] **Step 6: Remove minutes from duration select and update validation message**

In the duration select (line 207-215), remove the minutes option and add weeks:

```tsx
<select
  value={durationUnit}
  onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-zinc-100 focus:outline-none focus:border-indigo-500 transition"
>
  <option value="hours">hrs</option>
  <option value="days">days</option>
  <option value="weeks">wks</option>
</select>
```

Update the validation message (line 218-219):

```tsx
{invalidDuration && (
  <p className="text-red-400 text-xs mt-1">Duration must be 1 day to 365 days</p>
)}
```

- [ ] **Step 7: Update challenge preview to show start time**

In the preview section (around line 286), update to show start info:

```tsx
<div className="text-zinc-100">
  <span className="font-semibold">{name || 'Untitled Challenge'}</span>
  {' — '}
  Run {distanceInput} {unit === 'mi' ? 'miles' : 'km'} in {formatDuration(durationValue, durationUnit)}.{' '}
  <span className="text-amber-400">£{stakeGbp}</span> to join.
  {challengeType === 0
    ? ` Up to ${maxParticipants} runners.`
    : ' 1v1 — winner takes all.'}
  {isPrivate && ' Private.'}
  {startOption === 'scheduled' && startDate && ` Starts ${startDate}.`}
</div>
```

- [ ] **Step 8: Update submit button disabled check**

Add `invalidStartTime` to the disabled condition (line 312):

```tsx
disabled={isSubmitting || !name || insufficientBalance || invalidDuration || invalidStartTime}
```

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/app/challenges/create/page.tsx
git commit -m "Add start time picker, remove minutes, add weeks option"
```

---

### Task 5: Dashboard + challenge detail — join window display

**Files:**
- Modify: `packages/web/src/app/page.tsx`
- Modify: `packages/web/src/app/challenges/[id]/page.tsx`

- [ ] **Step 1: Update dashboard challenge cards to show join window status**

In `packages/web/src/app/page.tsx`, find where challenge cards are rendered in the Dashboard component. In the card display for Created (state=0) challenges, where the time remaining is shown, update to show "Joining open · Starts in X" instead of just time remaining.

Find the card rendering section and locate where `STATE_LABELS` or state badges are used for Created challenges. Add logic to check if `startTime` is in the future vs the current display. Since `startTime` is available from the contract data, use it:

```tsx
{Number(c.state) === 0 && Number(c.startTime) > Math.floor(Date.now() / 1000) && (
  <span className="text-xs text-indigo-400">
    Joining open · Starts {timeRemaining(Number(c.startTime))}
  </span>
)}
```

This replaces the existing time display for Created challenges that have a future startTime.

- [ ] **Step 2: Update challenge detail page — disable join after startTime**

In `packages/web/src/app/challenges/[id]/page.tsx`, find the Join button. Add a check: if `challenge.startTime <= Date.now() / 1000` and state is still Created, show "Join window closed" instead of the join button.

After the existing state variables in the component, add:

```typescript
const nowSec = Math.floor(Date.now() / 1000)
const joinWindowOpen = challenge && Number(challenge.state) === 0 && Number(challenge.startTime) > nowSec
const joinWindowClosed = challenge && Number(challenge.state) === 0 && Number(challenge.startTime) <= nowSec
```

Where the Join button is rendered, wrap it with a condition:

```tsx
{joinWindowClosed && (
  <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-center">
    <p className="text-zinc-400 text-sm">Join window closed. Challenge starts soon.</p>
  </div>
)}
{joinWindowOpen && !isParticipant && (
  // existing join button
)}
```

Add a countdown display for scheduled challenges:

```tsx
{joinWindowOpen && (
  <div className="bg-indigo-600/10 border border-indigo-600/30 rounded-xl p-3 mb-4 text-center">
    <span className="text-sm text-indigo-400">
      Joining open · Challenge starts {timeRemaining(Number(challenge.startTime))}
    </span>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/page.tsx packages/web/src/app/challenges/[id]/page.tsx
git commit -m "Show join window status on dashboard and challenge detail"
```
