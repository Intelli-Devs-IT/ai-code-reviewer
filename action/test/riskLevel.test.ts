import assert from "node:assert/strict";
import test from "node:test";

import {
  determineRiskLevel,
  getHighestRiskLevel,
} from "../src/helpers/riskLevel";

test("accepted security finding can produce high risk", () => {
  const risk = determineRiskLevel(
    [15],
    [
      "ISSUE:\nMissing authorization check lets users access admin data.\n\nIMPACT:\nThis can expose private records.",
    ],
    { securitySensitive: true }
  );

  assert.equal(risk, "high");
});

test("security indicators do not force high risk outside security-sensitive accepted findings", () => {
  const risk = determineRiskLevel(
    [15],
    ["ISSUE:\nMissing authorization check may expose admin data."]
  );

  assert.equal(risk, "low");
});

test("existing confidence-based medium risk behavior is preserved", () => {
  const risk = determineRiskLevel([60], ["ISSUE:\nUnhandled async error."]);

  assert.equal(risk, "medium");
});

test("no accepted findings remain low risk", () => {
  assert.equal(determineRiskLevel([], []), "low");
});

test("highest risk helper preserves high-risk merge blocking signal", () => {
  assert.equal(getHighestRiskLevel("low", "high", "medium"), "high");
});
