//! Error types for Shoot Private Perpetuals

use anchor_lang::prelude::*;

#[error_code]
pub enum ShootError {
    // General errors
    #[msg("Overflow in arithmetic operation")]
    MathOverflow,
    
    #[msg("Invalid authority")]
    InvalidAuthority,
    
    #[msg("Instruction is not allowed at this time")]
    InstructionNotAllowed,

    // Oracle errors
    #[msg("Unsupported price oracle")]
    UnsupportedOracle,
    
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    
    #[msg("Stale oracle price")]
    StaleOraclePrice,
    
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,

    // Pool errors
    #[msg("Invalid pool state")]
    InvalidPoolState,
    
    #[msg("Invalid pool config")]
    InvalidPoolConfig,

    // Custody errors
    #[msg("Invalid custody state")]
    InvalidCustodyState,
    
    #[msg("Invalid custody config")]
    InvalidCustodyConfig,
    
    #[msg("Invalid collateral custody")]
    InvalidCollateralCustody,
    
    #[msg("Token is not supported")]
    UnsupportedToken,
    
    #[msg("Custody amount limit exceeded")]
    CustodyAmountLimit,
    
    #[msg("Token utilization limit exceeded")]
    MaxUtilization,

    // Position errors
    #[msg("Invalid position state")]
    InvalidPositionState,
    
    #[msg("Position amount limit exceeded")]
    PositionAmountLimit,
    
    #[msg("Position leverage limit exceeded")]
    MaxLeverage,
    
    #[msg("Price slippage limit exceeded")]
    MaxPriceSlippage,
    
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    
    #[msg("Position not liquidatable")]
    NotLiquidatable,
    
    #[msg("Position is liquidatable")]
    IsLiquidatable,

    // Arcium/MPC errors
    #[msg("The computation was aborted")]
    AbortedComputation,
    
    #[msg("Cluster not set")]
    ClusterNotSet,
    
    #[msg("Invalid encrypted data")]
    InvalidEncryptedData,
    
    #[msg("Decryption failed")]
    DecryptionFailed,

    // Liquidity errors
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    
    #[msg("Insufficient token amount returned")]
    InsufficientAmountReturned,
}

