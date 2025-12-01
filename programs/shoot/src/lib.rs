//! Shoot Private Perpetuals
//!
//! A privacy-preserving perpetual futures protocol built on Solana with Arcium MPC.
//! Position data (size, side, leverage, entry price) remains encrypted throughout
//! the position lifecycle, preventing front-running and copy-trading.

use anchor_lang::prelude::*;
use anchor_spl::token::{ self, Mint, Token, TokenAccount, Transfer };
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

pub mod constants;
pub mod error;
pub mod state;
pub mod oracle;

use constants::*;
use error::ShootError;
use state::*;

// Computation definition offsets for each MPC circuit
const COMP_DEF_OFFSET_INIT_POSITION: u32 = comp_def_offset("init_position");
const COMP_DEF_OFFSET_UPDATE_POSITION: u32 = comp_def_offset("update_position");
const COMP_DEF_OFFSET_CHECK_LIQUIDATION: u32 = comp_def_offset("check_liquidation");
const COMP_DEF_OFFSET_CLOSE_POSITION: u32 = comp_def_offset("close_position");
const COMP_DEF_OFFSET_CALCULATE_PNL: u32 = comp_def_offset("calculate_pnl");

declare_id!("6yfUodRb27XLkczH6TPm1tGZXRb18sqWs6Tht4JqAZgS");

#[arcium_program]
pub mod shoot {
    use super::*;

    // ========== COMPUTATION DEFINITION INITIALIZERS ==========

    pub fn init_position_comp_def(ctx: Context<InitPositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
        Ok(())
    }

    pub fn init_update_position_comp_def(ctx: Context<InitUpdatePositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
        Ok(())
    }

    pub fn init_check_liquidation_comp_def(
        ctx: Context<InitCheckLiquidationCompDef>
    ) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
        Ok(())
    }

    pub fn init_close_position_comp_def(ctx: Context<InitClosePositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
        Ok(())
    }

    pub fn init_calculate_pnl_comp_def(ctx: Context<InitCalculatePnlCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, 0, None, None)?;
        Ok(())
    }

    // ========== ADMIN INSTRUCTIONS ==========

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let perpetuals = &mut ctx.accounts.perpetuals;
        perpetuals.admin = ctx.accounts.admin.key();
        perpetuals.transfer_authority_bump = ctx.bumps.transfer_authority;
        perpetuals.perpetuals_bump = ctx.bumps.perpetuals;
        perpetuals.inception_time = Clock::get()?.unix_timestamp;
        perpetuals.permissions = Permissions {
            allow_add_liquidity: true,
            allow_remove_liquidity: true,
            allow_open_position: true,
            allow_close_position: true,
            allow_liquidation: true,
            allow_collateral_withdrawal: true,
        };
        perpetuals.pools = Vec::new();

        msg!("Perpetuals protocol initialized");
        Ok(())
    }

    pub fn add_pool(ctx: Context<AddPool>, name: String) -> Result<()> {
        require!(name.len() <= MAX_POOL_NAME_LEN, ShootError::InvalidPoolConfig);

        let pool = &mut ctx.accounts.pool;
        pool.name = name;
        pool.custodies = Vec::new();
        pool.ratios = Vec::new();
        pool.aum_usd = 0;
        pool.lp_token_mint = ctx.accounts.lp_token_mint.key();
        pool.bump = ctx.bumps.pool;
        pool.lp_token_bump = ctx.bumps.lp_token_mint;
        pool.inception_time = Clock::get()?.unix_timestamp;

        let perpetuals = &mut ctx.accounts.perpetuals;
        perpetuals.pools.push(pool.key());

        msg!("Pool added: {}", pool.name);
        Ok(())
    }

    pub fn add_custody(
        ctx: Context<AddCustody>,
        is_stable: bool,
        oracle_params: OracleParams,
        pricing_params: PricingParams,
        fees: Fees,
        borrow_rate_params: BorrowRateParams
    ) -> Result<()> {
        let custody = &mut ctx.accounts.custody;
        custody.pool = ctx.accounts.pool.key();
        custody.mint = ctx.accounts.custody_token_mint.key();
        custody.token_account = ctx.accounts.custody_token_account.key();
        custody.decimals = ctx.accounts.custody_token_mint.decimals;
        custody.is_stable = is_stable;
        custody.oracle = oracle_params;
        custody.pricing = pricing_params;
        custody.permissions = Permissions::default();
        custody.fees = fees;
        custody.borrow_rate = borrow_rate_params;
        custody.assets = Assets::default();
        custody.collected_fees = FeesStats::default();
        custody.volume_stats = VolumeStats::default();
        custody.trade_stats = TradeStats::default();
        custody.borrow_rate_state = BorrowRateState::default();
        custody.bump = ctx.bumps.custody;
        custody.token_account_bump = ctx.bumps.custody_token_account;

        let pool = &mut ctx.accounts.pool;
        pool.custodies.push(custody.key());
        pool.ratios.push(TokenRatios::default());

        msg!("Custody added to pool");
        Ok(())
    }

    // ========== LIQUIDITY INSTRUCTIONS ==========

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_in: u64,
        min_lp_amount_out: u64
    ) -> Result<()> {
        require!(
            ctx.accounts.perpetuals.permissions.allow_add_liquidity,
            ShootError::InstructionNotAllowed
        );
        require!(amount_in > 0, ShootError::InvalidPositionState);

        let cpi_accounts = Transfer {
            from: ctx.accounts.funding_account.to_account_info(),
            to: ctx.accounts.custody_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount_in)?;

        let custody = &mut ctx.accounts.custody;
        custody.assets.owned = custody.assets.owned
            .checked_add(amount_in)
            .ok_or(ShootError::MathOverflow)?;

        let lp_amount = amount_in;
        require!(lp_amount >= min_lp_amount_out, ShootError::InsufficientAmountReturned);

        let perpetuals = &ctx.accounts.perpetuals;
        let authority_seeds: &[&[&[u8]]] = &[
            &[TRANSFER_AUTHORITY_SEED, &[perpetuals.transfer_authority_bump]],
        ];

        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.lp_token_mint.to_account_info(),
            to: ctx.accounts.lp_token_account.to_account_info(),
            authority: ctx.accounts.transfer_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, authority_seeds);
        token::mint_to(cpi_ctx, lp_amount)?;

        let pool = &mut ctx.accounts.pool;
        pool.aum_usd = pool.aum_usd.checked_add(amount_in as u128).ok_or(ShootError::MathOverflow)?;

        emit!(AddLiquidityEvent {
            owner: ctx.accounts.owner.key(),
            pool: pool.key(),
            custody: custody.key(),
            amount_in,
            lp_amount_out: lp_amount,
        });

        Ok(())
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_amount_in: u64,
        min_amount_out: u64
    ) -> Result<()> {
        require!(
            ctx.accounts.perpetuals.permissions.allow_remove_liquidity,
            ShootError::InstructionNotAllowed
        );
        require!(lp_amount_in > 0, ShootError::InvalidPositionState);

        let amount_out = lp_amount_in;
        require!(amount_out >= min_amount_out, ShootError::InsufficientAmountReturned);

        let custody = &mut ctx.accounts.custody;
        let available = custody.assets.owned.saturating_sub(custody.assets.locked);
        require!(amount_out <= available, ShootError::InsufficientLiquidity);

        let cpi_accounts = token::Burn {
            mint: ctx.accounts.lp_token_mint.to_account_info(),
            from: ctx.accounts.lp_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, lp_amount_in)?;

        let perpetuals = &ctx.accounts.perpetuals;
        let authority_seeds: &[&[&[u8]]] = &[
            &[TRANSFER_AUTHORITY_SEED, &[perpetuals.transfer_authority_bump]],
        ];

        let cpi_accounts = Transfer {
            from: ctx.accounts.custody_token_account.to_account_info(),
            to: ctx.accounts.receiving_account.to_account_info(),
            authority: ctx.accounts.transfer_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, authority_seeds);
        token::transfer(cpi_ctx, amount_out)?;

        custody.assets.owned = custody.assets.owned.saturating_sub(amount_out);

        let pool = &mut ctx.accounts.pool;
        pool.aum_usd = pool.aum_usd.saturating_sub(amount_out as u128);

        emit!(RemoveLiquidityEvent {
            owner: ctx.accounts.owner.key(),
            pool: pool.key(),
            custody: custody.key(),
            lp_amount_in,
            amount_out,
        });

        Ok(())
    }

    // ========== PRIVATE POSITION INSTRUCTIONS ==========

    pub fn open_position(
        ctx: Context<OpenPosition>,
        computation_offset: u64,
        encrypted_side: [u8; 32],
        encrypted_size: [u8; 32],
        encrypted_collateral: [u8; 32],
        encrypted_entry_price: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
        mxe_nonce: u128,
        collateral_amount: u64
    ) -> Result<()> {
        require!(
            ctx.accounts.perpetuals.permissions.allow_open_position,
            ShootError::InstructionNotAllowed
        );

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.pool = ctx.accounts.pool.key();
        position.custody = ctx.accounts.custody.key();
        position.collateral_custody = ctx.accounts.collateral_custody.key();
        position.nonce = nonce;
        position.open_time = Clock::get()?.unix_timestamp;
        position.update_time = position.open_time;
        position.bump = ctx.bumps.position;
        position.is_active = false;

        let cpi_accounts = Transfer {
            from: ctx.accounts.funding_account.to_account_info(),
            to: ctx.accounts.collateral_custody_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, collateral_amount)?;

        let collateral_custody = &mut ctx.accounts.collateral_custody;
        collateral_custody.assets.collateral = collateral_custody.assets.collateral
            .checked_add(collateral_amount)
            .ok_or(ShootError::MathOverflow)?;

        // Fetch oracle price
        let oracle_price = oracle::get_oracle_price(
            &ctx.accounts.price_update,
            &ctx.accounts.custody.oracle.feed_id,
            &Clock::get()?,
            ctx.accounts.custody.oracle.oracle_type,
        )?;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = vec![
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU8(encrypted_side),
            Argument::EncryptedU64(encrypted_size),
            Argument::EncryptedU64(encrypted_collateral),
            Argument::EncryptedU64(encrypted_entry_price),
            Argument::PlaintextU128(mxe_nonce),
            Argument::PlaintextU64(oracle_price.price as u64)
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![
                InitPositionCallback::callback_ix(
                    &[
                        CallbackAccount {
                            pubkey: ctx.accounts.position.key(),
                            is_writable: true,
                        },
                    ]
                )
            ],
            2 // num_outputs: status and position_state
        )?;

        emit!(OpenPositionEvent {
            owner: ctx.accounts.owner.key(),
            position: ctx.accounts.position.key(),
            pool: ctx.accounts.pool.key(),
            custody: ctx.accounts.custody.key(),
            collateral_amount,
        });

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "init_position")]
    pub fn init_position_callback(
        ctx: Context<InitPositionCallback>,
        output: ComputationOutputs<InitPositionOutput>
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(InitPositionOutput { field_0 }) => field_0,
            _ => {
                return Err(ShootError::AbortedComputation.into());
            }
        };

        let status = result.field_0;
        let position_state = result.field_1;

        require!(status == 0, ShootError::InvalidPositionState);

        let position = &mut ctx.accounts.position;
        position.side_ciphertext = position_state.ciphertexts[0];
        position.size_usd_ciphertext = position_state.ciphertexts[1];
        position.collateral_ciphertext = position_state.ciphertexts[2];
        position.entry_price_ciphertext = position_state.ciphertexts[3];
        position.leverage_ciphertext = position_state.ciphertexts[4];
        position.nonce = position_state.nonce;
        position.is_active = true;
        position.update_time = Clock::get()?.unix_timestamp;

        emit!(PositionOpenedEvent {
            position: position.key(),
            nonce: position.nonce,
        });

        Ok(())
    }

    pub fn update_position(
        ctx: Context<UpdatePosition>,
        computation_offset: u64,
        encrypted_amount: [u8; 32],
        encrypted_is_add: [u8; 32],
        pub_key: [u8; 32],
        nonce: u128,
        mxe_nonce: u128,
        collateral_delta: u64,
        is_add: bool,
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.is_active, ShootError::InvalidPositionState);
        require!(position.owner == ctx.accounts.owner.key(), ShootError::InvalidAuthority);

        // Handle collateral transfer
        if is_add {
            // Adding collateral - transfer from user to custody
            let cpi_accounts = Transfer {
                from: ctx.accounts.funding_account.to_account_info(),
                to: ctx.accounts.collateral_custody_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::transfer(cpi_ctx, collateral_delta)?;

            let collateral_custody = &mut ctx.accounts.collateral_custody;
            collateral_custody.assets.collateral = collateral_custody.assets.collateral
                .checked_add(collateral_delta)
                .ok_or(ShootError::MathOverflow)?;
        }
        // Note: Removing collateral happens in the callback after MPC validates it's safe

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = vec![
            Argument::PlaintextU128(position.nonce),
            Argument::Account(position.key(), 8 + 32 * 4, 32 * 5),
            Argument::ArcisPubkey(pub_key),
            Argument::PlaintextU128(nonce),
            Argument::EncryptedU64(encrypted_amount),
            Argument::EncryptedU8(encrypted_is_add),
            Argument::PlaintextU128(mxe_nonce),
            Argument::PlaintextU64(ctx.accounts.custody.pricing.max_leverage),
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![
                UpdatePositionCallback::callback_ix(
                    &[
                        CallbackAccount {
                            pubkey: ctx.accounts.position.key(),
                            is_writable: true,
                        },
                    ]
                )
            ],
            2 // num_outputs: status and updated position_state
        )?;

        emit!(UpdatePositionEvent {
            owner: ctx.accounts.owner.key(),
            position: ctx.accounts.position.key(),
            collateral_delta,
            is_add,
        });

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "update_position")]
    pub fn update_position_callback(
        ctx: Context<UpdatePositionCallback>,
        output: ComputationOutputs<UpdatePositionOutput>
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(UpdatePositionOutput { field_0 }) => field_0,
            _ => {
                return Err(ShootError::AbortedComputation.into());
            }
        };

        let status = result.field_0;
        let position_state = result.field_1;

        require!(status == 0, ShootError::InvalidPositionState);

        let position = &mut ctx.accounts.position;
        position.side_ciphertext = position_state.ciphertexts[0];
        position.size_usd_ciphertext = position_state.ciphertexts[1];
        position.collateral_ciphertext = position_state.ciphertexts[2];
        position.entry_price_ciphertext = position_state.ciphertexts[3];
        position.leverage_ciphertext = position_state.ciphertexts[4];
        position.nonce = position_state.nonce;
        position.update_time = Clock::get()?.unix_timestamp;

        emit!(PositionUpdatedEvent {
            position: position.key(),
            nonce: position.nonce,
        });

        Ok(())
    }

    pub fn close_position(
        ctx: Context<ClosePosition>,
        computation_offset: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.perpetuals.permissions.allow_close_position,
            ShootError::InstructionNotAllowed
        );

        let position = &ctx.accounts.position;
        require!(position.is_active, ShootError::InvalidPositionState);
        require!(position.owner == ctx.accounts.owner.key(), ShootError::InvalidAuthority);

        // Fetch oracle price
        let oracle_price = oracle::get_oracle_price(
            &ctx.accounts.price_update,
            &ctx.accounts.custody.oracle.feed_id,
            &Clock::get()?,
            ctx.accounts.custody.oracle.oracle_type,
        )?;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = vec![
            Argument::PlaintextU128(position.nonce),
            Argument::Account(position.key(), 8 + 32 * 4, 32 * 5),
            Argument::PlaintextU64(oracle_price.price as u64),
            Argument::PlaintextU64(ctx.accounts.custody.fees.close_position)
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![
                ClosePositionCallback::callback_ix(
                    &[
                        CallbackAccount {
                            pubkey: ctx.accounts.position.key(),
                            is_writable: true,
                        },
                    ]
                )
            ],
            1 // num_outputs: number of callback transactions (1 for small outputs)
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "close_position")]
    pub fn close_position_callback(
        ctx: Context<ClosePositionCallback>,
        output: ComputationOutputs<ClosePositionOutput>
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(ClosePositionOutput { field_0 }) => field_0,
            _ => {
                return Err(ShootError::AbortedComputation.into());
            }
        };

        let position = &mut ctx.accounts.position;
        position.is_active = false;
        position.update_time = Clock::get()?.unix_timestamp;

        emit!(PositionClosedEvent {
            position: position.key(),
            profit_usd: result.field_0,
            loss_usd: result.field_1,
            transfer_amount: result.field_2,
            fee_amount: result.field_3,
        });

        Ok(())
    }

    pub fn liquidate(
        ctx: Context<Liquidate>,
        computation_offset: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.perpetuals.permissions.allow_liquidation,
            ShootError::InstructionNotAllowed
        );

        let position = &ctx.accounts.position;
        require!(position.is_active, ShootError::InvalidPositionState);

        // Fetch oracle price
        let oracle_price = oracle::get_oracle_price(
            &ctx.accounts.price_update,
            &ctx.accounts.custody.oracle.feed_id,
            &Clock::get()?,
            ctx.accounts.custody.oracle.oracle_type,
        )?;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = vec![
            Argument::PlaintextU128(position.nonce),
            Argument::Account(position.key(), 8 + 32 * 4, 32 * 5),
            Argument::PlaintextU64(oracle_price.price as u64),
            Argument::PlaintextU64(ctx.accounts.custody.pricing.max_leverage),
            Argument::PlaintextU64(ctx.accounts.custody.fees.liquidation)
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![
                CheckLiquidationCallback::callback_ix(
                    &[
                        CallbackAccount {
                            pubkey: ctx.accounts.position.key(),
                            is_writable: true,
                        },
                    ]
                )
            ],
            1 // num_outputs: number of callback transactions (1 for small outputs)
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "check_liquidation")]
    pub fn check_liquidation_callback(
        ctx: Context<CheckLiquidationCallback>,
        output: ComputationOutputs<CheckLiquidationOutput>
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(CheckLiquidationOutput { field_0 }) => field_0,
            _ => {
                return Err(ShootError::AbortedComputation.into());
            }
        };

        let is_liquidatable = result.field_0;
        let liquidator_reward = result.field_1;
        let owner_amount = result.field_2;

        require!(is_liquidatable, ShootError::NotLiquidatable);

        let position = &mut ctx.accounts.position;
        position.is_active = false;
        position.update_time = Clock::get()?.unix_timestamp;

        emit!(PositionLiquidatedEvent {
            position: position.key(),
            liquidator_reward,
            owner_amount,
        });

        Ok(())
    }

    pub fn calculate_pnl(
        ctx: Context<CalculatePnl>,
        computation_offset: u64,
        current_price: u64
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.is_active, ShootError::InvalidPositionState);

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = vec![
            Argument::PlaintextU128(position.nonce),
            Argument::Account(position.key(), 8 + 32 * 4, 32 * 5),
            Argument::PlaintextU64(current_price)
        ];

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![
                // Use empty callback accounts like Pythia's view operations
                // This follows the pattern from view_market_state which works correctly
                CalculatePnlCallback::callback_ix(&[])
            ],
            1 // num_outputs: number of callback transactions (1 for small outputs)
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "calculate_pnl")]
    #[allow(unused_variables)]
    pub fn calculate_pnl_callback(
        ctx: Context<CalculatePnlCallback>,
        output: ComputationOutputs<CalculatePnlOutput>
    ) -> Result<()> {
        let result = match output {
            ComputationOutputs::Success(CalculatePnlOutput { field_0 }) => field_0,
            _ => {
                return Err(ShootError::AbortedComputation.into());
            }
        };

        // NOTE: This is a view-only operation - we just emit the event
        // Position account is not passed to callback (empty callback accounts pattern)
        // The caller knows which position they queried
        emit!(PnlCalculatedEvent {
            profit_usd: result.field_0,
            loss_usd: result.field_1,
            current_leverage: result.field_2,
        });

        Ok(())
    }
}

// ========== ACCOUNT STRUCTURES ==========

#[init_computation_definition_accounts("init_position", payer)]
#[derive(Accounts)]
pub struct InitPositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Checked by arcium program
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("update_position", payer)]
#[derive(Accounts)]
pub struct InitUpdatePositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Checked by arcium program
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("check_liquidation", payer)]
#[derive(Accounts)]
pub struct InitCheckLiquidationCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Checked by arcium program
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("close_position", payer)]
#[derive(Accounts)]
pub struct InitClosePositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Checked by arcium program
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("calculate_pnl", payer)]
#[derive(Accounts)]
pub struct InitCalculatePnlCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: Checked by arcium program
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = Perpetuals::LEN, seeds = [PERPETUALS_SEED], bump)]
    pub perpetuals: Account<'info, Perpetuals>,

    /// CHECK: PDA for transfer authority
    #[account(seeds = [TRANSFER_AUTHORITY_SEED], bump)]
    pub transfer_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct AddPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PERPETUALS_SEED],
        bump = perpetuals.perpetuals_bump,
        has_one = admin @ ShootError::InvalidAuthority,
    )]
    pub perpetuals: Account<'info, Perpetuals>,

    #[account(init, payer = admin, space = Pool::LEN, seeds = [POOL_SEED, name.as_bytes()], bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        seeds = [LP_TOKEN_MINT_SEED, pool.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = transfer_authority
    )]
    pub lp_token_mint: Account<'info, Mint>,

    /// CHECK: PDA for transfer authority
    #[account(seeds = [TRANSFER_AUTHORITY_SEED], bump = perpetuals.transfer_authority_bump)]
    pub transfer_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddCustody<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PERPETUALS_SEED],
        bump = perpetuals.perpetuals_bump,
        has_one = admin @ ShootError::InvalidAuthority,
    )]
    pub perpetuals: Account<'info, Perpetuals>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        space = Custody::LEN,
        seeds = [CUSTODY_SEED, pool.key().as_ref(), custody_token_mint.key().as_ref()],
        bump
    )]
    pub custody: Account<'info, Custody>,

    #[account(
        init,
        payer = admin,
        seeds = [
            CUSTODY_TOKEN_ACCOUNT_SEED,
            pool.key().as_ref(),
            custody_token_mint.key().as_ref(),
        ],
        bump,
        token::mint = custody_token_mint,
        token::authority = transfer_authority
    )]
    pub custody_token_account: Account<'info, TokenAccount>,

    pub custody_token_mint: Account<'info, Mint>,

    /// CHECK: PDA for transfer authority
    #[account(seeds = [TRANSFER_AUTHORITY_SEED], bump = perpetuals.transfer_authority_bump)]
    pub transfer_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Account<'info, Perpetuals>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub custody: Account<'info, Custody>,

    #[account(
        mut,
        seeds = [CUSTODY_TOKEN_ACCOUNT_SEED, pool.key().as_ref(), custody.mint.as_ref()],
        bump = custody.token_account_bump,
    )]
    pub custody_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_TOKEN_MINT_SEED, pool.key().as_ref()],
        bump = pool.lp_token_bump,
    )]
    pub lp_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = lp_token_account.mint == lp_token_mint.key(),
        constraint = lp_token_account.owner == owner.key(),
    )]
    pub lp_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = funding_account.mint == custody.mint,
        constraint = funding_account.owner == owner.key(),
    )]
    pub funding_account: Account<'info, TokenAccount>,

    /// CHECK: PDA for transfer authority
    #[account(seeds = [TRANSFER_AUTHORITY_SEED], bump = perpetuals.transfer_authority_bump)]
    pub transfer_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Account<'info, Perpetuals>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub custody: Account<'info, Custody>,

    #[account(
        mut,
        seeds = [CUSTODY_TOKEN_ACCOUNT_SEED, pool.key().as_ref(), custody.mint.as_ref()],
        bump = custody.token_account_bump,
    )]
    pub custody_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_TOKEN_MINT_SEED, pool.key().as_ref()],
        bump = pool.lp_token_bump,
    )]
    pub lp_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = lp_token_account.mint == lp_token_mint.key(),
        constraint = lp_token_account.owner == owner.key(),
    )]
    pub lp_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = receiving_account.mint == custody.mint,
        constraint = receiving_account.owner == owner.key(),
    )]
    pub receiving_account: Account<'info, TokenAccount>,

    /// CHECK: PDA for transfer authority
    #[account(seeds = [TRANSFER_AUTHORITY_SEED], bump = perpetuals.transfer_authority_bump)]
    pub transfer_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[queue_computation_accounts("init_position", owner)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = owner,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!()
    )]
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_mempool_pda!())]
    pub mempool_account: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_execpool_pda!())]
    pub executing_pool: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_comp_pda!(computation_offset))]
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_POSITION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Box<Account<'info, Perpetuals>>,

    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub custody: Box<Account<'info, Custody>>,

    #[account(mut)]
    pub collateral_custody: Box<Account<'info, Custody>>,

    #[account(
        mut,
        seeds = [CUSTODY_TOKEN_ACCOUNT_SEED, pool.key().as_ref(), collateral_custody.mint.as_ref()],
        bump = collateral_custody.token_account_bump,
    )]
    pub collateral_custody_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Pyth price update account
    pub price_update: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = Position::LEN,
        seeds = [POSITION_SEED, owner.key().as_ref(), pool.key().as_ref(), custody.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(
        mut,
        constraint = funding_account.mint == collateral_custody.mint,
        constraint = funding_account.owner == owner.key(),
    )]
    pub funding_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[callback_accounts("init_position")]
#[derive(Accounts)]
pub struct InitPositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    /// CHECK: Instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("update_position", owner)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct UpdatePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = owner,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!()
    )]
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_mempool_pda!())]
    pub mempool_account: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_execpool_pda!())]
    pub executing_pool: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_comp_pda!(computation_offset))]
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(comp_def_offset("update_position")))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Box<Account<'info, Perpetuals>>,

    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub custody: Box<Account<'info, Custody>>,

    #[account(mut)]
    pub collateral_custody: Box<Account<'info, Custody>>,

    #[account(
        mut,
        seeds = [CUSTODY_TOKEN_ACCOUNT_SEED, pool.key().as_ref(), collateral_custody.mint.as_ref()],
        bump = collateral_custody.token_account_bump,
    )]
    pub collateral_custody_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref(), pool.key().as_ref(), custody.key().as_ref()],
        bump = position.bump
    )]
    pub position: Box<Account<'info, Position>>,

    #[account(
        mut,
        constraint = funding_account.mint == collateral_custody.mint,
        constraint = funding_account.owner == owner.key(),
    )]
    pub funding_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[callback_accounts("update_position")]
#[derive(Accounts)]
pub struct UpdatePositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(comp_def_offset("update_position")))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    /// CHECK: Instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("close_position", owner)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = owner,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!()
    )]
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_mempool_pda!())]
    pub mempool_account: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_execpool_pda!())]
    pub executing_pool: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_comp_pda!(computation_offset))]
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLOSE_POSITION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Box<Account<'info, Perpetuals>>,

    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub custody: Box<Account<'info, Custody>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref(), pool.key().as_ref(), custody.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// CHECK: Pyth price update account
    pub price_update: UncheckedAccount<'info>,
}

#[callback_accounts("close_position")]
#[derive(Accounts)]
pub struct ClosePositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLOSE_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    /// CHECK: Instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("check_liquidation", liquidator)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = liquidator,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!()
    )]
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_mempool_pda!())]
    pub mempool_account: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_execpool_pda!())]
    pub executing_pool: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_comp_pda!(computation_offset))]
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(seeds = [PERPETUALS_SEED], bump = perpetuals.perpetuals_bump)]
    pub perpetuals: Box<Account<'info, Perpetuals>>,

    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub custody: Box<Account<'info, Custody>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, position.owner.as_ref(), pool.key().as_ref(), custody.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// CHECK: Pyth price update account
    pub price_update: UncheckedAccount<'info>,
}

#[callback_accounts("check_liquidation")]
#[derive(Accounts)]
pub struct CheckLiquidationCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    /// CHECK: Instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[queue_computation_accounts("calculate_pnl", owner)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CalculatePnl<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        space = 9,
        payer = owner,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!()
    )]
    pub sign_pda_account: Box<Account<'info, SignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_mempool_pda!())]
    pub mempool_account: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_execpool_pda!())]
    pub executing_pool: UncheckedAccount<'info>,

    /// CHECK: Checked by arcium program
    #[account(mut, address = derive_comp_pda!(computation_offset))]
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CALCULATE_PNL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut)]
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    pub pool: Box<Account<'info, Pool>>,
    pub custody: Box<Account<'info, Custody>>,

    #[account(
        seeds = [POSITION_SEED, owner.key().as_ref(), pool.key().as_ref(), custody.key().as_ref()],
        bump = position.bump
    )]
    pub position: Box<Account<'info, Position>>,
}

#[callback_accounts("calculate_pnl")]
#[derive(Accounts)]
pub struct CalculatePnlCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CALCULATE_PNL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,

    /// CHECK: Instructions sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    // NOTE: No position account - view operations use empty callback accounts
    // following the pattern from Pythia's view_market_state
}

// ========== EVENTS ==========

#[event]
pub struct AddLiquidityEvent {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub custody: Pubkey,
    pub amount_in: u64,
    pub lp_amount_out: u64,
}

#[event]
pub struct RemoveLiquidityEvent {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub custody: Pubkey,
    pub lp_amount_in: u64,
    pub amount_out: u64,
}

#[event]
pub struct OpenPositionEvent {
    pub owner: Pubkey,
    pub position: Pubkey,
    pub pool: Pubkey,
    pub custody: Pubkey,
    pub collateral_amount: u64,
}

#[event]
pub struct PositionOpenedEvent {
    pub position: Pubkey,
    pub nonce: u128,
}

#[event]
pub struct UpdatePositionEvent {
    pub owner: Pubkey,
    pub position: Pubkey,
    pub collateral_delta: u64,
    pub is_add: bool,
}

#[event]
pub struct PositionUpdatedEvent {
    pub position: Pubkey,
    pub nonce: u128,
}

#[event]
pub struct PositionClosedEvent {
    pub position: Pubkey,
    pub profit_usd: u64,
    pub loss_usd: u64,
    pub transfer_amount: u64,
    pub fee_amount: u64,
}

#[event]
pub struct PositionLiquidatedEvent {
    pub position: Pubkey,
    pub liquidator_reward: u64,
    pub owner_amount: u64,
}

#[event]
pub struct PnlCalculatedEvent {
    // NOTE: Position pubkey not included - caller knows which position they queried
    // This follows Pythia's view callback pattern with empty callback accounts
    pub profit_usd: u64,
    pub loss_usd: u64,
    pub current_leverage: u64,
}
