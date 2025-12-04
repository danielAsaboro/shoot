'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LockIcon, EyeIcon, XIcon } from 'lucide-react'

export interface Position {
    id: string
    side: 'long' | 'short'
    size: number
    collateral: number
    leverage: number
    entryPrice: number
    currentPrice: number
    liquidationPrice: number
    pnl: number
    pnlPercent: number
    isEncrypted: boolean
    timestamp: number
}

interface PositionsTableProps {
    positions: Position[]
    onClose: (positionId: string) => void
    onViewDetails: (positionId: string) => void
    loading?: boolean
}

export function PositionsTable({ positions, onClose, onViewDetails }: PositionsTableProps) {
    if (positions.length === 0) {
        return (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Your Positions</CardTitle>
                    <CardDescription>No open positions</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                        <LockIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                        Open your first encrypted position to get started
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Your Positions</CardTitle>
                        <CardDescription>
                            {positions.length} active position{positions.length !== 1 ? 's' : ''}
                        </CardDescription>
                    </div>
                    <Badge variant="success" className="text-xs">
                        🔒 All Encrypted
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border border-border/50 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Side</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Leverage</TableHead>
                                <TableHead>Entry</TableHead>
                                <TableHead>Current</TableHead>
                                <TableHead>Liq. Price</TableHead>
                                <TableHead className="text-right">PnL</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {positions.map((position) => (
                                <TableRow key={position.id} className="hover:bg-muted/30">
                                    <TableCell>
                                        <Badge
                                            variant={position.side === 'long' ? 'success' : 'destructive'}
                                            className="font-semibold"
                                        >
                                            {position.side.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        ${position.size.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono">
                                            {position.leverage}x
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        ${position.entryPrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="font-mono">
                                        ${position.currentPrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className={`font-mono ${position.side === 'long' ? 'text-red-500' : 'text-emerald-500'
                                        }`}>
                                        ${position.liquidationPrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`font-mono font-semibold ${position.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                                                }`}>
                                                {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                                            </span>
                                            <span className={`text-xs font-mono ${position.pnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'
                                                }`}>
                                                {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onViewDetails(position.id)}
                                            >
                                                <EyeIcon className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => onClose(position.id)}
                                            >
                                                <XIcon className="h-4 w-4 mr-1" />
                                                Close
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
