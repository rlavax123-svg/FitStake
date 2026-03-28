# Verify Activity CRE Workflow

Daily cron workflow that:
1. Reads active challenges from FitStake.sol
2. For each participant, fetches Strava activities via our API
3. Applies anti-cheat filters
4. Writes verified distances on-chain

## Setup

```bash
cre init verify-activity --language ts
```

## Trigger
- **Type:** Cron
- **Schedule:** Daily at midnight UTC (`0 0 * * *`)

## Flow
1. EVMClient → read active challenges from FitStake contract
2. HTTPClient → GET /api/strava/activities?wallet={address}&after={lastCheck}
3. Process response (distance already filtered by API)
4. Check bonus day multiplier from FitStakeVRF contract
5. EVMClient → call submitBatchVerification() on FitStake contract
