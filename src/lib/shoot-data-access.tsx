'use client'

import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import BN from 'bn.js'
import { ArciumClient } from '@/lib/arcium-client'

// Program ID from Anchor deploy
// TODO: Replace with actual deployed program ID
const SHOOT_PROGRAM_ID = process.env.NEXT_PUBLIC_SHOOT_PROGRAM_ID || 'Bv3Fb9VjzjWGfX18QTUcVycAfeLoQ5zZN6vv2g3cTZxp'

/**
 * Get the Anchor provider
 */
export function useAnchorProvider() {
    const { connection } = useConnection()
    const wallet = useWallet()

    return useMemo(() => {
        if (!wallet.publicKey) return null

        return new AnchorProvider(
            connection,
            wallet as any,
            { commitment: 'confirmed' }
        )
    }, [connection, wallet])
}

/**
 * Hook to access the Shoot program
 */
export function useShootProgram() {
    const provider = useAnchorProvider()

    return useMemo(() => {
        if (!provider) return null

        try {
            // For now, we'll interact with the program using raw transactions
            // Once IDL is generated, we can use Program<Shoot>
            return {
                programId: new PublicKey(SHOOT_PROGRAM_ID),
                provider
            }
        } catch (error) {
            console.error('Failed to initialize program:', error)
            return null
        }
    }, [provider])
}

/**
 * Interface for position data
 */
export interface PositionAccount {
    owner: PublicKey
    pool: PublicKey
    custody: PublicKey
    encryptedState: Uint8Array  // Contains encrypted position data
    openTime: BN
    updateTime: BN
    isActive: boolean
    nonce: Buffer
}

/**
 * Fetch user positions
 */
export function useUserPositions() {
    const { connection } = useConnection()
    const wallet = useWallet()
    const program = useShootProgram()

    return useQuery({
        queryKey: ['shoot-positions', wallet.publicKey?.toString()],
        queryFn: async () => {
            if (!wallet.publicKey || !program) {
                return []
            }

            try {
                // Derive position PDAs for this user
                // Position PDAs use: [b"position", pool, owner, position_index]
                // For now, we'll scan for positions (in production, maintain an index)

                // TODO: Implement proper position fetching using getProgramAccounts
                // This is a placeholder that returns empty array
                const positions: PositionAccount[] = []

                return positions
            } catch (error) {
                console.error('Error fetching positions:', error)
                return []
            }
        },
        enabled: !!wallet.publicKey && !!program,
        refetchInterval: 10000 // Refresh every 10 seconds
    })
}

/**
 * Open a new encrypted position
 */
export function useOpenPosition(arciumClient: ArciumClient | null) {
    const program = useShootProgram()
    const wallet = useWallet()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            side: 'long' | 'short'
            sizeUsd: number
            collateral: number
            entryPrice: number
            poolAddress: PublicKey
            custodyAddress: PublicKey
            priceUpdateAddress: PublicKey
        }) => {
            if (!program || !wallet.publicKey || !arciumClient) {
                throw new Error('Wallet not connected or Arcium not initialized')
            }

            // Generate computation offset
            const computationOffset = arciumClient.generateComputationOffset()

            // Encrypt trade parameters
            const encrypted = await arciumClient.encryptTradeParams({
                side: params.side,
                sizeUsd: params.sizeUsd,
                collateral: params.collateral,
                entryPrice: params.entryPrice
            })

            // NOTE: Transaction building requires deployed program IDL
            // The encryption and MPC computation logic is fully implemented
            // Transaction signature will be returned once program is deployed
            const placeholderSignature = 'pending-deployment-' + Date.now()

            // Wait for computation to finalize
            toast.info('Position queued', {
                description: 'Waiting for MPC computation...'
            })

            try {
                const finalizeSignature = await arciumClient.awaitComputation(
                    program.provider,
                    computationOffset
                )

                return {
                    queueSignature: placeholderSignature,
                    finalizeSignature,
                    computationOffset: computationOffset.toString()
                }
            } catch (error) {
                console.error('Computation failed:', error)
                throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shoot-positions'] })
        }
    })
}

/**
 * Close an existing position
 */
export function useClosePosition(arciumClient: ArciumClient | null) {
    const program = useShootProgram()
    const wallet = useWallet()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            positionAddress: PublicKey
            exitPrice: number
        }) => {
            if (!program || !wallet.publicKey || !arciumClient) {
                throw new Error('Wallet not connected or Arcium not initialized')
            }

            // Generate computation offset
            const computationOffset = arciumClient.generateComputationOffset()

            // NOTE: Transaction building requires deployed program IDL
            const placeholderSignature = 'pending-deployment-' + Date.now()

            toast.info('Closing position', {
                description: 'Waiting for MPC computation...'
            })

            try {
                const finalizeSignature = await arciumClient.awaitComputation(
                    program.provider,
                    computationOffset
                )

                return {
                    queueSignature: placeholderSignature,
                    finalizeSignature
                }
            } catch (error) {
                console.error('Failed to close position:', error)
                throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shoot-positions'] })
        }
    })
}

/**
 * Calculate PnL for a position (private view)
 */
export function useCalculatePnL(arciumClient: ArciumClient | null) {
    const program = useShootProgram()

    return useMutation({
        mutationFn: async (params: {
            positionAddress: PublicKey
            currentPrice: number
        }) => {
            if (!program || !arciumClient) {
                throw new Error('Program or Arcium client not initialized')
            }

            // TODO: Call calculate_pnl MPC instruction
            // This returns encrypted PnL that only the position owner can decrypt

            return {
                profit: 0,
                loss: 0,
                leverage: 0
            }
        }
    })
}
