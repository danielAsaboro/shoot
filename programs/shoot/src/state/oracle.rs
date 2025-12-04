//! Oracle types for price feeds

use anchor_lang::prelude::*;

/// Oracle type enumeration
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug)]
pub enum OracleType {
    None,
    Custom,
    Pyth,
}

impl Default for OracleType {
    fn default() -> Self {
        Self::None
    }
}

/// Oracle configuration parameters
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct OracleParams {
    /// Oracle account address
    pub oracle_account: Pubkey,
    /// Type of oracle
    pub oracle_type: OracleType,
    /// Authority for custom oracle updates
    pub oracle_authority: Pubkey,
    /// Maximum allowed price error (basis points)
    pub max_price_error: u64,
    /// Maximum age of price in seconds
    pub max_price_age_sec: u32,
    /// Pyth Feed ID
    pub feed_id: [u8; 32],
}

/// Oracle price with exponent
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct OraclePrice {
    pub price: u64,
    pub exponent: i32,
}

impl OraclePrice {
    /// Create a new oracle price from a custom oracle account
    pub fn new_from_custom(price: u64, exponent: i32) -> Self {
        Self { price, exponent }
    }

    /// Get token amount in USD
    pub fn get_asset_amount_usd(&self, token_amount: u64, token_decimals: u8) -> Result<u64> {
        if token_amount == 0 || self.price == 0 {
            return Ok(0);
        }

        // price * amount / 10^(token_decimals + exponent - usd_decimals)
        let usd_decimals = 6i32;
        let scale = token_decimals as i32 + self.exponent - usd_decimals;
        
        let result = if scale >= 0 {
            (self.price as u128)
                .checked_mul(token_amount as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(10u128.pow(scale as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
        } else {
            (self.price as u128)
                .checked_mul(token_amount as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_mul(10u128.pow((-scale) as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
        };

        Ok(result as u64)
    }

    /// Get token amount from USD value
    pub fn get_token_amount(&self, usd_amount: u64, token_decimals: u8) -> Result<u64> {
        if usd_amount == 0 || self.price == 0 {
            return Ok(0);
        }

        let usd_decimals = 6i32;
        let scale = token_decimals as i32 + self.exponent - usd_decimals;

        let result = if scale >= 0 {
            (usd_amount as u128)
                .checked_mul(10u128.pow(scale as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(self.price as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
        } else {
            (usd_amount as u128)
                .checked_div(self.price as u128)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(10u128.pow((-scale) as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
        };

        Ok(result as u64)
    }

    /// Scale price to a different exponent
    pub fn scale_to_exponent(&self, target_exponent: i32) -> Result<Self> {
        let diff = self.exponent - target_exponent;
        let new_price = if diff >= 0 {
            self.price
                .checked_mul(10u64.pow(diff as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
        } else {
            self.price
                .checked_div(10u64.pow((-diff) as u32))
                .ok_or(ProgramError::ArithmeticOverflow)?
        };

        Ok(Self {
            price: new_price,
            exponent: target_exponent,
        })
    }
}

impl OracleParams {
    pub fn validate(&self) -> bool {
        self.oracle_type == OracleType::None || self.oracle_account != Pubkey::default()
    }
}

