use crate::error::{KeeperError, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub grpc_endpoint: String,
    pub grpc_token: String,
    pub database_url: String,
    pub adrena_program_id: String,
    pub listen_addr: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let grpc_endpoint = std::env::var("GRPC_ENDPOINT")
            .map_err(|_| KeeperError::Config("GRPC_ENDPOINT not set".into()))?;

        let grpc_token = std::env::var("GRPC_TOKEN")
            .map_err(|_| KeeperError::Config("GRPC_TOKEN not set".into()))?;

        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| KeeperError::Config("DATABASE_URL not set".into()))?;

        let adrena_program_id = std::env::var("ADRENA_PROGRAM_ID")
            .unwrap_or_else(|_| "13gDzEXCdocbj8iAiqrScGo47NiSuYENGsRqi3SEAwet".into());

        let listen_addr = std::env::var("LISTEN_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".into());

        Ok(Self {
            grpc_endpoint,
            grpc_token,
            database_url,
            adrena_program_id,
            listen_addr,
        })
    }
}
