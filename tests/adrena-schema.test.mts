import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

import {
  adrenaSnapshotSchema,
  getAdrenaSnapshotExample,
} from "../lib/competition/adrena-schema.ts";
import { normalizeAdrenaSnapshotPayload } from "../lib/competition/adrena-contract.ts";

test("schema id matches the runtime contract version", () => {
  assert.equal(adrenaSnapshotSchema.$id, "adrena-competition-snapshot-v1");
});

test("schema example normalizes successfully", async () => {
  const example = await getAdrenaSnapshotExample();
  const normalized = normalizeAdrenaSnapshotPayload(example);

  assert.ok(normalized.cohorts.length > 0);
  assert.ok("enrolledCohortId" in normalized.viewer);
});
