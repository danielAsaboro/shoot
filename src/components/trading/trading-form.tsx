'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { ArrowUpIcon, ArrowDownIcon, LockIcon } from 'lucide-react'

interface TradingFormProps {
    marketPrice: number
    onSubmit: (params: TradeParams) => void
    disabled?: boolean
}

export interface TradeParams {
    side: 'long' | 'short'
    collateral: number
    leverage: number
    size: number
}

export function TradingForm({ marketPrice, onSubmit, disabled = false }: TradingFormProps) {
    const [side, setSide] = useState<'long' | 'short'>('long')
    const [collateral, setCollateral] = useState<string>('')
    const [leverage, setLeverage] = useState<number[]>([5])

    const collateralNum = parseFloat(collateral) || 0
    const leverageNum = leverage[0]
    const positionSize = collateralNum * leverageNum
    const liquidationPrice = side === 'long'
        ? marketPrice * (1 - 1 / leverageNum)
        : marketPrice * (1 + 1 / leverageNum)

    const handleSubmit = () => {
        if (collateralNum > 0) {
            onSubmit({
                side,
                collateral: collateralNum,
                leverage: leverageNum,
                size: positionSize,
            })
        }
    }

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <LockIcon className="h-5 w-5 text-primary" />
                            Open Encrypted Position
                        </CardTitle>
                        <CardDescription>
                            Your position details will be encrypted using Arcium MPC
                        </CardDescription>
                    </div>
                    <Badge variant="success" className="text-xs">
                        🔒 Encrypted
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Side Selection */}
                <Tabs value={side} onValueChange={(v) => setSide(v as 'long' | 'short')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger
                            value="long"
                            className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-500"
                        >
                            <ArrowUpIcon className="h-4 w-4 mr-2" />
                            Long
                        </TabsTrigger>
                        <TabsTrigger
                            value="short"
                            className="data-[state=active]:bg-red-500/10 data-[state=active]:text-red-500"
                        >
                            <ArrowDownIcon className="h-4 w-4 mr-2" />
                            Short
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Collateral Input */}
                <div className="space-y-2">
                    <Label htmlFor="collateral">Collateral (USDC)</Label>
                    <Input
                        id="collateral"
                        type="number"
                        placeholder="0.00"
                        value={collateral}
                        onChange={(e) => setCollateral(e.target.value)}
                        className="text-lg"
                    />
                </div>

                {/* Leverage Slider */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label>Leverage</Label>
                        <Badge variant="outline" className="font-mono">
                            {leverageNum}x
                        </Badge>
                    </div>
                    <Slider
                        value={leverage}
                        onValueChange={setLeverage}
                        min={1}
                        max={15}
                        step={1}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1x</span>
                        <span>15x</span>
                    </div>
                </div>

                {/* Position Summary */}
                <div className="space-y-2 p-4 rounded-lg bg-muted/50 border border-border/50">
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Position Size</span>
                        <span className="font-mono font-semibold">
                            ${positionSize.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entry Price</span>
                        <span className="font-mono">${marketPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Liquidation Price</span>
                        <span className={`font-mono ${side === 'long' ? 'text-red-500' : 'text-emerald-500'}`}>
                            ${liquidationPrice.toFixed(2)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                        <span className="text-muted-foreground">Opening Fee (0.1%)</span>
                        <span className="font-mono">${(positionSize * 0.001).toFixed(2)}</span>
                    </div>
                </div>

                {/* Submit Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={disabled || collateralNum === 0}
                    className={`w-full h-12 text-base font-semibold ${side === 'long'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}
                >
                    {side === 'long' ? 'Open Long Position' : 'Open Short Position'}
                </Button>
            </CardContent>
        </Card>
    )
}
