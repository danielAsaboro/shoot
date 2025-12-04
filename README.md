# Shoot Private Perpetuals

A privacy-preserving perpetual futures protocol built on Solana with Arcium MPC (Multi-Party Computation).

## 🔒 Privacy Features

Shoot enables truly private perpetual trading where position details remain encrypted throughout the position lifecycle:

### What's Hidden

- **Position Side** - Long or short direction is encrypted
- **Position Size** - USD value of the position is hidden
- **Collateral Amount** - How much margin you've deposited
- **Entry Price** - Your entry point is private
- **Effective Leverage** - Your risk exposure is concealed
- **Liquidation Price** - Cannot be calculated by observers

### What's Public

- Position owner (wallet address)
- Pool and custody references
- Open/close timestamps
- Whether position is active

### Privacy Benefits

| Attack Vector | Protection |
|--------------|------------|
| Front-running | ✅ Attackers can't see pending trades |
| Copy-trading | ✅ Strategies remain private |
| Targeted Liquidations | ✅ Can't calculate liquidation prices |
| MEV Extraction | ✅ Position details hidden from searchers |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trader Client                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Encrypt Position│  │ Sign Transaction│  │ Decrypt Results │  │
│  │ Parameters      │  │                 │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └────────▲────────┘  │
└───────────┼─────────────────────┼──────────────────┼────────────┘
            │                     │                  │
            ▼                     ▼                  │
┌───────────────────────────────────────────────────────────────────┐
│                         Solana                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Shoot Program                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │ Open Position│  │ Close Pos.   │  │ Liquidate        │   │  │
│  │  │ (queue MPC)  │  │ (queue MPC)  │  │ (queue MPC)      │   │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │  │
│  │         │                 │                   │              │  │
│  │         ▼                 ▼                   ▼              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │              Encrypted Position State                 │   │  │
│  │  │  [side][size][collateral][entry_price][leverage]     │   │  │
│  │  │       32B    32B      32B         32B        32B      │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
            │                     │                  ▲
            ▼                     ▼                  │
┌───────────────────────────────────────────────────────────────────┐
│                      Arcium MPC Network                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    MPC Circuits                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │ init_position│  │ close_pos.   │  │ check_liquidation│   │  │
│  │  │ (compute lev)│  │ (compute pnl)│  │ (check margin)   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
shoot/
├── programs/shoot/src/
│   ├── lib.rs              # Main program with all instructions
│   ├── constants.rs        # PDA seeds and constants
│   ├── error.rs            # Custom error codes
│   └── state/
│       ├── mod.rs          # State module exports
│       ├── perpetuals.rs   # Global protocol state
│       ├── pool.rs         # Liquidity pool state
│       ├── custody.rs      # Token custody state
│       ├── position.rs     # Encrypted position state
│       └── oracle.rs       # Oracle types
├── encrypted-ixs/src/
│   └── lib.rs              # MPC circuits for private computations
├── tests/
│   └── shoot.ts            # Comprehensive test suite
└── README.md
```

## 🔧 MPC Circuits

### `init_position`
Encrypts initial position parameters and computes leverage.

```rust
#[instruction]
pub fn init_position(
    input_ctxt: Enc<Shared, OpenPositionInput>,
) -> (u8, Enc<Mxe, PositionState>)
```

### `update_position`
Adds or removes collateral from an existing position.

```rust
#[instruction]
pub fn update_position(
    position_ctxt: Enc<Mxe, PositionState>,
    collateral_ctxt: Enc<Shared, CollateralInput>,
    max_leverage: u64,
) -> (u8, Enc<Mxe, PositionState>)
```

### `check_liquidation`
Checks if a position is liquidatable based on current price.

```rust
#[instruction]
pub fn check_liquidation(
    position_ctxt: Enc<Mxe, PositionState>,
    current_price: u64,
    max_leverage: u64,
    liquidation_fee_bps: u64,
) -> (bool, u64, u64)
```

### `close_position`
Calculates final PnL and settlement amounts.

```rust
#[instruction]
pub fn close_position(
    position_ctxt: Enc<Mxe, PositionState>,
    exit_price: u64,
    fee_bps: u64,
) -> (u64, u64, u64, u64) // profit, loss, transfer, fee
```

### `calculate_pnl`
View function to privately check unrealized PnL.

```rust
    #[instruction]
pub fn calculate_pnl(
    position_ctxt: Enc<Mxe, PositionState>,
    current_price: u64,
) -> (u64, u64, u64) // profit, loss, leverage
```

## 🚀 Getting Started

### Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.31+
- Node.js 18+
- Arcium CLI

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd shoot

# Install dependencies
yarn install

# Build the program
arcium build

# Run tests
arcium test
```

### Running Locally

1. Start the Arcium localnet:
```bash
arcium localnet
```

2. In a new terminal, deploy and test:
```bash
arcium test
```

## 📊 Protocol Parameters

### Leverage Limits
- Minimum Initial Leverage: 1x (10,000 bps)
- Maximum Initial Leverage: 10x (100,000 bps)
- Maximum Leverage (Liquidation): 15x (150,000 bps)

### Fees
- Open Position: 0.1% (10 bps)
- Close Position: 0.1% (10 bps)
- Liquidation: 0.5% (50 bps)
- Protocol Share: 20% (2,000 bps)

### Utilization
- Maximum Utilization: 80%

## 🔐 Security Considerations

### Encryption
- Position data is encrypted using x25519 key exchange
- Rescue cipher for symmetric encryption
- Fresh nonce for each operation

### MPC Security
- 2-of-N threshold for computation
- No single party can access plaintext
- Computation results verified on-chain

### Smart Contract Security
- All PDAs use proper seed derivation
- Authority checks on all admin functions
- Reentrancy protection via Anchor

## 📖 Usage Example

```typescript
// Open an encrypted long position
const side = BigInt(1); // Long
const sizeUsd = BigInt(1000_000_000); // $1000
const collateral = BigInt(100_000_000); // $100 (10x leverage)
const entryPrice = BigInt(100_000_000); // $100

// Encrypt position parameters
const nonce = randomBytes(16);
const encryptedSide = cipher.encrypt([side], nonce)[0];
const encryptedSize = cipher.encrypt([sizeUsd], nonce)[0];
// ... encrypt other params

// Open position (encrypted data goes to MPC)
await program.methods
  .openPosition(
    computationOffset,
    Array.from(encryptedSide),
    Array.from(encryptedSize),
    Array.from(encryptedCollateral),
    Array.from(encryptedEntryPrice),
    Array.from(publicKey),
    new BN(nonce),
    new BN(100_000_000) // Collateral for token transfer
  )
  .accounts({ /* ... */ })
  .rpc();

// Wait for MPC computation
await awaitComputationFinalization(provider, computationOffset, programId);

// Position is now active with encrypted state!
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ using [Arcium](https://arcium.com) and [Anchor](https://anchor-lang.com)
