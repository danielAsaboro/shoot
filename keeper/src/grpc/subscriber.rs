use std::collections::HashMap;
use std::time::Duration;

use futures::StreamExt;
use tokio::sync::broadcast;
use tonic::metadata::MetadataValue;
use yellowstone_grpc_client::GeyserGrpcClient;
use yellowstone_grpc_proto::geyser::{
    subscribe_request_filter_accounts_filter::Filter as AccountFilterType,
    subscribe_request_filter_accounts_filter_memcmp::Data as MemcmpData,
    SubscribeRequest, SubscribeRequestFilterAccounts, SubscribeRequestFilterAccountsFilter,
    SubscribeRequestFilterAccountsFilterMemcmp,
};
use yellowstone_grpc_proto::prelude::subscribe_update::UpdateOneof;

use crate::config::Config;
use crate::grpc::decoder::{decode_position, AdrenaPosition, POSITION_DISCRIMINATOR};

/// Message sent over the broadcast channel when a position is decoded.
#[derive(Debug, Clone)]
pub struct PositionUpdate {
    pub pubkey: String,
    pub slot: u64,
    pub position: AdrenaPosition,
}

/// Run the gRPC subscriber loop with automatic reconnection.
///
/// Connects to Yellowstone gRPC, subscribes to Adrena program account updates,
/// decodes position accounts, and publishes them on the broadcast channel.
pub async fn run(config: Config, tx: broadcast::Sender<PositionUpdate>) {
    let mut backoff = Duration::from_secs(1);
    let max_backoff = Duration::from_secs(30);

    loop {
        tracing::info!(
            endpoint = %config.grpc_endpoint,
            program = %config.adrena_program_id,
            "connecting to Yellowstone gRPC"
        );

        match subscribe_loop(&config, &tx).await {
            Ok(()) => {
                tracing::warn!("gRPC stream ended cleanly, reconnecting");
                backoff = Duration::from_secs(1);
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    backoff_ms = backoff.as_millis(),
                    "gRPC stream error, reconnecting after backoff"
                );
            }
        }

        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(max_backoff);
    }
}

async fn subscribe_loop(
    config: &Config,
    tx: &broadcast::Sender<PositionUpdate>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut client = GeyserGrpcClient::build_from_shared(config.grpc_endpoint.clone())?
        .x_token(Some(config.grpc_token.clone()))?
        .connect()
        .await?;

    tracing::info!("connected to Yellowstone gRPC");

    // Build subscription: filter accounts owned by the Adrena program
    // with the Position discriminator at offset 0.
    let disc_bytes = POSITION_DISCRIMINATOR.to_vec();

    let mut accounts_filter: HashMap<String, SubscribeRequestFilterAccounts> = HashMap::new();
    accounts_filter.insert(
        "adrena_positions".to_string(),
        SubscribeRequestFilterAccounts {
            account: vec![],
            owner: vec![config.adrena_program_id.clone()],
            filters: vec![SubscribeRequestFilterAccountsFilter {
                filter: Some(AccountFilterType::Memcmp(
                    SubscribeRequestFilterAccountsFilterMemcmp {
                        offset: 0,
                        data: Some(MemcmpData::Bytes(disc_bytes)),
                    },
                )),
            }],
            nonempty_txn_signature: None,
        },
    );

    let request = SubscribeRequest {
        accounts: accounts_filter,
        slots: HashMap::new(),
        transactions: HashMap::new(),
        transactions_status: HashMap::new(),
        blocks: HashMap::new(),
        blocks_meta: HashMap::new(),
        entry: HashMap::new(),
        commitment: None,
        accounts_data_slice: vec![],
        ping: None,
        from_slot: None,
    };

    let (_, mut stream) = client.subscribe_with_request(Some(request)).await?;

    tracing::info!("subscribed to Adrena position account updates");

    while let Some(msg) = stream.next().await {
        let msg = msg?;

        let update = match msg.update_oneof {
            Some(u) => u,
            None => continue,
        };

        if let UpdateOneof::Account(account_update) = update {
            let slot = account_update.slot;
            let account = match account_update.account {
                Some(a) => a,
                None => continue,
            };

            let pubkey = bs58::encode(&account.pubkey).into_string();
            let data = &account.data;

            match decode_position(data) {
                Ok(position) => {
                    tracing::info!(
                        pubkey = %pubkey,
                        slot = slot,
                        owner = %position.owner_bs58(),
                        side = %position.side_str(),
                        size_usd = position.size_usd_f64(),
                        pnl = position.unrealized_pnl_f64(),
                        "decoded position update"
                    );

                    let update = PositionUpdate {
                        pubkey,
                        slot,
                        position,
                    };

                    // Broadcast — ignore error (no receivers is fine)
                    let _ = tx.send(update);
                }
                Err(e) => {
                    tracing::debug!(
                        pubkey = %pubkey,
                        error = %e,
                        "skipping non-position account"
                    );
                }
            }
        }
    }

    Ok(())
}
