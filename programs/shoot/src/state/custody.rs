//! Token custody state for Shoot Private Perpetuals

use anchor_lang::prelude::*;
use crate::state::{
    oracle::OracleParams,
    perpetuals::{Permissions, Perpetuals},
};

/// Fee configuration
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct Fees {
    /// Fee for opening a position (basis points)
    pub open_position: u64,
    /// Fee for closing a position (basis points)
    pub close_position: u64,
    /// Fee for liquidation (basis points)
    pub liquidation: u64,
    /// Protocol's share of fees (basis points)
    pub protocol_share: u64,
    /// Fee for adding liquidity (basis points)
    pub add_liquidity: u64,
    /// Fee for removing liquidity (basis points)
    pub remove_liquidity: u64,
}

/// Fee statistics
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct FeesStats {
    pub open_position_usd: u64,
    pub close_position_usd: u64,
    pub liquidation_usd: u64,
    pub add_liquidity_usd: u64,
    pub remove_liquidity_usd: u64,
}

/// Volume statistics
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct VolumeStats {
    pub open_position_usd: u64,
    pub close_position_usd: u64,
    pub liquidation_usd: u64,
    pub add_liquidity_usd: u64,
    pub remove_liquidity_usd: u64,
}

/// Trade statistics
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct TradeStats {
    pub profit_usd: u64,
    pub loss_usd: u64,
    /// Open interest for long positions
    pub oi_long_usd: u64,
    /// Open interest for short positions  
    pub oi_short_usd: u64,
}

/// Asset tracking
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct Assets {
    /// Collateral deposited by traders
    pub collateral: u64,
    /// Protocol fees collected
    pub protocol_fees: u64,
    /// Total assets owned by the pool
    pub owned: u64,
    /// Locked for potential PnL payoffs
    pub locked: u64,
}

/// Pricing parameters
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct PricingParams {
    /// Use EMA price for calculations
    pub use_ema: bool,
    /// Trade spread for long positions (basis points)
    pub trade_spread_long: u64,
    /// Trade spread for short positions (basis points)
    pub trade_spread_short: u64,
    /// Minimum initial leverage (basis points, 10000 = 1x)
    pub min_initial_leverage: u64,
    /// Maximum initial leverage (basis points)
    pub max_initial_leverage: u64,
    /// Maximum leverage before liquidation (basis points)
    pub max_leverage: u64,
    /// Maximum payoff multiplier (basis points)
    pub max_payoff_mult: u64,
    /// Maximum utilization rate (basis points)
    pub max_utilization: u64,
}

/// Borrow rate parameters
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct BorrowRateParams {
    pub base_rate: u64,
    pub slope1: u64,
    pub slope2: u64,
    pub optimal_utilization: u64,
}

/// Borrow rate state
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct BorrowRateState {
    pub current_rate: u64,
    pub cumulative_interest: u128,
    pub last_update: i64,
}

/// Token custody account
#[account]
#[derive(Default, Debug)]
pub struct Custody {
    // Static parameters
    /// Parent pool
    pub pool: Pubkey,
    /// Token mint
    pub mint: Pubkey,
    /// Token account for custody
    pub token_account: Pubkey,
    /// Token decimals
    pub decimals: u8,
    /// Is this a stablecoin
    pub is_stable: bool,
    /// Oracle configuration
    pub oracle: OracleParams,
    /// Pricing parameters
    pub pricing: PricingParams,
    /// Permissions
    pub permissions: Permissions,
    /// Fee configuration
    pub fees: Fees,
    /// Borrow rate parameters
    pub borrow_rate: BorrowRateParams,

    // Dynamic state
    /// Asset tracking
    pub assets: Assets,
    /// Collected fees
    pub collected_fees: FeesStats,
    /// Volume statistics
    pub volume_stats: VolumeStats,
    /// Trade statistics
    pub trade_stats: TradeStats,
    /// Borrow rate state
    pub borrow_rate_state: BorrowRateState,

    // Bumps
    pub bump: u8,
    pub token_account_bump: u8,
}

impl Custody {
    pub const LEN: usize = 8 + std::mem::size_of::<Custody>();

    pub fn validate(&self) -> bool {
        self.token_account != Pubkey::default()
            && self.mint != Pubkey::default()
            && self.oracle.validate()
            && self.pricing.validate()
            && self.fees.validate()
    }

    /// Lock funds for a position
    pub fn lock_funds(&mut self, amount: u64) -> Result<()> {
        self.assets.locked = self.assets.locked
            .checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Check max utilization
        if self.pricing.max_utilization > 0 
            && (self.pricing.max_utilization as u128) < Perpetuals::BPS_POWER
            && self.assets.owned > 0 
        {
            let current_utilization = (self.assets.locked as u128)
                .checked_mul(Perpetuals::BPS_POWER)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(self.assets.owned as u128)
                .ok_or(ProgramError::ArithmeticOverflow)? as u64;
            
            require!(
                current_utilization <= self.pricing.max_utilization,
                crate::error::ShootError::MaxUtilization
            );
        }

        if self.assets.owned < self.assets.locked {
            Err(ProgramError::InsufficientFunds.into())
        } else {
            Ok(())
        }
    }

    /// Unlock funds from a position
    pub fn unlock_funds(&mut self, amount: u64) -> Result<()> {
        if amount > self.assets.locked {
            self.assets.locked = 0;
        } else {
            self.assets.locked = self.assets.locked
                .checked_sub(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        Ok(())
    }

    /// Get cumulative interest
    pub fn get_cumulative_interest(&self, curtime: i64) -> Result<u128> {
        if curtime > self.borrow_rate_state.last_update {
            let time_diff = (curtime - self.borrow_rate_state.last_update) as u128;
            let interest = time_diff
                .checked_mul(self.borrow_rate_state.current_rate as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(3600)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            
            self.borrow_rate_state.cumulative_interest
                .checked_add(interest)
                .ok_or(ProgramError::ArithmeticOverflow.into())
        } else {
            Ok(self.borrow_rate_state.cumulative_interest)
        }
    }

    /// Update the borrow rate based on utilization
    pub fn update_borrow_rate(&mut self, curtime: i64) -> Result<()> {
        if self.assets.owned == 0 {
            self.borrow_rate_state.current_rate = 0;
            self.borrow_rate_state.last_update = std::cmp::max(curtime, self.borrow_rate_state.last_update);
            return Ok(());
        }

        if curtime > self.borrow_rate_state.last_update {
            self.borrow_rate_state.cumulative_interest = self.get_cumulative_interest(curtime)?;
            self.borrow_rate_state.last_update = curtime;
        }

        // Calculate current utilization
        let current_utilization = (self.assets.locked as u128)
            .checked_mul(Perpetuals::RATE_POWER)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(self.assets.owned as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Calculate hourly rate based on utilization curve
        let hourly_rate = if current_utilization < self.borrow_rate.optimal_utilization as u128 {
            current_utilization
                .checked_mul(self.borrow_rate.slope1 as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(self.borrow_rate.optimal_utilization as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
        } else {
            let excess = current_utilization
                .checked_sub(self.borrow_rate.optimal_utilization as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            let denominator = Perpetuals::RATE_POWER
                .checked_sub(self.borrow_rate.optimal_utilization as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            
            (self.borrow_rate.slope1 as u128)
                .checked_add(
                    excess
                        .checked_mul(self.borrow_rate.slope2 as u128)
                        .ok_or(ProgramError::ArithmeticOverflow)?
                        .checked_div(denominator)
                        .ok_or(ProgramError::ArithmeticOverflow)?
                )
                .ok_or(ProgramError::ArithmeticOverflow)?
        };

        self.borrow_rate_state.current_rate = (hourly_rate as u64)
            .checked_add(self.borrow_rate.base_rate)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}

impl Fees {
    pub fn validate(&self) -> bool {
        (self.open_position as u128) <= Perpetuals::BPS_POWER
            && (self.close_position as u128) <= Perpetuals::BPS_POWER
            && (self.liquidation as u128) <= Perpetuals::BPS_POWER
            && (self.protocol_share as u128) <= Perpetuals::BPS_POWER
            && (self.add_liquidity as u128) <= Perpetuals::BPS_POWER
            && (self.remove_liquidity as u128) <= Perpetuals::BPS_POWER
    }
}

impl PricingParams {
    pub fn validate(&self) -> bool {
        (self.min_initial_leverage as u128) >= Perpetuals::BPS_POWER
            && self.min_initial_leverage <= self.max_initial_leverage
            && self.max_initial_leverage <= self.max_leverage
            && (self.trade_spread_long as u128) < Perpetuals::BPS_POWER
            && (self.trade_spread_short as u128) < Perpetuals::BPS_POWER
            && (self.max_utilization as u128) <= Perpetuals::BPS_POWER
    }
}

