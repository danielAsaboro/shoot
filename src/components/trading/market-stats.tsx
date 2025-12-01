'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUpIcon, TrendingDownIcon, ActivityIcon, DollarSignIcon } from 'lucide-react'

interface MarketStatsProps {
    price: number
    change24h: number
    volume24h: number
    openInterest: number
}

export function MarketStats({ price, change24h, volume24h, openInterest }: MarketStatsProps) {
    const isPositive = change24h >= 0

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl">SOL-PERP Market</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Current Price */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSignIcon className="h-4 w-4" />
                            <span>Mark Price</span>
                        </div>
                        <div className="text-2xl font-bold font-mono">
                            ${price.toFixed(2)}
                        </div>
                    </div>

                    {/* 24h Change */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {isPositive ? (
                                <TrendingUpIcon className="h-4 w-4" />
                            ) : (
                                <TrendingDownIcon className="h-4 w-4" />
                            )}
                            <span>24h Change</span>
                        </div>
                        <div className={`text-2xl font-bold font-mono ${isPositive ? 'text-emerald-500' : 'text-red-500'
                            }`}>
                            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
                        </div>
                    </div>

                    {/* 24h Volume */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ActivityIcon className="h-4 w-4" />
                            <span>24h Volume</span>
                        </div>
                        <div className="text-2xl font-bold font-mono">
                            ${(volume24h / 1000000).toFixed(2)}M
                        </div>
                    </div>

                    {/* Open Interest */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSignIcon className="h-4 w-4" />
                            <span>Open Interest</span>
                        </div>
                        <div className="text-2xl font-bold font-mono">
                            ${(openInterest / 1000000).toFixed(2)}M
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
