# Project: Adrena Shoot

## Database
- Use `prisma db push` directly — no migrations needed. We are in dev mode.
- Database: PostgreSQL via Postgres.app at `/Applications/Postgres.app/Contents/Versions/18/bin/`
- Local DB: `postgresql://cartel@localhost:5432/shoot?schema=public`
- Seed: `npx tsx prisma/seed/index.ts`

## Provider
- Competition provider is always `adrena` (live). No mock mode.

## Deployment
- No Vercel cron jobs. All cron endpoints are POST requests triggered externally.
- Deployment target is Railway (Docker). `vercel.json` exists for preview deploys only.

## Code Quality
- No mocks, placeholders, or stubs. All code must be real, functional implementation.
- `npm run build` and Docker deploy must succeed before committing and pushing.
