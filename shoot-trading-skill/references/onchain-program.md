# Shoot On-Chain Program Reference

Program ID: `4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG`
Source: `programs/shoot/src/lib.rs`
Framework: Anchor (Rust)

## Authority Model

- **admin** — Creates challenges, updates status, pauses. Multisig in production.
- **result_authority** — Submits results, settles payouts, updates agent stats. Backend hot wallet.

Neither authority can unilaterally steal funds. Settlement requires both a submitted result AND vault balance.

---

## PDA Derivation

All PDAs use `SHOOT_PROGRAM_ID` as the program.

| Account | Seeds | Notes |
|---------|-------|-------|
| Challenge | `["challenge", admin, challenge_id]` | String challenge_id (UTF-8) |
| Vault | `["vault", challenge]` | Token account owned by this PDA |
| Enrollment | `["enrollment", challenge, trader]` | |
| Funded | `["funded", trader]` | |
| Agent | `["agent", owner, owner[0..8]]` | First 8 bytes of owner pubkey |

---

## Instructions (11)

### Admin Instructions

#### initialize_challenge
Creates a Challenge PDA + Vault token account.

**Signer:** admin
**Params:** challenge_id (String, max 32), tier_name (String, max 16), entry_fee_usdc (u64), profit_target_bps (u16), max_drawdown_bps (u16), daily_loss_limit_bps (u16), duration_seconds (i64), min_capital_usd (u64), participant_cap (u16)
**Accounts:** admin, result_authority, challenge (init), usdc_mint, vault (init), token_program, system_program, rent

#### update_challenge_status
Transitions challenge state.

**Signer:** admin (must == challenge.admin)
**Params:** new_status (ChallengeStatus)
**Valid transitions:** Active -> Settling -> Closed

#### pause_challenge
Blocks new enrollments. Existing enrollments can still be scored.

**Signer:** admin (must == challenge.admin)
**Params:** paused (bool)

### Trader Instructions

#### enroll
Enrolls trader, transfers USDC entry fee from trader to vault.

**Signer:** trader
**Params:** starting_equity_usd (u64, must >= min_capital_usd)
**Accounts:** trader, challenge (mut), enrollment (init), trader_usdc (mut), vault (mut), token_program, system_program
**Constraints:** Challenge must be Active and not paused, enrolled_count < participant_cap

#### claim_funded_status
Claims funded trader status after passing and settling a challenge.

**Signers:** trader + authority (result_authority co-sign)
**Params:** level (FundedLevel), revenue_share_bps (u16, max 1500)
**Accounts:** trader, authority, challenge, enrollment, funded_trader (init_if_needed), system_program
**Constraints:** Enrollment must be Passed and settled

#### register_agent
Creates an Agent PDA for autonomous trading.

**Signer:** owner
**Params:** name (String, max 32, non-empty), strategy_hash ([u8; 32])
**Accounts:** owner, agent (init), system_program
**Initial state:** elo_rating=1000, wins=0, losses=0, status=Active

#### update_agent_strategy
Updates the agent's strategy hash.

**Signer:** owner (must == agent.owner)
**Params:** new_strategy_hash ([u8; 32])

#### retire_agent
Deactivates the agent. Cannot be done while enrolled in active competitions.

**Signer:** owner (must == agent.owner)
**Constraint:** agent.status must be Active
**Sets:** agent.status = Retired

### Result Authority Instructions

#### submit_result
Records trading result for an enrollment.

**Signer:** authority (must == challenge.result_authority)
**Params:** status (EnrollmentStatus, must != Active), final_pnl_bps (i32), final_drawdown_bps (u16)
**Accounts:** authority, challenge, enrollment (mut)
**Constraint:** Enrollment must be Active

#### settle_challenge
Transfers USDC payout from vault to trader.

**Signer:** authority (must == challenge.result_authority)
**Params:** payout_usdc (u64)
**Accounts:** authority, challenge, enrollment (mut), trader, trader_usdc (mut), vault (mut), token_program, system_program
**Constraints:** Enrollment must be Passed and not yet settled, vault balance >= payout_usdc
**CPI signer:** vault PDA with seeds `["vault", challenge, vault_bump]`

#### update_agent_stats
Records competition outcome on the Agent PDA.

**Signer:** authority (must == challenge.result_authority)
**Params:** won (bool), pnl_bps (i32), trade_count (u32), new_elo (u32)
**Accounts:** authority, challenge, agent (mut)
**Updates (checked arithmetic):** wins/losses, total_trades, total_pnl_bps, competitions_entered, elo_rating, last_trade_at

---

## Account Structures

### Challenge
| Field | Type | Notes |
|-------|------|-------|
| admin | Pubkey | Challenge creator |
| result_authority | Pubkey | Settlement authority |
| challenge_id | String | Max 32 bytes |
| tier_name | String | Max 16 bytes |
| entry_fee_usdc | u64 | In USDC base units (6 decimals) |
| profit_target_bps | u16 | Basis points (800 = 8%) |
| max_drawdown_bps | u16 | |
| daily_loss_limit_bps | u16 | |
| duration_seconds | i64 | |
| min_capital_usd | u64 | In USDC base units |
| participant_cap | u16 | |
| enrolled_count | u16 | Incremented on enroll |
| status | ChallengeStatus | |
| created_at | i64 | Unix timestamp |
| vault | Pubkey | Vault token account |
| usdc_mint | Pubkey | |
| bump | u8 | |
| vault_bump | u8 | |
| paused | bool | |

### Enrollment
| Field | Type | Notes |
|-------|------|-------|
| trader | Pubkey | |
| challenge | Pubkey | |
| starting_equity_usd | u64 | |
| enrolled_at | i64 | |
| settled | bool | Set true after settle_challenge |
| status | EnrollmentStatus | |
| final_pnl_bps | i32 | Signed |
| final_drawdown_bps | u16 | |
| payout_usdc | u64 | |
| result_submitted_at | i64 | |
| bump | u8 | |

### FundedTrader
| Field | Type | Notes |
|-------|------|-------|
| trader | Pubkey | |
| level | FundedLevel | |
| revenue_share_bps | u16 | Max 1500 (15%) |
| promoted_at | i64 | |
| consecutive_weeks | u16 | |
| total_challenges_passed | u16 | |
| qualifying_challenge | Pubkey | |
| bump | u8 | |

### Agent
| Field | Type | Notes |
|-------|------|-------|
| owner | Pubkey | |
| name | String | Max 32 bytes |
| strategy_hash | [u8; 32] | SHA-256 of strategy ID |
| elo_rating | u32 | Starts at 1000 |
| wins | u32 | |
| losses | u32 | |
| total_trades | u32 | |
| total_pnl_bps | i64 | Cumulative, signed |
| competitions_entered | u16 | |
| status | AgentStatus | |
| created_at | i64 | |
| last_trade_at | i64 | |
| bump | u8 | |

---

## Enums

### ChallengeStatus
| Value | Name | Transitions To |
|-------|------|----------------|
| 0 | Active | Settling |
| 1 | Settling | Closed |
| 2 | Closed | (terminal) |

### EnrollmentStatus
| Value | Name | Description |
|-------|------|-------------|
| 0 | Active | In progress |
| 1 | Passed | Qualified for payout |
| 2 | FailedDrawdown | Hit max drawdown |
| 3 | FailedDailyLimit | Hit daily loss limit |
| 4 | FailedTimeout | Exceeded duration |

### FundedLevel
| Value | Name | Revenue Share |
|-------|------|---------------|
| 0 | Watchlist | 150 bps |
| 1 | Funded | 450 bps |
| 2 | SeniorFunded | 700 bps |
| 3 | Captain | 1000 bps |
| 4 | Partner | 1500 bps |

### AgentStatus
| Value | Name |
|-------|------|
| 0 | Active |
| 1 | Suspended |
| 2 | Retired |

---

## Error Codes

Anchor errors: base 6000 + index.

| Code | Name | Description |
|------|------|-------------|
| 6000 | ChallengeNotOpen | Challenge not accepting enrollments |
| 6001 | ChallengeFull | Reached participant_cap |
| 6002 | ChallengePaused | Challenge is paused |
| 6003 | AlreadySettled | Enrollment already settled |
| 6004 | Unauthorized | Signer != required authority |
| 6005 | InsufficientCapital | starting_equity < min_capital |
| 6006 | InvalidPayout | Invalid payout amount |
| 6007 | InsufficientVaultBalance | Vault < payout_usdc |
| 6008 | WrongMint | Token mint mismatch |
| 6009 | WrongOwner | Token account owner mismatch |
| 6010 | WrongVault | Vault address mismatch |
| 6011 | WrongChallenge | Enrollment.challenge mismatch |
| 6012 | NotPassed | Status != Passed |
| 6013 | NotSettled | Not settled yet |
| 6014 | InvalidStatus | Cannot submit Active as result |
| 6015 | InvalidStatusTransition | Not an allowed state transition |
| 6016 | InvalidParameter | Bad parameter value |
| 6017 | InvalidRevenueShare | revenue_share_bps > 1500 |
| 6018 | StringTooLong | String exceeds max length |
| 6019 | Overflow | Arithmetic overflow |
| 6020 | AgentNotActive | Agent.status != Active |
| 6021 | AgentEnrolledInCompetition | Cannot retire while enrolled |

---

## Events (11)

| Event | Key Fields |
|-------|------------|
| ChallengeCreated | challenge, admin, challenge_id, tier_name, entry_fee_usdc, participant_cap |
| TraderEnrolled | challenge, trader, starting_equity_usd, enrolled_count |
| ResultSubmitted | challenge, trader, status, final_pnl_bps, final_drawdown_bps |
| ChallengeSettled | challenge, trader, payout_usdc |
| FundedStatusClaimed | trader, level, revenue_share_bps, qualifying_challenge |
| ChallengeStatusChanged | challenge, new_status |
| ChallengePaused | challenge, paused |
| AgentRegistered | agent, owner, name, strategy_hash |
| AgentStrategyUpdated | agent, new_strategy_hash |
| AgentRetired | agent, owner |
| AgentStatsUpdated | agent, won, pnl_bps, trade_count, new_elo |
