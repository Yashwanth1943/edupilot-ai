import assert from "node:assert/strict";
import test from "node:test";
import { calculateStatus, calculateSummary, snapshotAtOrBefore } from "../dist/services/progress.js";

const record = (progressPercent, effectiveDate) => ({ progressPercent, effectiveDate: new Date(effectiveDate) });

test("progress summaries calculate percentage-point changes", () => {
  const summary = calculateSummary([record(55, "2026-01-01"), record(75, "2026-01-10")]);
  assert.equal(summary.currentProgress, 75);
  assert.equal(summary.previousProgress, 55);
  assert.equal(summary.changeInPoints, 20);
  assert.equal(summary.status, "Improving");
  assert.equal(summary.updateCount, 2);
});

test("progress statuses distinguish unchanged, decreased and no update", () => {
  assert.equal(calculateStatus(0), "Unchanged");
  assert.equal(calculateStatus(-5), "Decreased");
  assert.equal(calculateStatus(undefined), "No update");
  assert.equal(calculateSummary([]).status, "No update");
});

test("date snapshots select the latest valid record on or before a date", () => {
  const records = [record(40, "2026-01-01"), record(48, "2026-01-10"), record(62, "2026-02-01")];
  assert.equal(snapshotAtOrBefore(records, new Date("2026-01-20")).progressPercent, 48);
  assert.equal(snapshotAtOrBefore(records, new Date("2025-12-31")), undefined);
});
