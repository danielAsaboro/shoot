/**
 * World Cup desk data is stored in the database (desks table).
 * Use lib/world-cup/data.ts loadDesks() to fetch desk definitions.
 *
 * This file is kept for backward compatibility with any imports that
 * reference desk-related types — the actual data lives in PostgreSQL
 * and is seeded via prisma/seed/index.ts.
 */

export type { DeskDefinition, TransferMove } from "./types.ts";
