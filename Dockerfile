# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts
RUN npx prisma generate

# ── Stage 2: Build SDK ────────────────────────────────────────────────────────
FROM node:20-alpine AS sdk-builder
WORKDIR /app/sdk

COPY sdk/package.json sdk/package-lock.json ./
RUN npm ci
COPY sdk/src ./src
COPY sdk/tsconfig.json ./
RUN npx tsc

# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma client was generated in deps stage
COPY --from=deps /app/lib/generated ./lib/generated

# SDK was built in sdk-builder stage
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── Stage 4: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/data ./data
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib/generated ./lib/generated

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
