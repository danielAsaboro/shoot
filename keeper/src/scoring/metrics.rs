use crate::scoring::engine::TradeRecord;

/// Sum of all trade P&Ls.
pub fn calc_net_pnl(trades: &[TradeRecord]) -> f64 {
    trades.iter().map(|t| t.pnl).sum()
}

/// Maximum peak-to-trough drawdown in the equity curve.
/// Returns a positive value (e.g., 500.0 means the curve dropped $500 from its peak).
pub fn calc_max_drawdown(equity_curve: &[f64]) -> f64 {
    if equity_curve.is_empty() {
        return 0.0;
    }
    let mut peak = equity_curve[0];
    let mut max_dd = 0.0f64;
    for &val in equity_curve {
        if val > peak {
            peak = val;
        }
        let dd = peak - val;
        if dd > max_dd {
            max_dd = dd;
        }
    }
    max_dd
}

/// Annualized Sharpe ratio given a series of per-trade returns.
/// Uses mean/stddev with no risk-free rate adjustment.
pub fn calc_sharpe_ratio(returns: &[f64]) -> f64 {
    if returns.len() < 2 {
        return 0.0;
    }
    let n = returns.len() as f64;
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let stddev = variance.sqrt();
    if stddev < 1e-12 {
        return 0.0;
    }
    mean / stddev
}

/// Fraction of trades that were profitable (pnl > 0).
pub fn calc_win_rate(trades: &[TradeRecord]) -> f64 {
    if trades.is_empty() {
        return 0.0;
    }
    let wins = trades.iter().filter(|t| t.pnl > 0.0).count();
    wins as f64 / trades.len() as f64
}

/// Ratio of gross profits to gross losses.
/// Returns f64::INFINITY if there are no losses.
pub fn calc_profit_factor(trades: &[TradeRecord]) -> f64 {
    let gross_profit: f64 = trades.iter().filter(|t| t.pnl > 0.0).map(|t| t.pnl).sum();
    let gross_loss: f64 = trades
        .iter()
        .filter(|t| t.pnl < 0.0)
        .map(|t| t.pnl.abs())
        .sum();
    if gross_loss < 1e-12 {
        if gross_profit > 0.0 {
            return f64::INFINITY;
        }
        return 0.0;
    }
    gross_profit / gross_loss
}

/// Activity multiplier: min(trade_count / expected_trades, 2.0).
/// Rewards traders who are active but caps at 2x.
pub fn calc_activity_multiplier(trade_count: usize, expected_trades: usize) -> f64 {
    if expected_trades == 0 {
        return 1.0;
    }
    let ratio = trade_count as f64 / expected_trades as f64;
    ratio.min(2.0)
}

/// Duration bonus: min(hours_active / total_hours, 1.0) * 1.5, capped at 1.5.
/// Rewards traders who remain active throughout the competition.
pub fn calc_duration_bonus(hours_active: f64, total_hours: f64) -> f64 {
    if total_hours <= 0.0 {
        return 1.0;
    }
    let ratio = (hours_active / total_hours).min(1.0);
    let bonus = 1.0 + (ratio * 0.5);
    bonus.min(1.5)
}

/// Build equity curve from a sorted sequence of trades starting at a given equity.
pub fn build_equity_curve(trades: &[TradeRecord], starting_equity: f64) -> Vec<f64> {
    let mut curve = Vec::with_capacity(trades.len() + 1);
    curve.push(starting_equity);
    let mut equity = starting_equity;
    for trade in trades {
        equity += trade.pnl;
        curve.push(equity);
    }
    curve
}

/// Average trade duration in seconds. Returns 0 if no trades.
pub fn calc_avg_trade_duration(trades: &[TradeRecord]) -> f64 {
    if trades.is_empty() {
        return 0.0;
    }
    let total: f64 = trades
        .iter()
        .map(|t| (t.exit_time - t.entry_time) as f64)
        .sum();
    total / trades.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scoring::engine::TradeRecord;

    fn make_trade(pnl: f64) -> TradeRecord {
        TradeRecord {
            pnl,
            entry_time: 1000,
            exit_time: 2000,
            side: "Long".into(),
            size_usd: 1000.0,
        }
    }

    fn make_trade_timed(pnl: f64, entry: i64, exit: i64) -> TradeRecord {
        TradeRecord {
            pnl,
            entry_time: entry,
            exit_time: exit,
            side: "Long".into(),
            size_usd: 1000.0,
        }
    }

    // --- net pnl ---

    #[test]
    fn test_net_pnl_empty() {
        assert_eq!(calc_net_pnl(&[]), 0.0);
    }

    #[test]
    fn test_net_pnl_mixed() {
        let trades = vec![make_trade(100.0), make_trade(-30.0), make_trade(50.0)];
        assert!((calc_net_pnl(&trades) - 120.0).abs() < 1e-9);
    }

    #[test]
    fn test_net_pnl_all_losses() {
        let trades = vec![make_trade(-10.0), make_trade(-20.0)];
        assert!((calc_net_pnl(&trades) - (-30.0)).abs() < 1e-9);
    }

    // --- max drawdown ---

    #[test]
    fn test_max_drawdown_empty() {
        assert_eq!(calc_max_drawdown(&[]), 0.0);
    }

    #[test]
    fn test_max_drawdown_monotonic_up() {
        assert_eq!(calc_max_drawdown(&[100.0, 110.0, 120.0]), 0.0);
    }

    #[test]
    fn test_max_drawdown_single_drop() {
        let curve = vec![100.0, 110.0, 90.0, 105.0];
        assert!((calc_max_drawdown(&curve) - 20.0).abs() < 1e-9);
    }

    #[test]
    fn test_max_drawdown_multiple_drops() {
        let curve = vec![100.0, 120.0, 95.0, 130.0, 80.0];
        // Peak 130, trough 80 => drawdown 50
        assert!((calc_max_drawdown(&curve) - 50.0).abs() < 1e-9);
    }

    // --- sharpe ratio ---

    #[test]
    fn test_sharpe_empty() {
        assert_eq!(calc_sharpe_ratio(&[]), 0.0);
    }

    #[test]
    fn test_sharpe_single_return() {
        assert_eq!(calc_sharpe_ratio(&[0.05]), 0.0);
    }

    #[test]
    fn test_sharpe_constant_returns() {
        // All same => stddev=0 => sharpe=0
        assert_eq!(calc_sharpe_ratio(&[0.01, 0.01, 0.01]), 0.0);
    }

    #[test]
    fn test_sharpe_positive_returns() {
        let returns = vec![0.01, 0.02, 0.03, 0.01, 0.02];
        let sharpe = calc_sharpe_ratio(&returns);
        assert!(sharpe > 0.0);
    }

    #[test]
    fn test_sharpe_negative_mean() {
        let returns = vec![-0.05, -0.03, -0.04, -0.02, -0.06];
        let sharpe = calc_sharpe_ratio(&returns);
        assert!(sharpe < 0.0);
    }

    // --- win rate ---

    #[test]
    fn test_win_rate_empty() {
        assert_eq!(calc_win_rate(&[]), 0.0);
    }

    #[test]
    fn test_win_rate_all_wins() {
        let trades = vec![make_trade(10.0), make_trade(20.0)];
        assert!((calc_win_rate(&trades) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_win_rate_all_losses() {
        let trades = vec![make_trade(-10.0), make_trade(-20.0)];
        assert!((calc_win_rate(&trades)).abs() < 1e-9);
    }

    #[test]
    fn test_win_rate_mixed() {
        let trades = vec![make_trade(10.0), make_trade(-5.0), make_trade(20.0), make_trade(-3.0)];
        assert!((calc_win_rate(&trades) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_win_rate_zero_pnl_not_a_win() {
        let trades = vec![make_trade(0.0), make_trade(10.0)];
        assert!((calc_win_rate(&trades) - 0.5).abs() < 1e-9);
    }

    // --- profit factor ---

    #[test]
    fn test_profit_factor_no_trades() {
        assert_eq!(calc_profit_factor(&[]), 0.0);
    }

    #[test]
    fn test_profit_factor_no_losses() {
        let trades = vec![make_trade(100.0), make_trade(50.0)];
        assert_eq!(calc_profit_factor(&trades), f64::INFINITY);
    }

    #[test]
    fn test_profit_factor_no_wins() {
        let trades = vec![make_trade(-100.0), make_trade(-50.0)];
        assert_eq!(calc_profit_factor(&trades), 0.0);
    }

    #[test]
    fn test_profit_factor_mixed() {
        let trades = vec![make_trade(300.0), make_trade(-100.0)];
        assert!((calc_profit_factor(&trades) - 3.0).abs() < 1e-9);
    }

    // --- activity multiplier ---

    #[test]
    fn test_activity_zero_expected() {
        assert_eq!(calc_activity_multiplier(5, 0), 1.0);
    }

    #[test]
    fn test_activity_below_expected() {
        assert!((calc_activity_multiplier(5, 10) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn test_activity_at_expected() {
        assert!((calc_activity_multiplier(10, 10) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_activity_caps_at_two() {
        assert!((calc_activity_multiplier(100, 10) - 2.0).abs() < 1e-9);
    }

    // --- duration bonus ---

    #[test]
    fn test_duration_bonus_zero_total() {
        assert_eq!(calc_duration_bonus(10.0, 0.0), 1.0);
    }

    #[test]
    fn test_duration_bonus_full_active() {
        assert!((calc_duration_bonus(24.0, 24.0) - 1.5).abs() < 1e-9);
    }

    #[test]
    fn test_duration_bonus_half_active() {
        assert!((calc_duration_bonus(12.0, 24.0) - 1.25).abs() < 1e-9);
    }

    #[test]
    fn test_duration_bonus_caps_at_1_5() {
        // More active hours than total should still cap
        assert!((calc_duration_bonus(48.0, 24.0) - 1.5).abs() < 1e-9);
    }

    // --- equity curve ---

    #[test]
    fn test_equity_curve_empty() {
        let curve = build_equity_curve(&[], 1000.0);
        assert_eq!(curve, vec![1000.0]);
    }

    #[test]
    fn test_equity_curve_basic() {
        let trades = vec![make_trade(100.0), make_trade(-50.0), make_trade(200.0)];
        let curve = build_equity_curve(&trades, 1000.0);
        assert_eq!(curve, vec![1000.0, 1100.0, 1050.0, 1250.0]);
    }

    // --- avg trade duration ---

    #[test]
    fn test_avg_duration_empty() {
        assert_eq!(calc_avg_trade_duration(&[]), 0.0);
    }

    #[test]
    fn test_avg_duration_basic() {
        let trades = vec![
            make_trade_timed(10.0, 0, 100),
            make_trade_timed(20.0, 0, 200),
        ];
        assert!((calc_avg_trade_duration(&trades) - 150.0).abs() < 1e-9);
    }

    #[test]
    fn test_avg_duration_single() {
        let trades = vec![make_trade_timed(5.0, 1000, 3600)];
        assert!((calc_avg_trade_duration(&trades) - 2600.0).abs() < 1e-9);
    }
}
