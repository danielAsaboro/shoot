use crate::scoring::metrics;

/// A single closed trade record used for scoring.
#[derive(Debug, Clone)]
pub struct TradeRecord {
    pub pnl: f64,
    pub entry_time: i64,
    pub exit_time: i64,
    pub side: String,
    pub size_usd: f64,
}

/// Full scoring result for a trader in a competition.
#[derive(Debug, Clone)]
pub struct ScoringResult {
    pub composite_score: f64,
    pub net_pnl: f64,
    pub max_drawdown: f64,
    pub activity_multiplier: f64,
    pub duration_bonus: f64,
    pub sharpe_ratio: f64,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub avg_trade_duration_secs: f64,
    pub total_trades: usize,
}

/// Compute the full scoring result for a trader given their closed trades.
///
/// `competition_duration_hours` is the total length of the competition.
/// Expected trades is estimated at 1 per hour of competition duration.
pub fn compute_score(trades: &[TradeRecord], competition_duration_hours: f64) -> ScoringResult {
    if trades.is_empty() {
        return ScoringResult {
            composite_score: 0.0,
            net_pnl: 0.0,
            max_drawdown: 0.0,
            activity_multiplier: 0.0,
            duration_bonus: 1.0,
            sharpe_ratio: 0.0,
            win_rate: 0.0,
            profit_factor: 0.0,
            avg_trade_duration_secs: 0.0,
            total_trades: 0,
        };
    }

    let net_pnl = metrics::calc_net_pnl(trades);
    let equity_curve = metrics::build_equity_curve(trades, 0.0);
    let max_drawdown = metrics::calc_max_drawdown(&equity_curve);

    let returns: Vec<f64> = trades.iter().map(|t| t.pnl).collect();
    let sharpe_ratio = metrics::calc_sharpe_ratio(&returns);

    let win_rate = metrics::calc_win_rate(trades);
    let profit_factor = metrics::calc_profit_factor(trades);
    let avg_trade_duration_secs = metrics::calc_avg_trade_duration(trades);

    let expected_trades = (competition_duration_hours as usize).max(1);
    let activity_multiplier = metrics::calc_activity_multiplier(trades.len(), expected_trades);

    // Hours active: from earliest entry to latest exit
    let earliest_entry = trades.iter().map(|t| t.entry_time).min().unwrap_or(0);
    let latest_exit = trades.iter().map(|t| t.exit_time).max().unwrap_or(0);
    let hours_active = (latest_exit - earliest_entry) as f64 / 3600.0;
    let duration_bonus = metrics::calc_duration_bonus(hours_active, competition_duration_hours);

    let composite_score =
        compute_composite_score(net_pnl, max_drawdown, activity_multiplier, duration_bonus);

    ScoringResult {
        composite_score,
        net_pnl,
        max_drawdown,
        activity_multiplier,
        duration_bonus,
        sharpe_ratio,
        win_rate,
        profit_factor,
        avg_trade_duration_secs,
        total_trades: trades.len(),
    }
}

/// Arena Score = (Net P&L / max(Max Drawdown, 0.01)) x Activity Multiplier x Duration Bonus
///
/// The floor of 0.01 on drawdown prevents division by zero for perfect runs.
pub fn compute_composite_score(
    net_pnl: f64,
    max_drawdown: f64,
    activity_mult: f64,
    duration_bonus: f64,
) -> f64 {
    let dd = max_drawdown.max(0.01);
    (net_pnl / dd) * activity_mult * duration_bonus
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trade(pnl: f64, entry: i64, exit: i64) -> TradeRecord {
        TradeRecord {
            pnl,
            entry_time: entry,
            exit_time: exit,
            side: "Long".into(),
            size_usd: 1000.0,
        }
    }

    #[test]
    fn test_empty_trades_zero_score() {
        let result = compute_score(&[], 24.0);
        assert_eq!(result.composite_score, 0.0);
        assert_eq!(result.total_trades, 0);
        assert_eq!(result.net_pnl, 0.0);
        assert_eq!(result.max_drawdown, 0.0);
    }

    #[test]
    fn test_single_winning_trade() {
        let trades = vec![make_trade(500.0, 0, 3600)];
        let result = compute_score(&trades, 24.0);
        assert!(result.composite_score > 0.0);
        assert!((result.net_pnl - 500.0).abs() < 1e-9);
        assert!((result.win_rate - 1.0).abs() < 1e-9);
        assert_eq!(result.total_trades, 1);
    }

    #[test]
    fn test_single_losing_trade() {
        let trades = vec![make_trade(-200.0, 0, 3600)];
        let result = compute_score(&trades, 24.0);
        assert!(result.composite_score < 0.0);
        assert!((result.net_pnl - (-200.0)).abs() < 1e-9);
        assert!((result.win_rate).abs() < 1e-9);
    }

    #[test]
    fn test_mixed_trades() {
        let trades = vec![
            make_trade(100.0, 0, 1000),
            make_trade(-50.0, 1000, 2000),
            make_trade(200.0, 2000, 3000),
            make_trade(-30.0, 3000, 4000),
        ];
        let result = compute_score(&trades, 24.0);
        assert!((result.net_pnl - 220.0).abs() < 1e-9);
        assert!((result.win_rate - 0.5).abs() < 1e-9);
        assert_eq!(result.total_trades, 4);
        assert!(result.composite_score > 0.0);
    }

    #[test]
    fn test_high_drawdown_reduces_score() {
        // Same net P&L, but different drawdown paths
        let low_dd = vec![make_trade(100.0, 0, 1000)];
        let high_dd = vec![
            make_trade(-500.0, 0, 1000),
            make_trade(600.0, 1000, 2000),
        ];
        let r1 = compute_score(&low_dd, 24.0);
        let r2 = compute_score(&high_dd, 24.0);
        assert!(r1.composite_score > r2.composite_score);
    }

    #[test]
    fn test_activity_multiplier_caps_at_two() {
        // 200 trades in 24 hours => activity = 200/24 capped at 2.0
        let trades: Vec<TradeRecord> = (0..200)
            .map(|i| make_trade(1.0, i * 100, (i + 1) * 100))
            .collect();
        let result = compute_score(&trades, 24.0);
        assert!((result.activity_multiplier - 2.0).abs() < 1e-9);
    }

    #[test]
    fn test_duration_bonus_caps_at_1_5() {
        // Trades spanning full 24 hours
        let trades = vec![
            make_trade(50.0, 0, 3600),
            make_trade(50.0, 82800, 86400), // last hour
        ];
        let result = compute_score(&trades, 24.0);
        assert!((result.duration_bonus - 1.5).abs() < 1e-9);
    }

    #[test]
    fn test_sharpe_ratio_positive_for_consistent_wins() {
        let trades: Vec<TradeRecord> = (0..20)
            .map(|i| make_trade(10.0 + (i as f64 * 0.1), i * 100, (i + 1) * 100))
            .collect();
        let result = compute_score(&trades, 24.0);
        assert!(result.sharpe_ratio > 0.0);
    }

    #[test]
    fn test_win_rate_calculation() {
        let trades = vec![
            make_trade(10.0, 0, 100),
            make_trade(-5.0, 100, 200),
            make_trade(20.0, 200, 300),
        ];
        let result = compute_score(&trades, 24.0);
        assert!((result.win_rate - 2.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn test_profit_factor_no_losses_is_infinity() {
        let trades = vec![make_trade(100.0, 0, 1000), make_trade(50.0, 1000, 2000)];
        let result = compute_score(&trades, 24.0);
        assert_eq!(result.profit_factor, f64::INFINITY);
    }

    #[test]
    fn test_composite_score_formula() {
        let score = compute_composite_score(1000.0, 200.0, 1.5, 1.2);
        // 1000/200 * 1.5 * 1.2 = 5 * 1.5 * 1.2 = 9.0
        assert!((score - 9.0).abs() < 1e-9);
    }

    #[test]
    fn test_composite_score_zero_drawdown_floors() {
        let score = compute_composite_score(100.0, 0.0, 1.0, 1.0);
        // 100 / 0.01 * 1 * 1 = 10000
        assert!((score - 10000.0).abs() < 1e-9);
    }

    #[test]
    fn test_composite_score_negative_pnl() {
        let score = compute_composite_score(-100.0, 100.0, 1.0, 1.0);
        assert!((score - (-1.0)).abs() < 1e-9);
    }

    #[test]
    fn test_avg_trade_duration() {
        let trades = vec![
            make_trade(10.0, 0, 3600),
            make_trade(20.0, 0, 7200),
        ];
        let result = compute_score(&trades, 24.0);
        assert!((result.avg_trade_duration_secs - 5400.0).abs() < 1e-9);
    }
}
