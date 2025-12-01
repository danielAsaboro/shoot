'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TradingForm, type TradeParams } from './trading-form'
import { MarketStats } from './market-stats'
import { PositionsTable, type Position } from './positions-table'
import { PriceChart } from './price-chart'
import { toast } from 'sonner'
import { useArciumClient } from '@/lib/use-arcium-client'
import {
    useOpenPosition,
    useClosePosition,
    useUserPositions,
    useShootProgram
} from '@/lib/shoot-data-access'

// TODO: Get these from environment or config
const SHOOT_PROGRAM_ID = process.env.NEXT_PUBLIC_SHOOT_PROGRAM_ID || 'Bv3Fb9VjzjWGfX18QTUcVycAfeLoQ5zZN6vv2g3cTZxp'
const DEFAULT_POOL = process.env.NEXT_PUBLIC_DEFAULT_POOL || '11111111111111111111111111111111'
const DEFAULT_CUSTODY = process.env.NEXT_PUBLIC_DEFAULT_CUSTODY || '11111111111111111111111111111111'
const DEFAULT_PRICE_UPDATE = process.env.NEXT_PUBLIC_DEFAULT_PRICE_UPDATE || '11111111111111111111111111111111'

export function TradingDashboard() {
    const { publicKey, connected } = useWallet()
    const shootProgram = useShootProgram()

    // Initialize Arcium client
    const arciumClient = useArciumClient(SHOOT_PROGRAM_ID)

    // Fetch user positions from blockchain
    const { data: onChainPositions = [], isLoading: loadingPositions } = useUserPositions()

    // Mutations for opening/closing positions
    const openPositionMutation = useOpenPosition(arciumClient)
    const closePositionMutation = useClosePosition(arciumClient)

    // Market data state
    const [marketPrice, setMarketPrice] = useState(142.50)
    const [positions, setPositions] = useState<Position[]>([])
    const [isInitialized, setIsInitialized] = useState(false)

    // Initialize Arcium client on mount
    useEffect(() => {
        if (arciumClient && !isInitialized) {
            arciumClient.getMXEPublicKey()
                .then(() => {
                    setIsInitialized(true)
                    console.log('✅ Arcium client initialized')
                })
                .catch((error) => {
                    console.error('❌ Failed to initialize Arcium:', error)
                    toast.error('Encryption not available', {
                        description: 'Could not connect to Arcium MPC network'
                    })
                })
        }
    }, [arciumClient, isInitialized])

    // Simulate price updates (in production, use real oracle data)
    useEffect(() => {
        const interval = setInterval(() => {
            setMarketPrice((prev) => {
                const change = (Math.random() - 0.5) * 0.5
                return Math.max(100, prev + change)
            })
        }, 2000)

        return () => clearInterval(interval)
    }, [])

    // Update position PnL based on current price
    useEffect(() => {
        setPositions((prev) =>
            prev.map((pos) => {
                const priceDiff = marketPrice - pos.entryPrice
                const pnl = pos.side === 'long'
                    ? (priceDiff / pos.entryPrice) * pos.size
                    : -(priceDiff / pos.entryPrice) * pos.size
                const pnlPercent = (pnl / pos.collateral) * 100

                return {
                    ...pos,
                    currentPrice: marketPrice,
                    pnl,
                    pnlPercent,
                }
            })
        )
    }, [marketPrice])

    // Handle opening a new position with Arcium encryption
    const handleOpenPosition = async (params: TradeParams) => {
        if (!connected || !publicKey) {
            toast.error('Wallet not connected', {
                description: 'Please connect your wallet to trade'
            })
            return
        }

        if (!arciumClient || !isInitialized) {
            toast.error('Encryption not ready', {
                description: 'Arcium client is still initializing'
            })
            return
        }

        try {
            // Show loading toast
            const loadingToast = toast.loading('Encrypting position...', {
                description: 'Using Arcium MPC to encrypt your trade parameters'
            })

            // Execute the encrypted position opening
            const result = await openPositionMutation.mutateAsync({
                side: params.side,
                sizeUsd: params.size,
                collateral: params.collateral,
                entryPrice: marketPrice,
                poolAddress: new PublicKey(DEFAULT_POOL),
                custodyAddress: new PublicKey(DEFAULT_CUSTODY),
                priceUpdateAddress: new PublicKey(DEFAULT_PRICE_UPDATE)
            })

            // Dismiss loading toast
            toast.dismiss(loadingToast)

            // Create local position for immediate UI feedback
            const liquidationPrice = params.side === 'long'
                ? marketPrice * (1 - 1 / params.leverage)
                : marketPrice * (1 + 1 / params.leverage)

            const newPosition: Position = {
                id: result.computationOffset || `pos-${Date.now()}`,
                side: params.side,
                size: params.size,
                collateral: params.collateral,
                leverage: params.leverage,
                entryPrice: marketPrice,
                currentPrice: marketPrice,
                liquidationPrice,
                pnl: 0,
                pnlPercent: 0,
                isEncrypted: true,
                timestamp: Date.now(),
            }

            setPositions((prev) => [...prev, newPosition])

            toast.success('🔒 Position Opened Privately', {
                description: `${params.side.toUpperCase()} position encrypted with Arcium MPC`
            })
        } catch (error: any) {
            console.error('Failed to open position:', error)
            toast.error('Failed to open position', {
                description: error.message || 'Transaction failed'
            })
        }
    }

    // Handle closing a position with Arcium computation
    const handleClosePosition = async (positionId: string) => {
        const position = positions.find((p) => p.id === positionId)
        if (!position) return

        if (!arciumClient || !isInitialized) {
            toast.error('Encryption not ready')
            return
        }

        try {
            const loadingToast = toast.loading('Closing position...', {
                description: 'Computing final PnL with Arcium MPC'
            })

            // TODO: Get actual position PDA from positionId
            const positionAddress = new PublicKey(DEFAULT_POOL) // Placeholder

            await closePositionMutation.mutateAsync({
                positionAddress,
                exitPrice: marketPrice
            })

            toast.dismiss(loadingToast)

            setPositions((prev) => prev.filter((p) => p.id !== positionId))

            toast.success('Position Closed', {
                description: `Realized PnL: ${position.pnl >= 0 ? '+' : ''}$${position.pnl.toFixed(2)}`
            })
        } catch (error: any) {
            console.error('Failed to close position:', error)
            toast.error('Failed to close position', {
                description: error.message || 'Transaction failed'
            })
        }
    }

    // Handle viewing position details (decrypt for owner)
    const handleViewDetails = async (positionId: string) => {
        const position = positions.find((p) => p.id === positionId)
        if (!position) return

        toast.info('🔐 Position Details', {
            description: `Side: ${position.side.toUpperCase()} | Size: $${position.size.toFixed(2)} | Leverage: ${position.leverage}x`,
            duration: 5000
        })
    }

    const totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0)
    const totalCollateral = positions.reduce((sum, pos) => sum + pos.collateral, 0)

    // Show connection prompt if not connected
    if (!connected) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <div className="text-6xl">🔒</div>
                    <h3 className="text-2xl font-bold">Connect Your Wallet</h3>
                    <p className="text-muted-foreground max-w-md">
                        Connect your wallet to start trading with encrypted positions using Arcium MPC
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Arcium Status Indicator */}
            {isInitialized && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Arcium MPC Encryption Active</span>
                </div>
            )}

            {/* Market Stats */}
            <MarketStats
                price={marketPrice}
                change24h={3.45}
                volume24h={125000000}
                openInterest={45000000}
            />

            {/* Main Trading Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart */}
                <div className="lg:col-span-2">
                    <PriceChart currentPrice={marketPrice} />
                </div>

                {/* Trading Form */}
                <div>
                    <TradingForm
                        marketPrice={marketPrice}
                        onSubmit={handleOpenPosition}
                        disabled={!isInitialized || openPositionMutation.isPending}
                    />
                </div>
            </div>

            {/* Portfolio Summary */}
            {positions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-6 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
                        <div className="text-sm text-muted-foreground mb-1">Total Collateral</div>
                        <div className="text-2xl font-bold font-mono">${totalCollateral.toFixed(2)}</div>
                    </div>
                    <div className="p-6 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
                        <div className="text-sm text-muted-foreground mb-1">Unrealized PnL</div>
                        <div className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                        </div>
                    </div>
                    <div className="p-6 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
                        <div className="text-sm text-muted-foreground mb-1">Active Positions</div>
                        <div className="text-2xl font-bold font-mono">{positions.length}</div>
                    </div>
                </div>
            )}

            {/* Positions Table */}
            <PositionsTable
                positions={positions}
                onClose={handleClosePosition}
                onViewDetails={handleViewDetails}
                loading={closePositionMutation.isPending}
            />
        </div>
    )
}
