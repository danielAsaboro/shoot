//! Encrypted instructions for Shoot Private Perpetuals
//!
//! This module contains all MPC circuits for private perpetual trading.
//! Position data (size, side, leverage, entry price) remains encrypted
//! throughout the position lifecycle, preventing front-running and copy-trading.

use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    // ========== DATA STRUCTURES ==========

    // Encrypted position state - all fields remain hidden until position is closed
    pub struct PositionState {
        // Position side: 1 = Long, 2 = Short, 0 = None
        pub side: u8,
        // Position size in USD (scaled by 10^6)
        pub size_usd: u64,
        // Collateral amount in tokens (scaled by token decimals)
        pub collateral: u64,
        // Entry price (scaled by 10^6)
        pub entry_price: u64,
        // Effective leverage (scaled by 10^4, e.g., 50000 = 5x)
        pub leverage: u64,
    }

    // Input for opening a new position
    pub struct OpenPositionInput {
        // Position side: 1 = Long, 2 = Short
        pub side: u8,
        // Position size in USD
        pub size_usd: u64,
        // Collateral amount
        pub collateral: u64,
        // Entry price from oracle
        pub entry_price: u64,
    }

    // Input for modifying collateral
    pub struct CollateralInput {
        // Amount to add or remove
        pub amount: u64,
        // Is this an add (true) or remove (false) operation
        pub is_add: bool,
    }

    // ========== CIRCUIT: INIT POSITION ==========

    // Initialize a new encrypted position
    // Creates a position with encrypted size, side, collateral, and entry price.
    // Returns: Status code (0 = success), Encrypted position state
    #[instruction]
    pub fn init_position(
        input_ctxt: Enc<Shared, OpenPositionInput>,
        mxe: Mxe,
        oracle_price: u64,
    ) -> (u8, Enc<Mxe, PositionState>) {
        let input = input_ctxt.to_arcis();
        
        let mut status = 0_u8;
        
        // Validate inputs
        if input.side != 1 && input.side != 2 {
            status = 1; // Invalid side
        }
        if input.size_usd == 0 {
            status = 2; // Zero size
        }
        if input.collateral == 0 {
            status = 3; // Zero collateral
        }
        if oracle_price == 0 {
            status = 4; // Zero price
        }

        // Calculate leverage: (size_usd * 10000) / (collateral * entry_price / 10^6)
        // Use oracle_price instead of input.entry_price
        let leverage = if input.collateral > 0 && oracle_price > 0 {
            let collateral_usd = (input.collateral as u128 * oracle_price as u128) / 1_000_000_u128;
            if collateral_usd > 0 {
                ((input.size_usd as u128 * 10_000_u128) / collateral_usd) as u64
            } else {
                0_u64
            }
        } else {
            0_u64
        };

        let position = PositionState {
            side: input.side,
            size_usd: input.size_usd,
            collateral: input.collateral,
            entry_price: oracle_price,
            leverage,
        };

        (status.reveal(), mxe.from_arcis(position))
    }

    // ========== CIRCUIT: UPDATE POSITION (ADD/REMOVE COLLATERAL) ==========

    // Update position collateral - adds or removes collateral from an existing position
    // Returns: Status code (0 = success, 1 = insufficient, 2 = max leverage), Updated position
    #[instruction]
    pub fn update_position(
        position_ctxt: Enc<Mxe, PositionState>,
        collateral_ctxt: Enc<Shared, CollateralInput>,
        max_leverage: u64,
    ) -> (u8, Enc<Mxe, PositionState>) {
        let mut position = position_ctxt.to_arcis();
        let collateral_input = collateral_ctxt.to_arcis();
        
        let mut status = 0_u8;

        // Update collateral
        let new_collateral = if collateral_input.is_add {
            position.collateral + collateral_input.amount
        } else {
            if collateral_input.amount > position.collateral {
                status = 1; // Insufficient collateral
                position.collateral
            } else {
                position.collateral - collateral_input.amount
            }
        };

        // Recalculate leverage
        let new_leverage = if new_collateral > 0 && position.entry_price > 0 {
            let collateral_usd = (new_collateral as u128 * position.entry_price as u128) / 1_000_000_u128;
            if collateral_usd > 0 {
                ((position.size_usd as u128 * 10_000_u128) / collateral_usd) as u64
            } else {
                0_u64
            }
        } else {
            0_u64
        };

        // Check max leverage
        if new_leverage > max_leverage && status == 0 {
            status = 2; // Would exceed max leverage
        }

        if status == 0 {
            position.collateral = new_collateral;
            position.leverage = new_leverage;
        }

        (status.reveal(), position_ctxt.owner.from_arcis(position))
    }

    // ========== CIRCUIT: CHECK LIQUIDATION ==========

    // Check if a position is liquidatable based on current price and max leverage
    // Returns: is_liquidatable, liquidator_reward, owner_amount
    #[instruction]
    pub fn check_liquidation(
        position_ctxt: Enc<Mxe, PositionState>,
        current_price: u64,
        max_leverage: u64,
        liquidation_fee_bps: u64,
    ) -> (bool, u64, u64) {
        let position = position_ctxt.to_arcis();

        // Calculate current PnL based on price movement
        let price_diff = if position.side == 1 {
            // Long: profit if price went up
            if current_price > position.entry_price {
                current_price - position.entry_price
            } else {
                0_u64
            }
        } else {
            // Short: profit if price went down
            if position.entry_price > current_price {
                position.entry_price - current_price
            } else {
                0_u64
            }
        };

        let price_diff_loss = if position.side == 1 {
            // Long: loss if price went down
            if position.entry_price > current_price {
                position.entry_price - current_price
            } else {
                0_u64
            }
        } else {
            // Short: loss if price went up
            if current_price > position.entry_price {
                current_price - position.entry_price
            } else {
                0_u64
            }
        };

        // Calculate PnL in USD
        let profit_usd = if position.entry_price > 0 {
            ((price_diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64
        } else {
            0_u64
        };

        let loss_usd = if position.entry_price > 0 {
            ((price_diff_loss as u128 * position.size_usd as u128) / position.entry_price as u128) as u64
        } else {
            0_u64
        };

        // Calculate current collateral value in USD
        let collateral_usd = (position.collateral as u128 * current_price as u128 / 1_000_000_u128) as u64;

        // Current margin = collateral_usd + profit - loss
        let current_margin = if profit_usd > 0 {
            collateral_usd + profit_usd
        } else if loss_usd < collateral_usd {
            collateral_usd - loss_usd
        } else {
            0_u64
        };

        // Calculate current leverage
        let current_leverage = if current_margin > 0 {
            ((position.size_usd as u128 * 10_000_u128) / current_margin as u128) as u64
        } else {
            1_000_000_u64 // Very high leverage = definitely liquidatable
        };

        let is_liquidatable = current_leverage > max_leverage;

        // Calculate liquidation amounts
        let (liquidator_reward, owner_amount) = if is_liquidatable && current_margin > 0 {
            let reward = (current_margin as u128 * liquidation_fee_bps as u128 / 10_000_u128) as u64;
            let remaining = if current_margin > reward {
                current_margin - reward
            } else {
                0_u64
            };
            (reward, remaining)
        } else {
            (0_u64, 0_u64)
        };

        (
            is_liquidatable.reveal(),
            liquidator_reward.reveal(),
            owner_amount.reveal(),
        )
    }

    // ========== CIRCUIT: CLOSE POSITION ==========

    // Close a position and calculate final PnL
    // Returns: profit_usd, loss_usd, transfer_amount, fee_amount
    #[instruction]
    pub fn close_position(
        position_ctxt: Enc<Mxe, PositionState>,
        exit_price: u64,
        fee_bps: u64,
    ) -> (u64, u64, u64, u64) {
        let position = position_ctxt.to_arcis();

        // Calculate price movement
        let (profit_usd, loss_usd) = if position.side == 1 {
            // Long position
            if exit_price > position.entry_price {
                let diff = exit_price - position.entry_price;
                let profit = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (profit, 0_u64)
            } else {
                let diff = position.entry_price - exit_price;
                let loss = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (0_u64, loss)
            }
        } else {
            // Short position
            if position.entry_price > exit_price {
                let diff = position.entry_price - exit_price;
                let profit = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (profit, 0_u64)
            } else {
                let diff = exit_price - position.entry_price;
                let loss = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (0_u64, loss)
            }
        };

        // Calculate collateral value at exit
        let collateral_usd = (position.collateral as u128 * exit_price as u128 / 1_000_000_u128) as u64;

        // Calculate fee
        let fee_amount = (position.size_usd as u128 * fee_bps as u128 / 10_000_u128) as u64;

        // Calculate transfer amount
        let gross_amount = if profit_usd > 0 {
            collateral_usd + profit_usd
        } else if loss_usd < collateral_usd {
            collateral_usd - loss_usd
        } else {
            0_u64
        };

        let transfer_amount = if gross_amount > fee_amount {
            gross_amount - fee_amount
        } else {
            0_u64
        };

        (
            profit_usd.reveal(),
            loss_usd.reveal(),
            transfer_amount.reveal(),
            fee_amount.reveal(),
        )
    }

    // ========== CIRCUIT: CALCULATE PNL (VIEW ONLY) ==========

    // Calculate current PnL for a position owner
    // Returns: profit_usd, loss_usd, current_leverage
    #[instruction]
    pub fn calculate_pnl(
        position_ctxt: Enc<Mxe, PositionState>,
        current_price: u64,
    ) -> (u64, u64, u64) {
        let position = position_ctxt.to_arcis();

        // Calculate price movement
        let (profit_usd, loss_usd) = if position.side == 1 {
            // Long position
            if current_price > position.entry_price {
                let diff = current_price - position.entry_price;
                let profit = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (profit, 0_u64)
            } else {
                let diff = position.entry_price - current_price;
                let loss = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (0_u64, loss)
            }
        } else {
            // Short position
            if position.entry_price > current_price {
                let diff = position.entry_price - current_price;
                let profit = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (profit, 0_u64)
            } else {
                let diff = current_price - position.entry_price;
                let loss = ((diff as u128 * position.size_usd as u128) / position.entry_price as u128) as u64;
                (0_u64, loss)
            }
        };

        // Calculate current collateral value
        let collateral_usd = (position.collateral as u128 * current_price as u128 / 1_000_000_u128) as u64;

        // Calculate current margin
        let current_margin = if profit_usd > 0 {
            collateral_usd + profit_usd
        } else if loss_usd < collateral_usd {
            collateral_usd - loss_usd
        } else {
            0_u64
        };

        // Calculate current leverage
        let current_leverage = if current_margin > 0 {
            ((position.size_usd as u128 * 10_000_u128) / current_margin as u128) as u64
        } else {
            1_000_000_u64
        };

        (
            profit_usd.reveal(),
            loss_usd.reveal(),
            current_leverage.reveal(),
        )
    }
}
