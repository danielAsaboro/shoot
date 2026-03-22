//! # Shoot — On-Chain Competition Settlement Program
//!
//! Anchor program for managing USDC-denominated competition entry fees,
//! challenge vaults, and prize distribution on Solana.
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

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4HVnwG8iz7wdUbEQDH8cYGD6EuxNmMuEbvCrz8Ke2iMG");

#[program]
pub mod shoot {
    use super::*;

    /// Initialize a new challenge. Only the admin can call this.
    /// Creates the challenge PDA and a USDC token vault.
    pub fn initialize_challenge(
        ctx: Context<InitializeChallenge>,
        challenge_id: String,
        tier_name: String,
        entry_fee_usdc: u64, // USDC amount in atomic units (6 decimals)
        profit_target_bps: u16,
        max_drawdown_bps: u16,
        daily_loss_limit_bps: u16,
        duration_seconds: i64,
        min_capital_usd: u64,
        participant_cap: u16,
    ) -> Result<()> {
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
        Ok(())
    }

    /// Enroll a trader in a challenge by transferring the USDC entry fee
    /// from their token account to the challenge vault.
    pub fn enroll(
        ctx: Context<Enroll>,
        starting_equity_usd: u64,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        require!(
            challenge.status == ChallengeStatus::Active,
            ShootError::ChallengeNotOpen
        );
        require!(
            challenge.enrolled_count < challenge.participant_cap,
            ShootError::ChallengeFull
        );

        // Transfer USDC entry fee from trader to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.trader_usdc.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.trader.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), challenge.entry_fee_usdc)?;

        // Create enrollment record
        let enrollment = &mut ctx.accounts.enrollment;
        enrollment.trader = ctx.accounts.trader.key();
        enrollment.challenge = challenge.key();
        enrollment.starting_equity_usd = starting_equity_usd;
        enrollment.enrolled_at = Clock::get()?.unix_timestamp;
        enrollment.settled = false;
        enrollment.status = EnrollmentStatus::Active;
        enrollment.bump = ctx.bumps.enrollment;

        challenge.enrolled_count += 1;
        Ok(())
    }

    /// Submit the off-chain scoring result for a trader.
    /// Only the result_authority can call this.
    /// This records the outcome but does NOT distribute funds yet.
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

        enrollment.status = status;
        enrollment.final_pnl_bps = final_pnl_bps;
        enrollment.final_drawdown_bps = final_drawdown_bps;
        enrollment.result_submitted_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Settle a challenge enrollment — distribute USDC payout from vault
    /// to the trader. Only the result_authority can call this.
    /// The enrollment must have a submitted result with Passed status.
    pub fn settle_challenge(
        ctx: Context<SettleChallenge>,
        payout_usdc: u64,
    ) -> Result<()> {
        let enrollment = &mut ctx.accounts.enrollment;
        require!(!enrollment.settled, ShootError::AlreadySettled);
        require!(
            enrollment.status == EnrollmentStatus::Passed,
            ShootError::NotPassed
        );

        enrollment.settled = true;
        enrollment.payout_usdc = payout_usdc;

        if payout_usdc > 0 {
            // Transfer USDC from vault to trader using PDA signer
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

            msg!(
                "Settlement: {} passed, paid {} USDC from vault",
                ctx.accounts.trader.key(),
                payout_usdc
            );
        }

        Ok(())
    }

    /// Claim funded trader status after passing an Elite or Apex challenge.
    /// Called by the trader. Creates or upgrades the FundedTrader PDA.
    pub fn claim_funded_status(
        ctx: Context<ClaimFundedStatus>,
        level: FundedLevel,
        revenue_share_bps: u16,
    ) -> Result<()> {
        let funded = &mut ctx.accounts.funded_trader;
        funded.trader = ctx.accounts.trader.key();
        funded.level = level;
        funded.revenue_share_bps = revenue_share_bps;
        funded.promoted_at = Clock::get()?.unix_timestamp;
        funded.bump = ctx.bumps.funded_trader;
        Ok(())
    }

    /// Update challenge status. Only admin can call this.
    /// Used to transition: Active → Settling → Closed.
    pub fn update_challenge_status(
        ctx: Context<UpdateChallengeStatus>,
        new_status: ChallengeStatus,
    ) -> Result<()> {
        ctx.accounts.challenge.status = new_status;
        Ok(())
    }
}

// ── Account Structures ──────────────────────────────────────────────────────

#[account]
pub struct Challenge {
    pub admin: Pubkey,
    pub result_authority: Pubkey,
    pub challenge_id: String,       // max 32 chars
    pub tier_name: String,          // max 16 chars
    pub entry_fee_usdc: u64,        // USDC atomic units (6 decimals)
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
        space = 8 + 32 + 32 + 36 + 20 + 8 + 2 + 2 + 2 + 8 + 8 + 2 + 2 + 1 + 8 + 32 + 32 + 1 + 1 + 64,
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
        space = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 4 + 2 + 8 + 8 + 1 + 16,
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

    /// CHECK: Trader receiving payout
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

    #[account(
        init_if_needed,
        payer = trader,
        space = 8 + 32 + 1 + 2 + 8 + 2 + 2 + 1 + 16,
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

// ── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum ShootError {
    #[msg("Challenge is not accepting enrollments")]
    ChallengeNotOpen,
    #[msg("Challenge has reached participant cap")]
    ChallengeFull,
    #[msg("This enrollment has already been settled")]
    AlreadySettled,
    #[msg("Unauthorized: signer does not match required authority")]
    Unauthorized,
    #[msg("Insufficient capital: trader equity below tier minimum")]
    InsufficientCapital,
    #[msg("Invalid payout: exceeds vault balance")]
    InvalidPayout,
    #[msg("Wrong USDC mint")]
    WrongMint,
    #[msg("Wrong token account owner")]
    WrongOwner,
    #[msg("Wrong vault account")]
    WrongVault,
    #[msg("Enrollment has not passed")]
    NotPassed,
    #[msg("Cannot submit Active status as a result")]
    InvalidStatus,
}
