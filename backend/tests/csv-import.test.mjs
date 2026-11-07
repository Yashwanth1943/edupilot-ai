import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../dist/services/csv-import.js";

test("CSV adapter preserves quoted commas and row order", () => {
  const result = parseCsv("studentId,subjectId,progressPercent\nSTU001,SUB001,40\nSTU002,\"SUB,002\",75");

  assert.deepEqual(result.headers, ["studentId", "subjectId", "progressPercent"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1][1], "SUB,002");
  assert.equal(result.rows[1].length, 3);
});
