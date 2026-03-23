mod api;
mod config;
mod db;
mod error;
mod grpc;
mod lifecycle;
mod scoring;

use std::time::Instant;

use axum::routing::{get, post};
use axum::Router;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

use crate::api::handlers::{self, AppState};
use crate::api::sse;
use crate::config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "shoot_keeper=info,tower_http=info".into()),
        )
        .json()
        .init();

    tracing::info!("starting shoot-keeper");

    // Load configuration
    let config = Config::from_env().map_err(|e| anyhow::anyhow!("{e}"))?;
    tracing::info!(
        listen_addr = %config.listen_addr,
        grpc_endpoint = %config.grpc_endpoint,
        program_id = %config.adrena_program_id,
        "configuration loaded"
    );

    // Create PostgreSQL connection pool
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await
        .map_err(|e| anyhow::anyhow!("failed to connect to database: {e}"))?;

    tracing::info!("connected to PostgreSQL");

    // Broadcast channel for position updates (gRPC -> SSE + processing)
    let (tx, _rx) = broadcast::channel::<grpc::subscriber::PositionUpdate>(4096);

    // Spawn gRPC subscriber
    let grpc_config = config.clone();
    let grpc_tx = tx.clone();
    tokio::spawn(async move {
        grpc::subscriber::run(grpc_config, grpc_tx).await;
    });
    tracing::info!("spawned gRPC subscriber task");

    // Spawn lifecycle monitor
    let lifecycle_pool = pool.clone();
    tokio::spawn(async move {
        lifecycle::fsm::monitor(lifecycle_pool).await;
    });
    tracing::info!("spawned lifecycle monitor task");

    // Build Axum router
    let start_time = Instant::now();
    let positions_processed = handlers::positions_counter();

    let state = AppState {
        pool,
        tx,
        start_time,
        positions_processed,
    };

    let app = Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/competitions", get(handlers::list_competitions))
        .route("/api/competitions", post(handlers::create_competition))
        .route("/api/competitions/{id}", get(handlers::get_competition))
        .route(
            "/api/competitions/{id}/live",
            get(sse::live_stream),
        )
        .route("/api/agents", get(handlers::list_agents))
        .route("/api/agents/{id}", get(handlers::get_agent))
        .route(
            "/api/leaderboard/{competition_id}",
            get(handlers::get_leaderboard),
        )
        .route("/api/metrics", get(handlers::metrics))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Start HTTP server
    let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
    tracing::info!(addr = %config.listen_addr, "HTTP server listening");
    axum::serve(listener, app).await?;

    Ok(())
}
