//! State module for Shoot Private Perpetuals
//! 
//! This module contains all account structures for the protocol.
//! Position data is stored encrypted to prevent front-running and copy-trading.

pub mod perpetuals;
pub mod pool;
pub mod custody;
pub mod position;
pub mod oracle;

pub use perpetuals::*;
pub use pool::*;
pub use custody::*;
pub use position::*;
pub use oracle::*;

