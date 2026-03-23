use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentRow {
    pub id: Uuid,
    pub owner: String,
    pub name: String,
    pub strategy_hash: String,
    pub elo_rating: i32,
    pub wins: i32,
    pub losses: i32,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CompetitionRow {
    pub id: Uuid,
    pub name: String,
    pub status: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub entry_fee: i64,
    pub prize_pool: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TradeRow {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub competition_id: Uuid,
    pub side: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub pnl: f64,
    pub closed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LeaderboardEntry {
    pub agent_id: Uuid,
    pub agent_name: String,
    pub owner: String,
    pub score: f64,
    pub rank: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PositionSnapshot {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub competition_id: Uuid,
    pub data: serde_json::Value,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EquitySnapshot {
    pub id: Uuid,
    pub agent_id: Uuid,
    pub competition_id: Uuid,
    pub equity_usd: f64,
    pub timestamp: DateTime<Utc>,
}
