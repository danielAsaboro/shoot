use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::stream::Stream;
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::api::handlers::AppState;

/// SSE endpoint that streams live position updates for a given competition.
///
/// Clients connect to `GET /api/competitions/:id/live` and receive a stream
/// of position update events filtered by competition context.
pub async fn live_stream(
    State(state): State<AppState>,
    Path(competition_id): Path<Uuid>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx);

    let event_stream = stream.filter_map(move |msg| {
        match msg {
            Ok(update) => {
                let payload = serde_json::json!({
                    "pubkey": update.pubkey,
                    "slot": update.slot,
                    "owner": update.position.owner_bs58(),
                    "side": update.position.side_str(),
                    "size_usd": update.position.size_usd_f64(),
                    "unrealized_pnl": update.position.unrealized_pnl_f64(),
                    "entry_price": update.position.price_f64(),
                    "competition_id": competition_id.to_string(),
                });

                let event = Event::default()
                    .event("position_update")
                    .data(payload.to_string());

                Some(Ok(event))
            }
            Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n)) => {
                tracing::warn!(
                    competition_id = %competition_id,
                    skipped = n,
                    "SSE client lagged behind, skipped events"
                );
                let event = Event::default()
                    .event("lagged")
                    .data(format!("{{\"skipped\": {n}}}"));
                Some(Ok(event))
            }
        }
    });

    Sse::new(event_stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keepalive"),
    )
}
