//! Encrypted position state for Shoot Private Perpetuals
//!
//! Position data is stored encrypted to prevent:
//! - Front-running (position size/direction hidden)
//! - Copy-trading (strategies remain private)
//! - Targeted liquidations (liquidation prices hidden)

use anchor_lang::prelude::*;

/// Position side (stored encrypted on-chain)
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug)]
pub enum Side {
    None,
    Long,
    Short,
}

impl Default for Side {
    fn default() -> Self {
        Self::None
    }
}

impl Side {
    pub fn to_u8(&self) -> u8 {
        match self {
            Side::None => 0,
            Side::Long => 1,
            Side::Short => 2,
        }
    }

    pub fn from_u8(val: u8) -> Self {
        match val {
            1 => Side::Long,
            2 => Side::Short,
            _ => Side::None,
        }
    }
}

/// Encrypted position account
/// 
/// All sensitive trading data is stored as 32-byte ciphertexts.
/// This prevents observers from seeing:
/// - Position direction (long/short)
/// - Position size
/// - Entry price
/// - Leverage
/// - Liquidation price
#[account]
#[derive(Default, Debug)]
pub struct Position {
    /// Position owner
    pub owner: Pubkey,
    /// Parent pool
    pub pool: Pubkey,
    /// Trading custody (the asset being traded)
    pub custody: Pubkey,
    /// Collateral custody (the asset used as collateral)
    pub collateral_custody: Pubkey,

    // === ENCRYPTED FIELDS ===
    // Each field is a 32-byte ciphertext encrypted with Arcium MPC
    
    /// Encrypted side: 1 = Long, 2 = Short
    pub side_ciphertext: [u8; 32],
    /// Encrypted position size in USD (scaled by USD_DECIMALS)
    pub size_usd_ciphertext: [u8; 32],
    /// Encrypted collateral amount in tokens
    pub collateral_ciphertext: [u8; 32],
    /// Encrypted entry price (scaled by PRICE_DECIMALS)
    pub entry_price_ciphertext: [u8; 32],
    /// Encrypted leverage (scaled by BPS_DECIMALS)
    pub leverage_ciphertext: [u8; 32],

    // === PUBLIC METADATA ===
    // Non-sensitive data that can be public
    
    /// Cryptographic nonce for the encrypted fields
    pub nonce: u128,
    /// Position open timestamp
    pub open_time: i64,
    /// Last update timestamp
    pub update_time: i64,
    /// PDA bump seed
    pub bump: u8,
    /// Whether position is active
    pub is_active: bool,
}

impl Position {
    /// Account size: discriminator + all fields
    /// 5 encrypted fields * 32 bytes = 160 bytes for ciphertexts
    pub const LEN: usize = 8 + std::mem::size_of::<Position>();

    /// Check if position is initialized and active
    pub fn is_valid(&self) -> bool {
        self.owner != Pubkey::default() && self.is_active
    }
}

/// Confirmation struct returned from MPC callbacks
/// Small to avoid stack overflow (learned from Reel project)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PositionConfirmation {
    /// Was the operation successful
    pub success: bool,
    /// New nonce after operation
    pub new_nonce: u128,
}

/// Settlement result from closing a position
/// Revealed only at position close time
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct SettlementResult {
    /// Profit in USD (0 if loss)
    pub profit_usd: u64,
    /// Loss in USD (0 if profit)
    pub loss_usd: u64,
    /// Amount to transfer to trader
    pub transfer_amount: u64,
    /// Fee amount collected
    pub fee_amount: u64,
}

/// Liquidation check result
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct LiquidationResult {
    /// Is the position liquidatable
    pub is_liquidatable: bool,
    /// Reward for liquidator (if liquidatable)
    pub liquidator_reward: u64,
    /// Amount returned to position owner
    pub owner_amount: u64,
}

