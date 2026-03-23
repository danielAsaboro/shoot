# Adrena Upstream Snapshot Contract

This file is the backend handoff for the `adrena` provider path.

## Endpoint

- Route shape expected by the app provider: `GET {ADRENA_COMPETITION_API_BASE_URL}/snapshot`
- Example local route: `/api/adrena-upstream/snapshot`
- Source-mapped local route: `/api/adrena-upstream/mapped-snapshot`
- Machine-readable schema + example: `/api/adrena-upstream/schema`

## Query params

- `wallet`: optional wallet address string used to personalize viewer state
- `enrolledCohortId`: optional cohort id used to personalize viewer enrollment

## Response contract

The upstream response must match schema version `adrena-competition-snapshot-v1`.

Top-level fields:

- `meta`
- `config`
- `season`
- `viewer`
- `cohorts`

## Backend source records that need to exist

- competition config / preset definitions
- season aggregates
- cohort definitions
- leaderboard rows per cohort
- abuse review rows per cohort
- viewer profile state
- viewer quest progress / raffle / streak state

The repo includes a concrete mapping layer in
`lib/competition/adrena-source-adapters.ts` showing how these source records
become the normalized snapshot contract.

## Important field rules

- All timestamps must be ISO strings.
- Numeric values must be numbers, not strings.
- `viewer.enrolled_cohort_id` and `viewer.reward_preview` may be `null`.
- Suspicious accounts should remain present in `cohorts[].standings`; use
  `eligible=false` and `disqualification_reason` instead of dropping them.
- Reward rows should already be sorted and rank-aligned with standings.

## Normalization behavior in the app

- The app validates upstream payloads at runtime before using them.
- Invalid payloads fail fast with descriptive field-level errors.
- The client consumes only the internal normalized snapshot shape after validation.

## Local verification flow

```shell
NEXT_PUBLIC_COMPETITION_PROVIDER=adrena \
ADRENA_COMPETITION_API_BASE_URL=http://localhost:3000/api/adrena-upstream \
npm run dev
```

Then check:

- `/api/adrena-upstream/snapshot`
- `/api/adrena-upstream/mapped-snapshot`
- `/api/adrena-upstream/schema`
- `/api/competition/snapshot?wallet=wallet-example-1234&enrolledCohortId=cohort-macro-0319`

## Backend implementation notes

- If Adrena has richer internal fields, map them upstream and keep this route as
  the stable contract boundary.
- Version the schema by changing `meta.schema_version` and adding a new
  normalizer when breaking changes are needed.
- Keep source-specific heuristics outside the UI repo; this repo should only
  consume the stable snapshot contract.
