'use client'

import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { createArciumClient, ArciumClient } from './arcium-client'

/**
 * Hook to access the Arcium client for encryption/decryption
 */
export function useArciumClient(programId?: PublicKey | string): ArciumClient | null {
    const { connection } = useConnection()

    return useMemo(() => {
        if (!programId) return null

        try {
            return createArciumClient(connection, programId)
        } catch (error) {
            console.error('Failed to create Arcium client:', error)
            return null
        }
    }, [connection, programId])
}
