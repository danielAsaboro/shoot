import assert from "node:assert/strict";
import test from "node:test";

import {
  getCompetitionIntegrationStatus,
  getCompetitionSnapshotResponse,
} from "../lib/competition/provider.ts";

test("default integration status is adrena live", () => {
  const integration = getCompetitionIntegrationStatus();

  assert.equal(integration.provider, "adrena");
  assert.equal(integration.configured, true);
});
