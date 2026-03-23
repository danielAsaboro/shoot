use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::models::*;
use crate::error::Result;

pub async fn list_competitions(pool: &PgPool) -> Result<Vec<CompetitionRow>> {
    let rows = sqlx::query_as::<_, CompetitionRow>(
        "SELECT id, name, status, start_time, end_time, entry_fee, prize_pool
         FROM competitions ORDER BY start_time DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_competition(pool: &PgPool, id: Uuid) -> Result<Option<CompetitionRow>> {
    let row = sqlx::query_as::<_, CompetitionRow>(
        "SELECT id, name, status, start_time, end_time, entry_fee, prize_pool
         FROM competitions WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn create_competition(
    pool: &PgPool,
    name: &str,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    entry_fee: i64,
    prize_pool: i64,
) -> Result<CompetitionRow> {
    let id = Uuid::new_v4();
    let row = sqlx::query_as::<_, CompetitionRow>(
        "INSERT INTO competitions (id, name, status, start_time, end_time, entry_fee, prize_pool)
         VALUES ($1, $2, 'upcoming', $3, $4, $5, $6)
         RETURNING id, name, status, start_time, end_time, entry_fee, prize_pool",
    )
    .bind(id)
    .bind(name)
    .bind(start_time)
    .bind(end_time)
    .bind(entry_fee)
    .bind(prize_pool)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn update_competition_status(pool: &PgPool, id: Uuid, status: &str) -> Result<()> {
    sqlx::query("UPDATE competitions SET status = $1 WHERE id = $2")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_agents(pool: &PgPool) -> Result<Vec<AgentRow>> {
    let rows = sqlx::query_as::<_, AgentRow>(
        "SELECT id, owner, name, strategy_hash, elo_rating, wins, losses, status, created_at
         FROM agents ORDER BY elo_rating DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_agent(pool: &PgPool, id: Uuid) -> Result<Option<AgentRow>> {
    let row = sqlx::query_as::<_, AgentRow>(
        "SELECT id, owner, name, strategy_hash, elo_rating, wins, losses, status, created_at
         FROM agents WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn insert_trade(pool: &PgPool, trade: &TradeRow) -> Result<()> {
    sqlx::query(
        "INSERT INTO trades (id, agent_id, competition_id, side, entry_price, exit_price, pnl, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(trade.id)
    .bind(trade.agent_id)
    .bind(trade.competition_id)
    .bind(&trade.side)
    .bind(trade.entry_price)
    .bind(trade.exit_price)
    .bind(trade.pnl)
    .bind(trade.closed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_trades_for_competition(
    pool: &PgPool,
    agent_id: Uuid,
    competition_id: Uuid,
) -> Result<Vec<TradeRow>> {
    let rows = sqlx::query_as::<_, TradeRow>(
        "SELECT id, agent_id, competition_id, side, entry_price, exit_price, pnl, closed_at
         FROM trades WHERE agent_id = $1 AND competition_id = $2 ORDER BY closed_at ASC",
    )
    .bind(agent_id)
    .bind(competition_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_leaderboard(pool: &PgPool, competition_id: Uuid) -> Result<Vec<LeaderboardEntry>> {
    let rows = sqlx::query_as::<_, LeaderboardEntry>(
        "SELECT
            l.agent_id,
            a.name AS agent_name,
            a.owner,
            l.score,
            CAST(ROW_NUMBER() OVER (ORDER BY l.score DESC) AS INT) AS rank
         FROM leaderboard l
         JOIN agents a ON a.id = l.agent_id
         WHERE l.competition_id = $1
         ORDER BY l.score DESC",
    )
    .bind(competition_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn insert_position_snapshot(pool: &PgPool, snapshot: &PositionSnapshot) -> Result<()> {
    sqlx::query(
        "INSERT INTO position_snapshots (id, agent_id, competition_id, data, captured_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(snapshot.id)
    .bind(snapshot.agent_id)
    .bind(snapshot.competition_id)
    .bind(&snapshot.data)
    .bind(snapshot.captured_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_equity_snapshot(pool: &PgPool, snapshot: &EquitySnapshot) -> Result<()> {
    sqlx::query(
        "INSERT INTO equity_snapshots (id, agent_id, competition_id, equity_usd, timestamp)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(snapshot.id)
    .bind(snapshot.agent_id)
    .bind(snapshot.competition_id)
    .bind(snapshot.equity_usd)
    .bind(snapshot.timestamp)
    .execute(pool)
    .await?;
    Ok(())
}
