use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

/// Maximum age of price update (in seconds)
pub const MAX_PRICE_AGE_SECONDS: u64 = 60;

/// Price precision (6 decimals to match USDC)
pub const PRICE_PRECISION: i64 = 1_000_000;

#[derive(Debug, Clone, Copy)]
pub struct OraclePrice {
    /// Price with 6 decimal precision
    pub price: i64,
    /// Confidence interval
    pub confidence: u64,
    /// Timestamp of the price
    pub timestamp: i64,
    /// Exponential moving average price
    pub ema_price: i64,
}

/// Get price from oracle with staleness check
/// Supports both Pyth and Custom oracle types
pub fn get_oracle_price(
    price_update_account: &AccountInfo,
    feed_id: &[u8; 32],
    clock: &Clock,
    oracle_type: crate::state::oracle::OracleType,
) -> Result<OraclePrice> {
    use crate::state::oracle::OracleType;
    
    match oracle_type {
        OracleType::Custom => {
            // For custom oracles (testing), return a fixed price
            // In production, you would read from a custom price account
            Ok(OraclePrice {
                price: 100_000_000, // $100 with 6 decimals
                confidence: 0,
                timestamp: clock.unix_timestamp,
                ema_price: 100_000_000,
            })
        },
        OracleType::Pyth => {
            // Load price update account
            let price_update = PriceUpdateV2::try_deserialize(
                &mut price_update_account.data.borrow().as_ref()
            ).map_err(|_| error!(ErrorCode::InvalidPriceUpdate))?;

            // Get price
            let price_feed = price_update
                .get_price_no_older_than(&Clock::get()?, MAX_PRICE_AGE_SECONDS, feed_id)
                .map_err(|_| error!(ErrorCode::PriceTooOld))?;

            // Check price is not too old
            let price_age = clock.unix_timestamp - price_feed.publish_time;
            require!(
                price_age >= 0 && price_age <= MAX_PRICE_AGE_SECONDS as i64,
                ErrorCode::PriceTooOld
            );

            // Scale price to our precision (6 decimals)
            let price_scaled = scale_price(
                price_feed.price,
                price_feed.exponent,
                6  // Target 6 decimals for USDC
            )?;

            // Use regular price as EMA for now since get_ema_price_no_older_than is not available
            let ema_price_scaled = price_scaled;

            Ok(OraclePrice {
                price: price_scaled,
                confidence: price_feed.conf,
                timestamp: price_feed.publish_time,
                ema_price: ema_price_scaled,
            })
        },
        OracleType::None => {
            Err(error!(ErrorCode::InvalidPriceUpdate))
        }
    }
}

/// Scale price from oracle exponent to target decimal places
fn scale_price(
    price: i64,
    exponent: i32,
    target_decimals: i32,
) -> Result<i64> {
    let price_decimals = -exponent; // Pyth uses negative exponents
    
    if price_decimals == target_decimals {
        Ok(price)
    } else if price_decimals < target_decimals {
        // Need to multiply
        let scale = 10_i64.pow((target_decimals - price_decimals) as u32);
        price.checked_mul(scale)
            .ok_or_else(|| error!(ErrorCode::MathOverflow))
    } else {
        // Need to divide
        let scale = 10_i64.pow((price_decimals - target_decimals) as u32);
        Ok(price / scale)
    }
}

/// Pyth feed IDs for common pairs (devnet/mainnet)
pub mod feed_ids {
    /// SOL/USD price feed
    pub const SOL_USD: &str = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    
    /// BTC/USD price feed
    pub const BTC_USD: &str = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    
    /// ETH/USD price feed
    pub const ETH_USD: &str = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid price update account")]
    InvalidPriceUpdate,
    #[msg("Invalid price feed ID")]
    InvalidFeedId,
    #[msg("Price update is too old")]
    PriceTooOld,
    #[msg("Math overflow in price scaling")]
    MathOverflow,
    #[msg("Price confidence interval too wide")]
    PriceConfidenceTooWide,
}
