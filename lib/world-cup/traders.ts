/**
 * World Cup trader data is stored in the database (worldcup_traders table).
 * Use lib/world-cup/data.ts loadWorldCupTraders() to fetch trader records.
 *
 * This file is kept for backward compatibility with any imports that
 * reference trader-related types — the actual data lives in PostgreSQL
 * and is seeded via prisma/seed/index.ts.
 */

export type { TraderRecord, TraderMetrics } from "./types.ts";
