//! Liquidity pool state for Shoot Private Perpetuals

use anchor_lang::prelude::*;
use crate::state::perpetuals::Perpetuals;

/// Token ratio configuration for the pool
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct TokenRatios {
    pub target: u64,
    pub min: u64,
    pub max: u64,
}

/// Liquidity pool account
#[account]
#[derive(Default, Debug)]
pub struct Pool {
    /// Pool name (max 64 chars)
    pub name: String,
    /// List of custody public keys in this pool
    pub custodies: Vec<Pubkey>,
    /// Token ratios for each custody
    pub ratios: Vec<TokenRatios>,
    /// Total assets under management in USD
    pub aum_usd: u128,
    /// LP token mint address
    pub lp_token_mint: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// LP token bump
    pub lp_token_bump: u8,
    /// Pool inception time
    pub inception_time: i64,
}

impl Pool {
    pub const LEN: usize = 8 + 64 + std::mem::size_of::<Pool>() + 32 * 10; // Space for 10 custodies

    pub fn validate(&self) -> bool {
        // Check ratios add up to 100%
        if !self.ratios.is_empty() {
            let total: u128 = self.ratios.iter().map(|r| r.target as u128).sum();
            if total != Perpetuals::BPS_POWER {
                return false;
            }
        }

        // Check custodies are unique
        for i in 1..self.custodies.len() {
            if self.custodies[i..].contains(&self.custodies[i - 1]) {
                return false;
            }
        }

        !self.name.is_empty() 
            && self.name.len() <= 64 
            && self.custodies.len() == self.ratios.len()
            && self.lp_token_mint != Pubkey::default()
    }

    /// Get the index of a custody in the pool
    pub fn get_custody_id(&self, custody: &Pubkey) -> Result<usize> {
        self.custodies
            .iter()
            .position(|&k| k == *custody)
            .ok_or_else(|| error!(crate::error::ShootError::UnsupportedToken))
    }

    /// Check if there's enough available liquidity
    pub fn check_available_amount(&self, amount: u64, owned: u64, locked: u64, collateral: u64) -> Result<bool> {
        let available = owned
            .checked_add(collateral)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_sub(locked)
            .unwrap_or(0);
        Ok(available >= amount)
    }
}

impl TokenRatios {
    pub fn validate(&self) -> bool {
        (self.target as u128) <= Perpetuals::BPS_POWER
            && (self.min as u128) <= Perpetuals::BPS_POWER
            && (self.max as u128) <= Perpetuals::BPS_POWER
            && self.min <= self.target
            && self.target <= self.max
    }
}

