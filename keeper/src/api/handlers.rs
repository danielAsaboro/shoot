use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::db::queries;
use crate::grpc::subscriber::PositionUpdate;

/// Shared application state for all handlers.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub tx: broadcast::Sender<PositionUpdate>,
    pub start_time: Instant,
    pub positions_processed: &'static AtomicU64,
}

/// Global counter for positions processed (leaked for 'static lifetime).
pub fn positions_counter() -> &'static AtomicU64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    &COUNTER
}

// -- Health --

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    uptime_secs: u64,
    db_ok: bool,
}

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    let uptime = state.start_time.elapsed().as_secs();
    Json(HealthResponse {
        status: if db_ok { "healthy" } else { "degraded" },
        uptime_secs: uptime,
        db_ok,
    })
}

// -- Competitions --

pub async fn list_competitions(State(state): State<AppState>) -> impl IntoResponse {
    match queries::list_competitions(&state.pool).await {
        Ok(rows) => (StatusCode::OK, Json(serde_json::to_value(rows).unwrap())).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to list competitions");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

pub async fn get_competition(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match queries::get_competition(&state.pool, id).await {
        Ok(Some(row)) => (StatusCode::OK, Json(serde_json::to_value(row).unwrap())).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "not found"}))).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to get competition");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct CreateCompetitionRequest {
    pub name: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub entry_fee: i64,
    pub prize_pool: i64,
}

pub async fn create_competition(
    State(state): State<AppState>,
    Json(body): Json<CreateCompetitionRequest>,
) -> impl IntoResponse {
    match queries::create_competition(
        &state.pool,
        &body.name,
        body.start_time,
        body.end_time,
        body.entry_fee,
        body.prize_pool,
    )
    .await
    {
        Ok(row) => (StatusCode::CREATED, Json(serde_json::to_value(row).unwrap())).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to create competition");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

// -- Agents --

pub async fn list_agents(State(state): State<AppState>) -> impl IntoResponse {
    match queries::list_agents(&state.pool).await {
        Ok(rows) => (StatusCode::OK, Json(serde_json::to_value(rows).unwrap())).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to list agents");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

pub async fn get_agent(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    match queries::get_agent(&state.pool, id).await {
        Ok(Some(row)) => (StatusCode::OK, Json(serde_json::to_value(row).unwrap())).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "not found"}))).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to get agent");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

// -- Leaderboard --

pub async fn get_leaderboard(
    State(state): State<AppState>,
    Path(competition_id): Path<Uuid>,
) -> impl IntoResponse {
    match queries::get_leaderboard(&state.pool, competition_id).await {
        Ok(rows) => (StatusCode::OK, Json(serde_json::to_value(rows).unwrap())).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to get leaderboard");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

// -- Metrics --

pub async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs();
    let positions = state.positions_processed.load(Ordering::Relaxed);

    // Count active competitions
    let active_competitions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM competitions WHERE status = 'live'",
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let body = format!(
        "# HELP keeper_uptime_seconds Time since keeper started\n\
         # TYPE keeper_uptime_seconds gauge\n\
         keeper_uptime_seconds {uptime}\n\
         # HELP keeper_positions_processed_total Total position updates processed\n\
         # TYPE keeper_positions_processed_total counter\n\
         keeper_positions_processed_total {positions}\n\
         # HELP keeper_active_competitions Number of live competitions\n\
         # TYPE keeper_active_competitions gauge\n\
         keeper_active_competitions {active_competitions}\n"
    );

    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}
