use thiserror::Error;

#[derive(Debug, Error)]
pub enum KeeperError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("gRPC error: {0}")]
    Grpc(String),

    #[error("decode error: {0}")]
    Decode(String),

    #[error("config error: {0}")]
    Config(String),

    #[error("invalid state transition: {0}")]
    InvalidState(String),
}

pub type Result<T> = std::result::Result<T, KeeperError>;
