use borsh::BorshDeserialize;
use borsh_derive::BorshDeserialize;
use sha2::{Digest, Sha256};

use crate::error::{KeeperError, Result};

/// Adrena position account layout decoded from on-chain data.
#[derive(Debug, Clone, BorshDeserialize)]
pub struct AdrenaPosition {
    pub owner: [u8; 32],
    pub pool: [u8; 32],
    pub custody: [u8; 32],
    pub collateral_custody: [u8; 32],
    pub open_time: i64,
    pub update_time: i64,
    pub side: u8,
    pub price: u64,
    pub size_usd: u64,
    pub collateral_usd: u64,
    pub unrealized_pnl: i64,
    pub cumulative_interest: u64,
    pub exit_fee: u64,
    pub liquidation_price: u64,
}

impl AdrenaPosition {
    /// Human-readable side string.
    pub fn side_str(&self) -> &'static str {
        match self.side {
            0 => "Long",
            1 => "Short",
            _ => "Unknown",
        }
    }

    /// Owner pubkey as base58 string.
    pub fn owner_bs58(&self) -> String {
        bs58::encode(&self.owner).into_string()
    }

    /// Entry price as f64 with 6-decimal precision.
    pub fn price_f64(&self) -> f64 {
        self.price as f64 / 1_000_000.0
    }

    /// Size in USD as f64 with 6-decimal precision.
    pub fn size_usd_f64(&self) -> f64 {
        self.size_usd as f64 / 1_000_000.0
    }

    /// Unrealized P&L as f64 with 6-decimal precision.
    pub fn unrealized_pnl_f64(&self) -> f64 {
        self.unrealized_pnl as f64 / 1_000_000.0
    }
}

/// Compute the 8-byte Anchor discriminator for "account:Position".
pub fn position_discriminator() -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(b"account:Position");
    let hash = hasher.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&hash[..8]);
    disc
}

/// Lazy-static discriminator for quick comparison.
pub static POSITION_DISCRIMINATOR: std::sync::LazyLock<[u8; 8]> =
    std::sync::LazyLock::new(position_discriminator);

/// Decode a position account from raw on-chain bytes.
///
/// Validates the 8-byte Anchor discriminator, then BorshDeserializes the rest.
pub fn decode_position(data: &[u8]) -> Result<AdrenaPosition> {
    if data.len() < 8 {
        return Err(KeeperError::Decode(format!(
            "data too short: {} bytes, need at least 8 for discriminator",
            data.len()
        )));
    }

    let disc = &data[..8];
    if disc != POSITION_DISCRIMINATOR.as_slice() {
        return Err(KeeperError::Decode(format!(
            "discriminator mismatch: expected {:?}, got {:?}",
            *POSITION_DISCRIMINATOR, disc
        )));
    }

    let mut payload = &data[8..];
    AdrenaPosition::deserialize(&mut payload).map_err(|e| {
        KeeperError::Decode(format!("borsh deserialization failed: {e}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use borsh::BorshSerialize;

    /// Build a valid position account byte buffer with correct discriminator.
    fn build_valid_position_data() -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(&*POSITION_DISCRIMINATOR);

        // owner (32 bytes)
        buf.extend_from_slice(&[1u8; 32]);
        // pool (32 bytes)
        buf.extend_from_slice(&[2u8; 32]);
        // custody (32 bytes)
        buf.extend_from_slice(&[3u8; 32]);
        // collateral_custody (32 bytes)
        buf.extend_from_slice(&[4u8; 32]);
        // open_time: i64
        buf.extend_from_slice(&1700000000i64.to_le_bytes());
        // update_time: i64
        buf.extend_from_slice(&1700003600i64.to_le_bytes());
        // side: u8
        buf.push(0); // Long
        // price: u64 (50000.123456 * 1e6)
        buf.extend_from_slice(&50_000_123_456u64.to_le_bytes());
        // size_usd: u64 (10000.000000 * 1e6)
        buf.extend_from_slice(&10_000_000_000u64.to_le_bytes());
        // collateral_usd: u64 (1000.000000 * 1e6)
        buf.extend_from_slice(&1_000_000_000u64.to_le_bytes());
        // unrealized_pnl: i64 (250.500000 * 1e6)
        buf.extend_from_slice(&250_500_000i64.to_le_bytes());
        // cumulative_interest: u64
        buf.extend_from_slice(&5_000_000u64.to_le_bytes());
        // exit_fee: u64
        buf.extend_from_slice(&10_000u64.to_le_bytes());
        // liquidation_price: u64
        buf.extend_from_slice(&45_000_000_000u64.to_le_bytes());

        buf
    }

    #[test]
    fn test_discriminator_is_deterministic() {
        let d1 = position_discriminator();
        let d2 = position_discriminator();
        assert_eq!(d1, d2);
    }

    #[test]
    fn test_decode_valid_position() {
        let data = build_valid_position_data();
        let pos = decode_position(&data).expect("should decode");
        assert_eq!(pos.owner, [1u8; 32]);
        assert_eq!(pos.pool, [2u8; 32]);
        assert_eq!(pos.custody, [3u8; 32]);
        assert_eq!(pos.collateral_custody, [4u8; 32]);
        assert_eq!(pos.open_time, 1700000000);
        assert_eq!(pos.update_time, 1700003600);
        assert_eq!(pos.side, 0);
        assert_eq!(pos.side_str(), "Long");
        assert!((pos.price_f64() - 50000.123456).abs() < 0.000001);
        assert!((pos.size_usd_f64() - 10000.0).abs() < 0.000001);
        assert!((pos.unrealized_pnl_f64() - 250.5).abs() < 0.000001);
    }

    #[test]
    fn test_decode_short_position() {
        let mut data = build_valid_position_data();
        // Set side byte to 1 (Short) — side is at offset 8 + 32*4 + 8*2 = 152
        data[8 + 128 + 16] = 1;
        let pos = decode_position(&data).expect("should decode");
        assert_eq!(pos.side, 1);
        assert_eq!(pos.side_str(), "Short");
    }

    #[test]
    fn test_decode_empty_data() {
        let result = decode_position(&[]);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("too short"), "error was: {err}");
    }

    #[test]
    fn test_decode_truncated_data() {
        let data = build_valid_position_data();
        // Only give 50 bytes (disc + partial payload)
        let result = decode_position(&data[..50]);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("deserialization failed"), "error was: {err}");
    }

    #[test]
    fn test_decode_wrong_discriminator() {
        let mut data = build_valid_position_data();
        data[0] = 0xFF;
        data[1] = 0xFF;
        let result = decode_position(&data);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("discriminator mismatch"), "error was: {err}");
    }

    #[test]
    fn test_decode_only_discriminator() {
        // Just 8 bytes — discriminator only, no payload
        let data: Vec<u8> = POSITION_DISCRIMINATOR.to_vec();
        let result = decode_position(&data);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("deserialization failed"), "error was: {err}");
    }

    #[test]
    fn test_owner_bs58() {
        let data = build_valid_position_data();
        let pos = decode_position(&data).unwrap();
        let bs58_str = pos.owner_bs58();
        assert!(!bs58_str.is_empty());
        // [1u8; 32] should encode to a known base58 string
        let expected = bs58::encode([1u8; 32]).into_string();
        assert_eq!(bs58_str, expected);
    }

    #[test]
    fn test_unknown_side() {
        let mut data = build_valid_position_data();
        data[8 + 128 + 16] = 99;
        let pos = decode_position(&data).unwrap();
        assert_eq!(pos.side_str(), "Unknown");
    }
}
