import test from "node:test";
import assert from "node:assert/strict";
import { filterRecords, recordsToCsv, buildFallback, displayValue } from "../featurePack.mjs";

const rows = [
  { id: 1, reference: "A-1", status: "Open", risk: "High", amount: 0, payload: { evidenceState: "Incomplete" } },
  { id: 2, reference: "B-2", status: "Closed", risk: "Low", amount: 250, payload: { evidenceState: "Complete" } },
];
const insights = ["Summary A", "Variance B", "Evidence C"];

test("filterRecords searches and filters, preserving 0-amount rows", () => {
  assert.equal(filterRecords(rows, { q: "a-1" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].reference, "B-2");
  assert.equal(filterRecords(rows, { risk: "High" })[0].amount, 0);
  assert.equal(filterRecords(rows, {}).length, 2);
});
test("recordsToCsv preserves false/0 and escapes commas", () => {
  const csv = recordsToCsv([{ name: "x,y", flag: false, n: 0 }]);
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.includes("false"));
  assert.ok(csv.includes(",0"));
  assert.equal(displayValue(false), "false");
  assert.equal(displayValue(0), "0");
  assert.equal(displayValue(""), "— (empty)");
});
test("buildFallback is deterministic, offline-labelled aiGenerated:false over own records", () => {
  const out = buildFallback({ title: "Feature" }, rows, insights[1], insights, "Review required.");
  assert.equal(out.aiGenerated, false);
  assert.equal(out.provider, "deterministic-fallback");
  assert.equal(out.recordCount, 2);
  assert.ok(out.sections.length >= 2);
  assert.ok(out.metrics.some((m) => m.value === "0" || m.value === "2"));
});
