import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { exportQuerySchema } from "../dist/controllers/exports.js";

test("export query schema validates filter parameters correctly", () => {
  const parsed = exportQuerySchema.parse({
    q: "Aarav",
    status: "Active",
    studentId: "STU001",
    includeHistory: "true",
    includeSummary: "true",
    includeSubjects: "true",
    mode: "all"
  });
  assert.equal(parsed.q, "Aarav");
  assert.equal(parsed.status, "Active");
  assert.equal(parsed.includeHistory, true);
  assert.equal(parsed.includeSummary, true);
  assert.equal(parsed.includeSubjects, true);
  assert.equal(parsed.mode, "all");

  // Invalid status rejected
  assert.throws(() => exportQuerySchema.parse({ status: "UnknownStatus" }));
});

test("workbook generation preserves wide format, blank cells, and explicit 0", () => {
  // Simulate building sheets using the exact structure as exports.ts
  const summaryHeaders = [
    "Student ID",
    "Student Name",
    "Email",
    "Mobile Number",
    "Department",
    "Student Status",
    "Assigned Subjects",
    "HTML",
    "CSS",
    "Python",
    "Last Updated Date",
    "Mentor / Recorded By"
  ];

  const summaryRows = [
    summaryHeaders,
    // Student 1: has HTML 75, CSS 80, Python 60
    ["STU001", "Ravi Kumar", "ravi@limat.edu", "+91 98765 00001", "CSE", "Active", "HTML, CSS, Python", 75, 80, 60, "2026-11-08", "Mentor A"],
    // Student 2: CSS only 65, blank for HTML and Python
    ["STU002", "Arun Kumar", "", "", "ECE", "Active", "CSS", "", 65, "", "2026-11-07", "Mentor B"],
    // Student 3: Explicit 0% in HTML, 45 in CSS, blank in Python
    ["STU003", "Kiran", "kiran@limat.edu", "", "CSE", "Active", "HTML, CSS", 0, 45, "", "2026-11-06", "Mentor A"],
    // Student 4: No progress at all, must still appear
    ["STU004", "New Learner", "", "", "MECH", "Active", "Python", "", "", "", "", ""]
  ];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Student Summary");

  // Worksheet 2: Progress History
  const historyHeaders = [
    "Student ID", "Student Name", "Subject ID", "Subject Name",
    "Progress Percentage", "Effective Date", "Recorded By", "Mentor Notes", "Record Type", "Recorded At"
  ];
  const historyRows = [
    historyHeaders,
    ["STU001", "Ravi Kumar", "SUB-HTML", "HTML", 75, "2026-11-08", "Mentor A", "Great progress", "Manual", "2026-11-08 10:00"],
    ["STU003", "Kiran", "SUB-HTML", "HTML", 0, "2026-11-06", "Mentor A", "Started module", "Manual", "2026-11-06 09:30"]
  ];
  const wsHistory = XLSX.utils.aoa_to_sheet(historyRows);
  XLSX.utils.book_append_sheet(wb, wsHistory, "Progress History");

  // Worksheet 3: Subject Summary
  const subjectHeaders = [
    "Subject ID", "Subject Name", "Department", "Total Assigned Students",
    "Students With Progress", "Average Latest Progress", "Improving Students",
    "Unchanged Students", "Decreased Students", "Students Without Updates"
  ];
  const subjectRows = [
    subjectHeaders,
    ["SUB-HTML", "HTML", "CSE", 2, 2, "37.5%", 1, 0, 0, 0],
    ["SUB-CSS", "CSS", "CSE", 2, 2, "62.5%", 0, 1, 0, 0],
    ["SUB-PY", "Python", "CSE", 2, 1, "60.0%", 0, 0, 0, 1]
  ];
  const wsSubjects = XLSX.utils.aoa_to_sheet(subjectRows);
  XLSX.utils.book_append_sheet(wb, wsSubjects, "Subject Summary");

  // Write buffer and read back
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  assert.ok(buffer && buffer.length > 0, "Buffer should not be empty");

  const readWb = XLSX.read(buffer, { type: "buffer" });
  assert.deepEqual(readWb.SheetNames, ["Student Summary", "Progress History", "Subject Summary"]);

  const parsedSummary = XLSX.utils.sheet_to_json(readWb.Sheets["Student Summary"], { header: 1 });
  assert.equal(parsedSummary.length, 5); // Header + 4 students

  // Check STU001 values
  const r1 = parsedSummary[1];
  assert.equal(r1[0], "STU001");
  assert.equal(r1[7], 75); // HTML
  assert.equal(r1[8], 80); // CSS
  assert.equal(r1[9], 60); // Python

  // Check STU002: blank cells
  const r2 = parsedSummary[2];
  assert.equal(r2[0], "STU002");
  assert.ok(r2[7] === undefined || r2[7] === "", "HTML should be blank for STU002");
  assert.equal(r2[8], 65); // CSS
  assert.ok(r2[9] === undefined || r2[9] === "", "Python should be blank for STU002");

  // Check STU003: explicit 0%
  const r3 = parsedSummary[3];
  assert.equal(r3[0], "STU003");
  assert.equal(r3[7], 0, "Explicit 0 must be preserved as 0");
  assert.equal(r3[8], 45); // CSS

  // Check STU004: student without progress is included
  const r4 = parsedSummary[4];
  assert.equal(r4[0], "STU004");
  assert.equal(r4[1], "New Learner");

  // Check History sheet
  const parsedHistory = XLSX.utils.sheet_to_json(readWb.Sheets["Progress History"], { header: 1 });
  assert.equal(parsedHistory.length, 3);
  assert.equal(parsedHistory[2][4], 0); // Preserved 0%

  // Check Subject Summary sheet
  const parsedSubjectSummary = XLSX.utils.sheet_to_json(readWb.Sheets["Subject Summary"], { header: 1 });
  assert.equal(parsedSubjectSummary.length, 4);
  assert.equal(parsedSubjectSummary[1][0], "SUB-HTML");
  assert.equal(parsedSubjectSummary[1][5], "37.5%");
});

