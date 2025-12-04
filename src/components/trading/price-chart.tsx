'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Area,
    Bar,
    ComposedChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts'
import { format } from 'date-fns'

interface PriceChartProps {
    currentPrice: number
}

// Mock data generator for OHLCV
const generateData = (points: number, startPrice: number, intervalMinutes: number) => {
    let currentPrice = startPrice
    const data = []
    const now = new Date()

    for (let i = points; i >= 0; i--) {
        const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)
        const volatility = startPrice * 0.02 // 2% volatility
        const change = (Math.random() - 0.5) * volatility

        const open = currentPrice
        const close = currentPrice + change
        const high = Math.max(open, close) + Math.random() * volatility * 0.5
        const low = Math.min(open, close) - Math.random() * volatility * 0.5
        const volume = Math.floor(Math.random() * 10000) + 1000

        data.push({
            time: time.toISOString(),
            open,
            high,
            low,
            close,
            volume,
            value: close // For AreaChart
        })

        currentPrice = close
    }
    return data
}

type TimeRange = '1H' | '1D' | '1W' | '1M' | '1Y'

export function PriceChart({ currentPrice }: PriceChartProps) {
    const [timeRange, setTimeRange] = useState<TimeRange>('1D')
    const [hoveredData, setHoveredData] = useState<any>(null)

    const chartData = useMemo(() => {
        switch (timeRange) {
            case '1H': return generateData(60, currentPrice, 1) // 1 min interval
            case '1D': return generateData(96, currentPrice, 15) // 15 min interval
            case '1W': return generateData(84, currentPrice, 120) // 2 hour interval
            case '1M': return generateData(90, currentPrice, 480) // 8 hour interval
            case '1Y': return generateData(100, currentPrice, 1440 * 3.65) // ~3.5 day interval
            default: return generateData(96, currentPrice, 15)
        }
    }, [timeRange, currentPrice])

    const formatXAxis = (tickItem: string) => {
        const date = new Date(tickItem)
        switch (timeRange) {
            case '1H': return format(date, 'HH:mm')
            case '1D': return format(date, 'HH:mm')
            case '1W': return format(date, 'MMM dd')
            case '1M': return format(date, 'MMM dd')
            case '1Y': return format(date, 'MMM yyyy')
            default: return format(date, 'HH:mm')
        }
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload
            return (
                <div className="rounded-lg border border-border bg-background/95 p-3 shadow-xl backdrop-blur-sm">
                    <div className="mb-2 text-sm font-medium text-muted-foreground">
                        {format(new Date(label), 'MMM dd, yyyy HH:mm')}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Open:</span>
                        <span className="font-mono font-medium text-foreground">
                            ${data.open.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">High:</span>
                        <span className="font-mono font-medium text-foreground">
                            ${data.high.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">Low:</span>
                        <span className="font-mono font-medium text-foreground">
                            ${data.low.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">Close:</span>
                        <span className="font-mono font-medium text-foreground">
                            ${data.close.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">Vol:</span>
                        <span className="font-mono font-medium text-foreground">
                            {data.volume.toLocaleString()}
                        </span>
                    </div>
                </div>
            )
        }
        return null
    }

    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const latestData = chartData[chartData.length - 1]
    const displayData = hoveredData || latestData

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="space-y-1">
                    <CardTitle className="text-lg font-medium">Price Chart</CardTitle>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold">
                            ${displayData.close.toFixed(2)}
                        </span>
                        <span className={`text-sm font-medium ${displayData.close >= displayData.open
                            ? 'text-green-500'
                            : 'text-red-500'
                            }`}>
                            {displayData.close >= displayData.open ? '+' : ''}
                            {((displayData.close - displayData.open) / displayData.open * 100).toFixed(2)}%
                        </span>
                    </div>
                </div>
                <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                    <TabsList className="grid w-[240px] grid-cols-5">
                        <TabsTrigger value="1H">1H</TabsTrigger>
                        <TabsTrigger value="1D">1D</TabsTrigger>
                        <TabsTrigger value="1W">1W</TabsTrigger>
                        <TabsTrigger value="1M">1M</TabsTrigger>
                        <TabsTrigger value="1Y">1Y</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                {!mounted ? (
                    <div className="h-[400px] w-full animate-pulse bg-muted/10 rounded-lg" />
                ) : (
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer>
                            <ComposedChart
                                data={chartData}
                                onMouseMove={(e: any) => {
                                    if (e.activePayload) {
                                        setHoveredData(e.activePayload[0].payload)
                                    }
                                }}
                                onMouseLeave={() => setHoveredData(null)}
                            >
                                <defs>
                                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" vertical={false} />
                                <XAxis
                                    dataKey="time"
                                    tickFormatter={formatXAxis}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                    minTickGap={30}
                                />
                                <YAxis
                                    domain={['auto', 'auto']}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                    tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                                />
                                <YAxis
                                    yAxisId="volume"
                                    orientation="right"
                                    domain={['0', 'dataMax * 4']}
                                    hide
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar
                                    dataKey="volume"
                                    yAxisId="volume"
                                    fill="var(--muted-foreground)"
                                    opacity={0.15}
                                    barSize={4}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="close"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorPrice)"
                                    animationDuration={1000}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
