/* global Buffer */
import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, safeErrorRow } from "../dist/services/csv-import.js";

test("CSV parser handles quoted commas, escaped quotes and multiline values", () => {
  const result = parseCsv(Buffer.from('studentId,notes\nSTU001,"Strong, steady progress"\nSTU002,"He said ""keep going"""\nSTU003,"Line one\nLine two"\n'));
  assert.deepEqual(result.headers, ["studentId", "notes"]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0][1], "Strong, steady progress");
  assert.equal(result.rows[1][1], 'He said "keep going"');
  assert.equal(result.rows[2][1], "Line one\nLine two");
});

test("error report cells are safe from spreadsheet formula injection", () => {
  const result = safeErrorRow({ rowNumber: 2, values: { studentId: "=HYPERLINK(\"https://bad.example\")", mentorNotes: "@cmd" }, classification: "Invalid", issues: [] });
  assert.equal(result.studentId, "'=HYPERLINK(\"https://bad.example\")");
  assert.equal(result.mentorNotes, "'@cmd");
});
