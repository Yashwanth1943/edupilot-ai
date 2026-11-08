/* global Buffer */
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { MAX_IMPORT_FILE_BYTES, parseWorkbook, selectWorkbookSheets } from "../dist/services/csv-import.js";

function workbookBuffer(bookType, sheets) { const workbook = XLSX.utils.book_new(); for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name); return XLSX.write(workbook, { type: "buffer", bookType, cellDates: true }); }

test("XLSX parsing returns one worksheet with dates, percentages and formula cached values", () => { const worksheet = XLSX.utils.aoa_to_sheet([["studentId", "progressPercent", "effectiveDate", "notes"], ["STU001", { t: "n", v: 0.75, z: "0%" }, new Date("2026-01-15"), { t: "n", v: 90, f: "SUM(40,50)" }]], { cellDates: true }); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Progress"); const parsed = parseWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true }), "progress.xlsx"); assert.equal(parsed.fileType, "xlsx"); assert.deepEqual(parsed.worksheets.map((sheet) => sheet.name), ["Progress"]); assert.equal(parsed.worksheets[0].rows[0][1], "75"); assert.match(parsed.worksheets[0].rows[0][2], /2026-01-15/); assert.equal(parsed.worksheets[0].rows[0][3], "90"); });

test("XLS parsing and multi-worksheet selection preserve names", () => { const parsed = parseWorkbook(workbookBuffer("xls", [["First", [["studentId"], ["STU001"]]], ["Second", [["studentId"], ["STU002"]]]]), "progress.xls"); assert.equal(parsed.fileType, "xls"); assert.deepEqual(parsed.worksheets.map((sheet) => sheet.name), ["First", "Second"]); assert.deepEqual(selectWorkbookSheets(parsed, ["Second"]).map((sheet) => sheet.name), ["Second"]); });

test("empty worksheets and malformed or oversized files fail safely", () => { const parsed = parseWorkbook(workbookBuffer("xlsx", [["Empty", []]]), "empty.xlsx"); assert.deepEqual(parsed.worksheets[0].headers, []); assert.deepEqual(parsed.worksheets[0].rows, []); assert.throws(() => parseWorkbook(Buffer.from("not an xlsx"), "bad.xlsx")); assert.throws(() => parseWorkbook(Buffer.alloc(MAX_IMPORT_FILE_BYTES + 1), "large.xlsx")); });

test("workbook headers are preserved even when a sheet has missing header cells", () => { const parsed = parseWorkbook(workbookBuffer("xlsx", [["MissingHeaders", [["", ""], ["value", "75"]]]]), "missing-headers.xlsx"); assert.deepEqual(parsed.worksheets[0].headers, ["", ""]); assert.deepEqual(parsed.worksheets[0].rows[0], ["value", "75"]); });
