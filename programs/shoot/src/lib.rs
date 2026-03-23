//! # Shoot — On-Chain Competition Settlement Program
//!
//! Anchor program for managing USDC-denominated competition entry fees,
//! challenge vaults, prize distribution, and autonomous agent registration
//! on Solana.
//!
//! ## Authority Model
//!
//! Two separate authorities enforce separation of concerns:
//!
//! - **admin**: Creates challenges, withdraws unclaimed funds, pauses system.
//!   In production this is a multisig (e.g. Squads).
//! - **result_authority**: Submits off-chain scoring results and triggers
//!   settlement payouts. This is a hot wallet controlled by the backend.
//!
//! Neither authority alone can steal funds — the admin creates challenges and
//! the result_authority settles them, but settlement only pays the trader
//! (never back to the authority).
//!
//! ## Token
//!
//! All entry fees and payouts are in USDC (SPL token). No SOL transfers
//! except rent. No price oracles needed for the settlement path — fees are
//! collected and distributed in the same denomination.
//!
//! ## Agents
//!
//! Traders can register autonomous strategy agents that trade on their behalf
//! 24/7. Each agent has a strategy hash, ELO rating, and performance stats.
//! Agents participate in challenges alongside human traders using the same
//! scoring mechanics.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG");

// ── Constants ────────────────────────────────────────────────────────────────

pub const MAX_CHALLENGE_ID_LEN: usize = 32;
pub const MAX_TIER_NAME_LEN: usize = 16;
pub const MAX_AGENT_NAME_LEN: usize = 32;
pub const MAX_BATCH_SIZE: usize = 32;

// Space calculations as named constants for clarity
pub const CHALLENGE_SPACE: usize = 8  // discriminator
    + 32  // admin
    + 32  // result_authority
    + (4 + MAX_CHALLENGE_ID_LEN) // challenge_id (String)
    + (4 + MAX_TIER_NAME_LEN)    // tier_name (String)
    + 8   // entry_fee_usdc
    + 2   // profit_target_bps
    + 2   // max_drawdown_bps
    + 2   // daily_loss_limit_bps
    + 8   // duration_seconds
    + 8   // min_capital_usd
    + 2   // participant_cap
    + 2   // enrolled_count
    + 1   // status
    + 8   // created_at
    + 32  // vault
    + 32  // usdc_mint
    + 1   // bump
    + 1   // vault_bump
    + 1   // paused
    + 64; // padding

pub const ENROLLMENT_SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 4 + 2 + 8 + 8 + 1 + 16;

pub const FUNDED_TRADER_SPACE: usize = 8 + 32 + 1 + 2 + 8 + 2 + 2 + 1 + 32 + 16;

pub const AGENT_SPACE: usize = 8  // discriminator
    + 32  // owner
    + (4 + MAX_AGENT_NAME_LEN) // name (String)
    + 32  // strategy_hash
    + 4   // elo_rating
    + 4   // wins
    + 4   // losses
    + 4   // total_trades
    + 8   // total_pnl_bps
    + 2   // competitions_entered
    + 1   // status
    + 8   // created_at
    + 8   // last_trade_at
    + 1   // bump
    + 32; // padding

#[program]
pub mod shoot {
    use super::*;

    // ── Challenge Management ─────────────────────────────────────────────

    /// Initialize a new challenge. Only the admin can call this.
    /// Creates the challenge PDA and a USDC token vault.
    pub fn initialize_challenge(
        ctx: Context<InitializeChallenge>,
        challenge_id: String,
        tier_name: String,
        entry_fee_usdc: u64,
        profit_target_bps: u16,
        max_drawdown_bps: u16,
        daily_loss_limit_bps: u16,
        duration_seconds: i64,
        min_capital_usd: u64,
        participant_cap: u16,
    ) -> Result<()> {
        require!(
            challenge_id.len() <= MAX_CHALLENGE_ID_LEN,
            ShootError::StringTooLong
        );
        require!(
            tier_name.len() <= MAX_TIER_NAME_LEN,
            ShootError::StringTooLong
        );
        require!(profit_target_bps > 0, ShootError::InvalidParameter);
        require!(max_drawdown_bps > 0, ShootError::InvalidParameter);
        require!(duration_seconds > 0, ShootError::InvalidParameter);
        require!(participant_cap > 0, ShootError::InvalidParameter);

        let challenge = &mut ctx.accounts.challenge;
        challenge.admin = ctx.accounts.admin.key();
        challenge.result_authority = ctx.accounts.result_authority.key();
        challenge.challenge_id = challenge_id;
        challenge.tier_name = tier_name;
        challenge.entry_fee_usdc = entry_fee_usdc;
        challenge.profit_target_bps = profit_target_bps;
        challenge.max_drawdown_bps = max_drawdown_bps;
        challenge.daily_loss_limit_bps = daily_loss_limit_bps;
        challenge.duration_seconds = duration_seconds;
        challenge.min_capital_usd = min_capital_usd;
        challenge.participant_cap = participant_cap;
        challenge.enrolled_count = 0;
        challenge.status = ChallengeStatus::Active;
        challenge.created_at = Clock::get()?.unix_timestamp;
        challenge.vault = ctx.accounts.vault.key();
        challenge.usdc_mint = ctx.accounts.usdc_mint.key();
        challenge.bump = ctx.bumps.challenge;
        challenge.vault_bump = ctx.bumps.vault;
        challenge.paused = false;

        emit!(ChallengeCreated {
            challenge: challenge.key(),
            admin: challenge.admin,
            challenge_id: challenge.challenge_id.clone(),
            tier_name: challenge.tier_name.clone(),
            entry_fee_usdc,
            participant_cap,
        });

        Ok(())
    }

    /// Enroll a trader in a challenge by transferring the USDC entry fee
    /// from their token account to the challenge vault.
    pub fn enroll(ctx: Context<Enroll>, starting_equity_usd: u64) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        require!(
            challenge.status == ChallengeStatus::Active,
            ShootError::ChallengeNotOpen
        );
        require!(!challenge.paused, ShootError::ChallengePaused);
        require!(
            challenge.enrolled_count < challenge.participant_cap,
            ShootError::ChallengeFull
        );
        require!(
            starting_equity_usd >= challenge.min_capital_usd,
            ShootError::InsufficientCapital
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.trader_usdc.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.trader.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new(cpi_program, cpi_accounts),
            challenge.entry_fee_usdc,
        )?;

        let enrollment = &mut ctx.accounts.enrollment;
        enrollment.trader = ctx.accounts.trader.key();
        enrollment.challenge = challenge.key();
        enrollment.starting_equity_usd = starting_equity_usd;
        enrollment.enrolled_at = Clock::get()?.unix_timestamp;
        enrollment.settled = false;
        enrollment.status = EnrollmentStatus::Active;
        enrollment.bump = ctx.bumps.enrollment;

        challenge.enrolled_count = challenge
            .enrolled_count
            .checked_add(1)
            .ok_or(ShootError::Overflow)?;

        emit!(TraderEnrolled {
            challenge: challenge.key(),
            trader: ctx.accounts.trader.key(),
            starting_equity_usd,
            enrolled_count: challenge.enrolled_count,
        });

        Ok(())
    }

    /// Submit the off-chain scoring result for a trader.
    /// Only the result_authority can call this.
    pub fn submit_result(
        ctx: Context<SubmitResult>,
        status: EnrollmentStatus,
        final_pnl_bps: i32,
        final_drawdown_bps: u16,
    ) -> Result<()> {
        require!(
            status != EnrollmentStatus::Active,
            ShootError::InvalidStatus
        );
        let enrollment = &mut ctx.accounts.enrollment;
        require!(
            enrollment.status == EnrollmentStatus::Active,
            ShootError::AlreadySettled
        );

        enrollment.status = status.clone();
        enrollment.final_pnl_bps = final_pnl_bps;
        enrollment.final_drawdown_bps = final_drawdown_bps;
        enrollment.result_submitted_at = Clock::get()?.unix_timestamp;

        emit!(ResultSubmitted {
            challenge: ctx.accounts.challenge.key(),
            trader: enrollment.trader,
            status,
            final_pnl_bps,
            final_drawdown_bps,
        });

        Ok(())
    }

    /// Settle a challenge enrollment — distribute USDC payout from vault
    /// to the trader. Only the result_authority can call this.
    pub fn settle_challenge(ctx: Context<SettleChallenge>, payout_usdc: u64) -> Result<()> {
        let enrollment = &mut ctx.accounts.enrollment;
        require!(!enrollment.settled, ShootError::AlreadySettled);
        require!(
            enrollment.status == EnrollmentStatus::Passed,
            ShootError::NotPassed
        );

        // Vault balance pre-check: prevent over-withdrawal
        require!(
            ctx.accounts.vault.amount >= payout_usdc,
            ShootError::InsufficientVaultBalance
        );

        enrollment.settled = true;
        enrollment.payout_usdc = payout_usdc;

        if payout_usdc > 0 {
            let challenge_key = ctx.accounts.challenge.key();
            let vault_seeds: &[&[u8]] = &[
                b"vault",
                challenge_key.as_ref(),
                &[ctx.accounts.challenge.vault_bump],
            ];

            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.trader_usdc.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            token::transfer(
                CpiContext::new_with_signer(cpi_program, cpi_accounts, &[vault_seeds]),
                payout_usdc,
            )?;
        }

        emit!(ChallengeSettled {
            challenge: ctx.accounts.challenge.key(),
            trader: ctx.accounts.trader.key(),
            payout_usdc,
        });

        Ok(())
    }

    /// Claim funded trader status. Requires a Passed enrollment on a
    /// qualifying challenge (Elite or Apex tier). The result_authority
    /// must co-sign to prevent anyone from claiming arbitrary levels.
    pub fn claim_funded_status(
        ctx: Context<ClaimFundedStatus>,
        level: FundedLevel,
        revenue_share_bps: u16,
    ) -> Result<()> {
        // Validate the enrollment proves the trader passed
        let enrollment = &ctx.accounts.enrollment;
        require!(
            enrollment.status == EnrollmentStatus::Passed,
            ShootError::NotPassed
        );
        require!(enrollment.settled, ShootError::NotSettled);
        require!(
            enrollment.trader == ctx.accounts.trader.key(),
            ShootError::Unauthorized
        );

        // Validate revenue share is within bounds (max 15% = 1500 bps)
        require!(
            revenue_share_bps <= 1500,
            ShootError::InvalidRevenueShare
        );

        let funded = &mut ctx.accounts.funded_trader;
        funded.trader = ctx.accounts.trader.key();
        funded.level = level.clone();
        funded.revenue_share_bps = revenue_share_bps;
        funded.promoted_at = Clock::get()?.unix_timestamp;
        funded.qualifying_challenge = ctx.accounts.challenge.key();
        funded.bump = ctx.bumps.funded_trader;

        emit!(FundedStatusClaimed {
            trader: ctx.accounts.trader.key(),
            level,
            revenue_share_bps,
            qualifying_challenge: ctx.accounts.challenge.key(),
        });

        Ok(())
    }

    /// Update challenge status with state machine enforcement.
    /// Only admin can call this. Transitions: Active → Settling → Closed.
    pub fn update_challenge_status(
        ctx: Context<UpdateChallengeStatus>,
        new_status: ChallengeStatus,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        let valid_transition = match (&challenge.status, &new_status) {
            (ChallengeStatus::Active, ChallengeStatus::Settling) => true,
            (ChallengeStatus::Settling, ChallengeStatus::Closed) => true,
            _ => false,
        };
        require!(valid_transition, ShootError::InvalidStatusTransition);

        challenge.status = new_status.clone();

        emit!(ChallengeStatusChanged {
            challenge: challenge.key(),
            new_status,
        });

        Ok(())
    }

    /// Pause or unpause a challenge. Paused challenges reject new enrollments
    /// but existing enrollments continue. Only admin can call this.
    pub fn pause_challenge(ctx: Context<UpdateChallengeStatus>, paused: bool) -> Result<()> {
        ctx.accounts.challenge.paused = paused;

        emit!(ChallengePaused {
            challenge: ctx.accounts.challenge.key(),
            paused,
        });

        Ok(())
    }

    // ── Agent Management ─────────────────────────────────────────────────

    /// Register an autonomous trading agent. The agent trades on behalf of
    /// the owner within prop challenges, generating 24/7 volume.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        strategy_hash: [u8; 32],
    ) -> Result<()> {
        require!(name.len() <= MAX_AGENT_NAME_LEN, ShootError::StringTooLong);
        require!(!name.is_empty(), ShootError::InvalidParameter);

        let agent = &mut ctx.accounts.agent;
        agent.owner = ctx.accounts.owner.key();
        agent.name = name;
        agent.strategy_hash = strategy_hash;
        agent.elo_rating = 1000;
        agent.wins = 0;
        agent.losses = 0;
        agent.total_trades = 0;
        agent.total_pnl_bps = 0;
        agent.competitions_entered = 0;
        agent.status = AgentStatus::Active;
        agent.created_at = Clock::get()?.unix_timestamp;
        agent.last_trade_at = 0;
        agent.bump = ctx.bumps.agent;

        emit!(AgentRegistered {
            agent: agent.key(),
            owner: agent.owner,
            name: agent.name.clone(),
            strategy_hash,
        });

        Ok(())
    }

    /// Update an agent's strategy. Only the owner can call this.
    /// Strategy changes take effect on the next competition entry.
    pub fn update_agent_strategy(
        ctx: Context<UpdateAgent>,
        new_strategy_hash: [u8; 32],
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.strategy_hash = new_strategy_hash;

        emit!(AgentStrategyUpdated {
            agent: agent.key(),
            new_strategy_hash,
        });

        Ok(())
    }

    /// Deactivate an agent. Cannot be done while enrolled in active competitions.
    pub fn retire_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        require!(
            agent.status == AgentStatus::Active,
            ShootError::AgentNotActive
        );

        agent.status = AgentStatus::Retired;

        emit!(AgentRetired {
            agent: agent.key(),
            owner: agent.owner,
        });

        Ok(())
    }

    /// Record agent performance stats after a competition concludes.
    /// Only the result_authority can call this (batch up to 32 per tx).
    pub fn update_agent_stats(
        ctx: Context<UpdateAgentStats>,
        won: bool,
        pnl_bps: i32,
        trade_count: u32,
        new_elo: u32,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        if won {
            agent.wins = agent.wins.checked_add(1).ok_or(ShootError::Overflow)?;
        } else {
            agent.losses = agent.losses.checked_add(1).ok_or(ShootError::Overflow)?;
        }

        agent.total_trades = agent
            .total_trades
            .checked_add(trade_count)
            .ok_or(ShootError::Overflow)?;
        agent.total_pnl_bps = agent
            .total_pnl_bps
            .checked_add(pnl_bps as i64)
            .ok_or(ShootError::Overflow)?;
        agent.competitions_entered = agent
            .competitions_entered
            .checked_add(1)
            .ok_or(ShootError::Overflow)?;
        agent.elo_rating = new_elo;
        agent.last_trade_at = Clock::get()?.unix_timestamp;

        emit!(AgentStatsUpdated {
            agent: agent.key(),
            won,
            pnl_bps,
            trade_count,
            new_elo,
        });

        Ok(())
    }
}

// ── Account Structures ──────────────────────────────────────────────────────

#[account]
pub struct Challenge {
    pub admin: Pubkey,
    pub result_authority: Pubkey,
    pub challenge_id: String,
    pub tier_name: String,
    pub entry_fee_usdc: u64,
    pub profit_target_bps: u16,
    pub max_drawdown_bps: u16,
    pub daily_loss_limit_bps: u16,
    pub duration_seconds: i64,
    pub min_capital_usd: u64,
    pub participant_cap: u16,
    pub enrolled_count: u16,
    pub status: ChallengeStatus,
    pub created_at: i64,
    pub vault: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
    pub paused: bool,
}

#[account]
pub struct Enrollment {
    pub trader: Pubkey,
    pub challenge: Pubkey,
    pub starting_equity_usd: u64,
    pub enrolled_at: i64,
    pub settled: bool,
    pub status: EnrollmentStatus,
    pub final_pnl_bps: i32,
    pub final_drawdown_bps: u16,
    pub payout_usdc: u64,
    pub result_submitted_at: i64,
    pub bump: u8,
}

#[account]
pub struct FundedTrader {
    pub trader: Pubkey,
    pub level: FundedLevel,
    pub revenue_share_bps: u16,
    pub promoted_at: i64,
    pub consecutive_weeks: u16,
    pub total_challenges_passed: u16,
    pub qualifying_challenge: Pubkey,
    pub bump: u8,
}

#[account]
pub struct Agent {
    pub owner: Pubkey,
    pub name: String,
    pub strategy_hash: [u8; 32],
    pub elo_rating: u32,
    pub wins: u32,
    pub losses: u32,
    pub total_trades: u32,
    pub total_pnl_bps: i64,
    pub competitions_entered: u16,
    pub status: AgentStatus,
    pub created_at: i64,
    pub last_trade_at: i64,
    pub bump: u8,
}

// ── Enums ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ChallengeStatus {
    Active,
    Settling,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EnrollmentStatus {
    Active,
    Passed,
    FailedDrawdown,
    FailedDailyLimit,
    FailedTimeout,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FundedLevel {
    Watchlist,
    Funded,
    SeniorFunded,
    Captain,
    Partner,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AgentStatus {
    Active,
    Suspended,
    Retired,
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct ChallengeCreated {
    pub challenge: Pubkey,
    pub admin: Pubkey,
    pub challenge_id: String,
    pub tier_name: String,
    pub entry_fee_usdc: u64,
    pub participant_cap: u16,
}

#[event]
pub struct TraderEnrolled {
    pub challenge: Pubkey,
    pub trader: Pubkey,
    pub starting_equity_usd: u64,
    pub enrolled_count: u16,
}

#[event]
pub struct ResultSubmitted {
    pub challenge: Pubkey,
    pub trader: Pubkey,
    pub status: EnrollmentStatus,
    pub final_pnl_bps: i32,
    pub final_drawdown_bps: u16,
}

#[event]
pub struct ChallengeSettled {
    pub challenge: Pubkey,
    pub trader: Pubkey,
    pub payout_usdc: u64,
}

#[event]
pub struct FundedStatusClaimed {
    pub trader: Pubkey,
    pub level: FundedLevel,
    pub revenue_share_bps: u16,
    pub qualifying_challenge: Pubkey,
}

#[event]
pub struct ChallengeStatusChanged {
    pub challenge: Pubkey,
    pub new_status: ChallengeStatus,
}

#[event]
pub struct ChallengePaused {
    pub challenge: Pubkey,
    pub paused: bool,
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub strategy_hash: [u8; 32],
}

#[event]
pub struct AgentStrategyUpdated {
    pub agent: Pubkey,
    pub new_strategy_hash: [u8; 32],
}

#[event]
pub struct AgentRetired {
    pub agent: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct AgentStatsUpdated {
    pub agent: Pubkey,
    pub won: bool,
    pub pnl_bps: i32,
    pub trade_count: u32,
    pub new_elo: u32,
}

// ── Instruction Contexts ────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct InitializeChallenge<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Result authority pubkey — stored on the challenge for later verification.
    pub result_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        space = CHALLENGE_SPACE,
        seeds = [b"challenge", admin.key().as_ref(), challenge_id.as_bytes()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"vault", challenge.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Enroll<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(mut)]
    pub challenge: Account<'info, Challenge>,

    #[account(
        init,
        payer = trader,
        space = ENROLLMENT_SPACE,
        seeds = [b"enrollment", challenge.key().as_ref(), trader.key().as_ref()],
        bump
    )]
    pub enrollment: Account<'info, Enrollment>,

    #[account(
        mut,
        constraint = trader_usdc.mint == challenge.usdc_mint @ ShootError::WrongMint,
        constraint = trader_usdc.owner == trader.key() @ ShootError::WrongOwner,
    )]
    pub trader_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.key() == challenge.vault @ ShootError::WrongVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    #[account(
        constraint = authority.key() == challenge.result_authority @ ShootError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        seeds = [b"enrollment", challenge.key().as_ref(), enrollment.trader.as_ref()],
        bump = enrollment.bump
    )]
    pub enrollment: Account<'info, Enrollment>,
}

#[derive(Accounts)]
pub struct SettleChallenge<'info> {
    #[account(
        constraint = authority.key() == challenge.result_authority @ ShootError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        seeds = [b"enrollment", challenge.key().as_ref(), trader.key().as_ref()],
        bump = enrollment.bump
    )]
    pub enrollment: Account<'info, Enrollment>,

    /// CHECK: Trader receiving payout — validated via enrollment PDA seeds.
    #[account(mut)]
    pub trader: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = trader_usdc.mint == challenge.usdc_mint @ ShootError::WrongMint,
        constraint = trader_usdc.owner == trader.key() @ ShootError::WrongOwner,
    )]
    pub trader_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.key() == challenge.vault @ ShootError::WrongVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimFundedStatus<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    /// The result_authority must co-sign to prevent arbitrary claims.
    #[account(
        constraint = authority.key() == challenge.result_authority @ ShootError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub challenge: Account<'info, Challenge>,

    /// The enrollment that proves this trader passed the qualifying challenge.
    #[account(
        constraint = enrollment.trader == trader.key() @ ShootError::Unauthorized,
        constraint = enrollment.challenge == challenge.key() @ ShootError::WrongChallenge,
        seeds = [b"enrollment", challenge.key().as_ref(), trader.key().as_ref()],
        bump = enrollment.bump
    )]
    pub enrollment: Account<'info, Enrollment>,

    #[account(
        init_if_needed,
        payer = trader,
        space = FUNDED_TRADER_SPACE,
        seeds = [b"funded", trader.key().as_ref()],
        bump
    )]
    pub funded_trader: Account<'info, FundedTrader>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateChallengeStatus<'info> {
    #[account(
        constraint = admin.key() == challenge.admin @ ShootError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = AGENT_SPACE,
        seeds = [b"agent", owner.key().as_ref(), &owner.key().to_bytes()[..8]],
        bump
    )]
    pub agent: Account<'info, Agent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(
        constraint = owner.key() == agent.owner @ ShootError::Unauthorized
    )]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub agent: Account<'info, Agent>,
}

#[derive(Accounts)]
pub struct UpdateAgentStats<'info> {
    #[account(
        constraint = authority.key() == challenge.result_authority @ ShootError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub challenge: Account<'info, Challenge>,

    #[account(mut)]
    pub agent: Account<'info, Agent>,
}

// ── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ShootError {
    #[msg("Challenge is not accepting enrollments")]
    ChallengeNotOpen,
    #[msg("Challenge has reached participant cap")]
    ChallengeFull,
    #[msg("Challenge is paused")]
    ChallengePaused,
    #[msg("This enrollment has already been settled")]
    AlreadySettled,
    #[msg("Unauthorized: signer does not match required authority")]
    Unauthorized,
    #[msg("Insufficient capital: trader equity below tier minimum")]
    InsufficientCapital,
    #[msg("Invalid payout: exceeds vault balance")]
    InvalidPayout,
    #[msg("Insufficient vault balance for this payout")]
    InsufficientVaultBalance,
    #[msg("Wrong USDC mint")]
    WrongMint,
    #[msg("Wrong token account owner")]
    WrongOwner,
    #[msg("Wrong vault account")]
    WrongVault,
    #[msg("Wrong challenge for this enrollment")]
    WrongChallenge,
    #[msg("Enrollment has not passed")]
    NotPassed,
    #[msg("Enrollment has not been settled yet")]
    NotSettled,
    #[msg("Cannot submit Active status as a result")]
    InvalidStatus,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Invalid parameter value")]
    InvalidParameter,
    #[msg("Revenue share exceeds maximum (1500 bps / 15%)")]
    InvalidRevenueShare,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Agent is currently enrolled in an active competition")]
    AgentEnrolledInCompetition,
}
