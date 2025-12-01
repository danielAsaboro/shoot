'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LockIcon,
  ShieldIcon,
  ZapIcon,
  EyeOffIcon,
  TrendingUpIcon,
  ArrowRightIcon
} from 'lucide-react'

const features = [
  {
    icon: LockIcon,
    title: 'Encrypted Positions',
    description: 'All position details encrypted using Arcium MPC technology',
  },
  {
    icon: ShieldIcon,
    title: 'MEV Protection',
    description: 'Prevent front-running and targeted liquidations',
  },
  {
    icon: EyeOffIcon,
    title: 'Private Trading',
    description: 'Keep your strategies hidden from copy-traders',
  },
  {
    icon: ZapIcon,
    title: 'Up to 15x Leverage',
    description: 'Maximize your capital efficiency with high leverage',
  },
]

const stats = [
  { label: 'Max Leverage', value: '15x' },
  { label: 'Opening Fee', value: '0.1%' },
  { label: 'Liquidation Fee', value: '0.5%' },
  { label: 'Utilization Cap', value: '80%' },
]

export function DashboardFeature() {
  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Badge variant="success" className="text-sm px-3 py-1">
            🔒 Powered by Arcium MPC
          </Badge>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            Encrypted
          </span>
          <br />
          Perpetual Futures
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
          Trade perpetual contracts with complete privacy. Your positions, strategies, and PnL remain encrypted and hidden from MEV bots and copy-traders.
        </p>

        <div className="flex items-center justify-center gap-4 pt-4">
          <Link href="/trade">
            <Button size="lg" className="h-12 px-8 text-base font-semibold">
              Start Trading
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link href="https://docs.arcium.com" target="_blank">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
              Learn More
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {stats.map((stat, index) => (
          <Card key={index} className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold font-mono mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why Choose Encrypted Perps?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the next generation of perpetual trading with privacy-first technology
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground">
            Three simple steps to private perpetual trading
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Connect Wallet',
              description: 'Connect your Solana wallet to get started',
            },
            {
              step: '02',
              title: 'Open Position',
              description: 'Choose your side, leverage, and collateral amount',
            },
            {
              step: '03',
              title: 'Trade Privately',
              description: 'Your position is encrypted and protected from MEV',
            },
          ].map((item, index) => (
            <div key={index} className="relative">
              <div className="text-6xl font-bold text-primary/10 mb-4">{item.step}</div>
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-4xl mx-auto">
        <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <TrendingUpIcon className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-4">
              Ready to Trade with Privacy?
            </h2>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Join the future of encrypted perpetual trading on Solana. Protect your strategies and maximize your profits.
            </p>
            <Link href="/trade">
              <Button size="lg" className="h-12 px-8 text-base font-semibold">
                Launch App
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
