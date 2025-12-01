//! Constants for Shoot Private Perpetuals

/// Seed for the perpetuals PDA
pub const PERPETUALS_SEED: &[u8] = b"perpetuals";

/// Seed for the transfer authority PDA
pub const TRANSFER_AUTHORITY_SEED: &[u8] = b"transfer_authority";

/// Seed for pool PDAs
pub const POOL_SEED: &[u8] = b"pool";

/// Seed for custody PDAs
pub const CUSTODY_SEED: &[u8] = b"custody";

/// Seed for custody token account PDAs
pub const CUSTODY_TOKEN_ACCOUNT_SEED: &[u8] = b"custody_token_account";

/// Seed for position PDAs
pub const POSITION_SEED: &[u8] = b"position";

/// Seed for LP token mint PDAs
pub const LP_TOKEN_MINT_SEED: &[u8] = b"lp_token_mint";

/// Maximum name length for pools
pub const MAX_POOL_NAME_LEN: usize = 64;

/// Maximum number of custodies per pool
pub const MAX_CUSTODIES: usize = 10;

/// Maximum number of pools
pub const MAX_POOLS: usize = 10;

