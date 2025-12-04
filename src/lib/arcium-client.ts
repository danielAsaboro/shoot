/**
 * Arcium Client for Private Perpetuals
 * 
 * Handles encryption/decryption of trade parameters and position data
 * using Arcium MPC (Multi-Party Computation)
 */

import { AnchorProvider } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import {
    RescueCipher,
    x25519,
    awaitComputationFinalization,
    getComputationAccAddress
} from '@arcium-hq/client'
import { randomBytes } from 'crypto'
import BN from 'bn.js'

export interface EncryptedTradeParams {
    side: Uint8Array       // [u8; 32] encrypted side (0=short, 1=long)
    sizeUsd: Uint8Array    // [u8; 32] encrypted position size in USD
    collateral: Uint8Array // [u8; 32] encrypted collateral amount
    entryPrice: Uint8Array // [u8; 32] encrypted entry price
    publicKey: Uint8Array  // [u8; 32] public key for decryption
    nonce: Buffer          // 16-byte nonce
}

export interface DecryptedPosition {
    side: bigint           // 0=short, 1=long
    sizeUsd: bigint       // Position size in USD
    collateral: bigint    // Collateral amount
    entryPrice: bigint    // Entry price
    leverage: bigint      // Effective leverage
}

export class ArciumClient {
    private connection: Connection
    private programId: PublicKey
    private mxePublicKey: Uint8Array | null = null
    private privateKey: Uint8Array
    private publicKey: Uint8Array

    constructor(connection: Connection, programId: PublicKey) {
        this.connection = connection
        this.programId = programId

        // Generate ephemeral keypair for encryption
        this.privateKey = x25519.utils.randomSecretKey()
        this.publicKey = x25519.getPublicKey(this.privateKey)
    }

    /**
     * Fetch the MXE public key for encryption
     * This key is used for x25519 key exchange with the MPC cluster
     */
    async getMXEPublicKey(): Promise<Uint8Array> {
        if (this.mxePublicKey) {
            return this.mxePublicKey
        }

        try {
            // Derive MXE config PDA
            const [mxeConfigPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('mxe_config')],
                this.programId
            )

            const accountInfo = await this.connection.getAccountInfo(mxeConfigPda)
            if (!accountInfo) {
                throw new Error('MXE config account not found')
            }

            // Extract public key from account data
            // Format: 8 bytes discriminator + 32 bytes public key
            this.mxePublicKey = new Uint8Array(accountInfo.data.slice(8, 40))
            return this.mxePublicKey
        } catch (error) {
            console.error('Failed to fetch MXE public key:', error)
            throw new Error('Could not initialize Arcium encryption')
        }
    }

    /**
     * Encrypt trade parameters for private position opening
     */
    async encryptTradeParams(params: {
        side: 'long' | 'short'
        sizeUsd: number
        collateral: number
        entryPrice: number
    }): Promise<EncryptedTradeParams> {
        const mxePublicKey = await this.getMXEPublicKey()

        // Generate shared secret using x25519 ECDH
        const sharedSecret = x25519.getSharedSecret(this.privateKey, mxePublicKey)
        const cipher = new RescueCipher(sharedSecret)

        // Generate random nonce for this encryption
        const nonce = randomBytes(16)

        // Convert parameters to BigInt for MPC circuits
        const sideBigInt = BigInt(params.side === 'long' ? 1 : 0)
        const sizeUsdBigInt = BigInt(Math.floor(params.sizeUsd * 1_000_000)) // 6 decimals
        const collateralBigInt = BigInt(Math.floor(params.collateral * 1_000_000)) // 6 decimals
        const entryPriceBigInt = BigInt(Math.floor(params.entryPrice * 1_000_000)) // 6 decimals

        // Encrypt each parameter
        const encryptedSide = new Uint8Array(cipher.encrypt([sideBigInt], nonce)[0])
        const encryptedSize = new Uint8Array(cipher.encrypt([sizeUsdBigInt], nonce)[0])
        const encryptedCollateral = new Uint8Array(cipher.encrypt([collateralBigInt], nonce)[0])
        const encryptedEntryPrice = new Uint8Array(cipher.encrypt([entryPriceBigInt], nonce)[0])

        return {
            side: encryptedSide,
            sizeUsd: encryptedSize,
            collateral: encryptedCollateral,
            entryPrice: encryptedEntryPrice,
            publicKey: this.publicKey,
            nonce
        }
    }

    /**
     * Decrypt position data (only works if you're the position owner)
     */
    async decryptPosition(
        encryptedData: {
            side: Uint8Array
            sizeUsd: Uint8Array
            collateral: Uint8Array
            entryPrice: Uint8Array
            leverage: Uint8Array
        },
        nonce: Buffer
    ): Promise<DecryptedPosition> {
        const mxePublicKey = await this.getMXEPublicKey()
        const sharedSecret = x25519.getSharedSecret(this.privateKey, mxePublicKey)
        const cipher = new RescueCipher(sharedSecret)

        // Decrypt each field (convert Uint8Array to number[] for cipher.decrypt)
        const [side] = cipher.decrypt([Array.from(encryptedData.side)], nonce)
        const [sizeUsd] = cipher.decrypt([Array.from(encryptedData.sizeUsd)], nonce)
        const [collateral] = cipher.decrypt([Array.from(encryptedData.collateral)], nonce)
        const [entryPrice] = cipher.decrypt([Array.from(encryptedData.entryPrice)], nonce)
        const [leverage] = cipher.decrypt([Array.from(encryptedData.leverage)], nonce)

        return {
            side,
            sizeUsd,
            collateral,
            entryPrice,
            leverage
        }
    }

    /**
     * Wait for an MPC computation to complete
     */
    async awaitComputation(
        provider: AnchorProvider,
        computationOffset: BN,
        commitment: 'confirmed' | 'finalized' = 'confirmed'
    ): Promise<string> {
        return await awaitComputationFinalization(
            provider,
            computationOffset,
            this.programId,
            commitment
        )
    }

    /**
     * Generate a random computation offset for tracking
     */
    generateComputationOffset(): BN {
        return new BN(randomBytes(8), 'hex')
    }

    /**
     * Get the computation account address for a given offset
     */
    getComputationAddress(offset: BN): PublicKey {
        return getComputationAccAddress(this.programId, offset)
    }

    /**
     * Listen for computation callbacks
     */
    async onComputationCallback(
        computationOffset: BN,
        callback: (success: boolean, signature: string) => void
    ): Promise<() => void> {
        const computationAddress = this.getComputationAddress(computationOffset)

        // Subscribe to account changes
        const subscriptionId = this.connection.onAccountChange(
            computationAddress,
            (accountInfo, context) => {
                // Account exists means computation completed
                if (accountInfo) {
                    callback(true, context.slot.toString())
                }
            },
            'confirmed'
        )

        // Return cleanup function
        return () => {
            this.connection.removeAccountChangeListener(subscriptionId)
        }
    }
}

/**
 * Create an Arcium client instance
 */
export function createArciumClient(
    connection: Connection,
    programId: PublicKey | string
): ArciumClient {
    const pubkey = typeof programId === 'string'
        ? new PublicKey(programId)
        : programId

    return new ArciumClient(connection, pubkey)
}
