//! Global protocol state for Shoot Private Perpetuals

use anchor_lang::prelude::*;
use anchor_spl::token::{Transfer, MintTo, Burn};

/// Permissions flags for the protocol
#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct Permissions {
    pub allow_add_liquidity: bool,
    pub allow_remove_liquidity: bool,
    pub allow_open_position: bool,
    pub allow_close_position: bool,
    pub allow_liquidation: bool,
    pub allow_collateral_withdrawal: bool,
}

/// Global protocol state account
#[account]
#[derive(Default, Debug)]
pub struct Perpetuals {
    /// Protocol-wide permissions
    pub permissions: Permissions,
    /// List of pool public keys
    pub pools: Vec<Pubkey>,
    /// Bump for transfer authority PDA
    pub transfer_authority_bump: u8,
    /// Bump for perpetuals PDA
    pub perpetuals_bump: u8,
    /// Protocol inception time
    pub inception_time: i64,
    /// Admin authority
    pub admin: Pubkey,
}

impl Perpetuals {
    pub const LEN: usize = 8 + std::mem::size_of::<Perpetuals>() + 32 * 10; // Space for 10 pools
    
    // Decimal constants
    pub const BPS_DECIMALS: u8 = 4;
    pub const BPS_POWER: u128 = 10_000; // 10^4
    pub const PRICE_DECIMALS: u8 = 6;
    pub const USD_DECIMALS: u8 = 6;
    pub const LP_DECIMALS: u8 = 6;
    pub const RATE_DECIMALS: u8 = 9;
    pub const RATE_POWER: u128 = 1_000_000_000; // 10^9

    pub fn validate(&self) -> bool {
        self.admin != Pubkey::default()
    }

    /// Get current time (uses clock sysvar in production)
    #[cfg(feature = "test")]
    pub fn get_time(&self) -> Result<i64> {
        Ok(self.inception_time)
    }

    #[cfg(not(feature = "test"))]
    pub fn get_time(&self) -> Result<i64> {
        let time = Clock::get()?.unix_timestamp;
        if time > 0 {
            Ok(time)
        } else {
            Err(ProgramError::InvalidAccountData.into())
        }
    }

    /// Transfer tokens using PDA authority
    pub fn transfer_tokens<'info>(
        &self,
        from: AccountInfo<'info>,
        to: AccountInfo<'info>,
        authority: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        let authority_seeds: &[&[&[u8]]] =
            &[&[b"transfer_authority", &[self.transfer_authority_bump]]];

        let context = CpiContext::new(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
        )
        .with_signer(authority_seeds);

        anchor_spl::token::transfer(context, amount)
    }

    /// Transfer tokens from user (no PDA signing needed)
    pub fn transfer_tokens_from_user<'info>(
        &self,
        from: AccountInfo<'info>,
        to: AccountInfo<'info>,
        authority: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        let context = CpiContext::new(
            token_program,
            Transfer {
                from,
                to,
                authority,
            },
        );
        anchor_spl::token::transfer(context, amount)
    }

    /// Mint LP tokens
    pub fn mint_tokens<'info>(
        &self,
        mint: AccountInfo<'info>,
        to: AccountInfo<'info>,
        authority: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        let authority_seeds: &[&[&[u8]]] =
            &[&[b"transfer_authority", &[self.transfer_authority_bump]]];

        let context = CpiContext::new(
            token_program,
            MintTo {
                mint,
                to,
                authority,
            },
        )
        .with_signer(authority_seeds);

        anchor_spl::token::mint_to(context, amount)
    }

    /// Burn LP tokens
    pub fn burn_tokens<'info>(
        &self,
        mint: AccountInfo<'info>,
        from: AccountInfo<'info>,
        authority: AccountInfo<'info>,
        token_program: AccountInfo<'info>,
        amount: u64,
    ) -> Result<()> {
        let context = CpiContext::new(
            token_program,
            Burn {
                mint,
                from,
                authority,
            },
        );

        anchor_spl::token::burn(context, amount)
    }
}

