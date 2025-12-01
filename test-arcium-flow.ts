/**
 * Example: Testing Arcium Encryption/Decryption
 * 
 * This demonstrates the encryption flow without requiring
 * a deployed Solana program.
 */

import { Connection, Keypair } from '@solana/web3.js'
import { ArciumClient } from './src/lib/arcium-client'

async function demonstrateEncryption() {
    console.log('🔐 Arcium Encryption Demo\n')

    // Setup connection (replace with actual cluster)
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed')

    // For demo purposes, using a mock program ID
    // Replace with actual Shoot program ID when deployed
    const programId = Keypair.generate().publicKey

    console.log('1. Initializing Arcium client...')
    const arciumClient = new ArciumClient(connection, programId)

    // Mock MXE public key (in production, this comes from on-chain account)
    // For testing, we'll skip the actual MXE key fetch
    console.log('   ✅ Client initialized\n')

    // Trade parameters to encrypt
    const tradeParams = {
        side: 'long' as const,
        sizeUsd: 1000,      // $1000 position
        collateral: 100,    // $100 collateral (10x leverage)
        entryPrice: 142.50  // Entry at $142.50
    }

    console.log('2. Trade parameters (plaintext):')
    console.log('   Side:', tradeParams.side)
    console.log('   Position Size:', `$${tradeParams.sizeUsd}`)
    console.log('   Collateral:', `$${tradeParams.collateral}`)
    console.log('   Entry Price:', `$${tradeParams.entryPrice}`)
    console.log('   Effective Leverage:', `${tradeParams.sizeUsd / tradeParams.collateral}x\n`)

    try {
        console.log('3. Encrypting trade parameters...')
        // This will fail without actual MXE public key on-chain
        // but demonstrates the flow
        const encrypted = await arciumClient.encryptTradeParams(tradeParams)

        console.log('   ✅ Encryption successful!')
        console.log('   Encrypted side:', encrypted.side.slice(0, 8), '... (32 bytes)')
        console.log('   Encrypted size:', encrypted.sizeUsd.slice(0, 8), '... (32 bytes)')
        console.log('   Encrypted collateral:', encrypted.collateral.slice(0, 8), '... (32 bytes)')
        console.log('   Encrypted entry price:', encrypted.entryPrice.slice(0, 8), '... (32 bytes)')
        console.log('   Public key:', encrypted.publicKey.slice(0, 8), '... (32 bytes)')
        console.log('   Nonce:', encrypted.nonce.toString('hex'), '(16 bytes)\n')

        // Generate computation offset for tracking
        console.log('4. Generating computation offset...')
        const computationOffset = arciumClient.generateComputationOffset()
        console.log('   Offset:', computationOffset.toString())

        const computationAddress = arciumClient.getComputationAddress(computationOffset)
        console.log('   Computation PDA:', computationAddress.toBase58(), '\n')

        console.log('5. Next steps in real flow:')
        console.log('   → Submit transaction to Shoot program')
        console.log('   → Program queues MPC computation')
        console.log('   → Wait for computation finalization')
        console.log('   → Position created with encrypted state')
        console.log('\n✅ Demo complete!')

    } catch (error) {
        console.error('\n❌ Expected error (no MXE on-chain):', error)
        console.log('\n💡 This is expected without a deployed Shoot program.')
        console.log('   The encryption flow is ready to use once the program is deployed.')
    }
}

// How to use in a real application
console.log(`
═══════════════════════════════════════════════════════════════
Real Usage Example
═══════════════════════════════════════════════════════════════

import { useArciumClient } from '@/lib/use-arcium-client'
import { useOpenPosition } from '@/lib/shoot-data-access'

function TradingComponent() {
    const arciumClient = useArciumClient(PROGRAM_ID)
    const openPosition = useOpenPosition(arciumClient)
    
    const handleTrade = async () => {
        await openPosition.mutateAsync({
            side: 'long',
            sizeUsd: 1000,
            collateral: 100,
            entryPrice: 142.50,
            poolAddress: POOL_PDA,
            custodyAddress: CUSTODY_PDA
        })
    }
    
    return <button onClick={handleTrade}>Open Position</button>
}

═══════════════════════════════════════════════════════════════
`)

// Run the demo
demonstrateEncryption().catch(console.error)
