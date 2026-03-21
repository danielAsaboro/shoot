import assert from "node:assert/strict";
import test from "node:test";

import {
  toAbuseFlagCode,
  type AbuseFlagCode,
  type AbuseFlagDetail,
} from "../lib/shared/types.ts";
import type { AbuseFlag } from "../lib/competition/types.ts";

test("toAbuseFlagCode converts detail to code string", () => {
  const detail: AbuseFlagDetail = {
    code: "sybil_suspicion",
    label: "Sybil suspicion",
    severity: "high",
    reason: "Multiple linked wallets detected",
  };

  const code = toAbuseFlagCode(detail);
  assert.equal(code, "sybil_suspicion");
  assert.equal(typeof code, "string");
});

test("AbuseFlagCode values are compatible with AbuseFlag type", () => {
  const code: AbuseFlagCode = "wash_trading_suspicion";
  const flag: AbuseFlag = code;
  assert.equal(flag, "wash_trading_suspicion");
});

test("AbuseFlagDetail severity levels are valid", () => {
  const validSeverities = ["low", "medium", "high"];
  const detail: AbuseFlagDetail = {
    code: "min-volume",
    label: "Below min volume",
    severity: "low",
    reason: "Volume too low",
  };

  assert.ok(validSeverities.includes(detail.severity));
});
