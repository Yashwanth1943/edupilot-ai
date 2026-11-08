import { getProgressHistory, recordProgress } from "@/services/progress";
import { listStudents } from "@/services/students";
import { listSubjects } from "@/services/subjects";
import { apiClient } from "@/services/api-client";
import type { ColumnMapping, ImportBatch, ImportValidationIssue, ImportValidationRow, ParsedWorkbook, ParsedWorksheet } from "@/types/dashboard";

const backendBatch = (raw: Record<string, unknown>): ImportBatch => ({
  id: String(raw._id ?? raw.batchId ?? ""),
  fileName: String(raw.fileName ?? ""),
  uploadedAt: String(raw.createdAt ?? raw.uploadedAt ?? new Date().toISOString()),
  totalRows: Number(raw.totalRows ?? 0),
  successfulImports: Number(raw.successfulImports ?? raw.importedRows ?? 0),
  skippedRecords: Number(raw.skippedRecords ?? 0),
  unchangedRecords: Number(raw.unchangedRecords ?? 0),
  rejectedRecords: Number(raw.rejectedRecords ?? 0),
  status: (raw.status === "Preview" ? "Completed" : String(raw.status ?? "Failed")) as ImportBatch["status"],
  errors: []
});

export async function apiPreviewImport(file: File, mapping: ColumnMapping, worksheets?: string[]) {
  const result = await apiClient.imports.preview(file, mapping as Record<string, string>, worksheets);
  return {
    batch: backendBatch(result.batch as unknown as Record<string, unknown>),
    worksheets: result.worksheets as Array<{ name: string; headers: string[]; rowCount: number; sampleRows?: string[][] }>,
    rows: result.rows as ImportValidationRow[],
    summary: (result as unknown as { summary?: import("@/types/dashboard").ImportSummary }).summary
  };
}

export async function apiRevalidateImport(batchId: string, rows: ImportValidationRow[]) {
  const result = await apiClient.imports.revalidate(batchId, rows);
  return {
    batch: backendBatch(result.batch as unknown as Record<string, unknown>),
    rows: result.rows as ImportValidationRow[],
    summary: (result as unknown as { summary?: import("@/types/dashboard").ImportSummary }).summary
  };
}

export async function apiConfirmImport(batchId: string, rows?: ImportValidationRow[]) {
  const res = (await apiClient.imports.execute(batchId, rows)) as unknown as {
    batch?: Record<string, unknown>;
    data?: Record<string, unknown>;
    summary?: Record<string, unknown>;
  };
  const rawBatch = (res.batch || res.data || res) as Record<string, unknown>;
  return {
    batch: backendBatch(rawBatch),
    summary: (res.summary || (rawBatch as { summary?: Record<string, unknown> }).summary) as
      | Record<string, unknown>
      | undefined
  };
}

export async function apiListImportHistory() {
  const result = await apiClient.imports.history();
  return result.items.map((item) => backendBatch(item as unknown as Record<string, unknown>));
}

let importHistoryStore: ImportBatch[] = [];

const headerAliases: Record<string, string[]> = {
  studentId: ["student id", "studentid", "id", "learner id", "roll number", "roll no", "roll_no", "admission no", "admission number", "reg no", "registration number"],
  studentName: ["student name", "name", "full name", "learner name", "student"],
  subject: ["subject", "subject name", "subject id", "course", "course name", "course id", "topic"],
  progressPercent: ["progress", "progress %", "progress percentage", "completion", "completion %", "completion rate", "score", "percentage", "percent"],
  effectiveDate: ["effective date", "date", "progress date", "recorded date", "record date", "snapshot date", "timestamp"],
  mentorNotes: ["mentor notes", "notes", "comment", "comments", "feedback", "remark", "remarks"],
};

export function isWideFormatHeaders(headers: string[]): boolean {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const hasDedicatedSubjectCol = normalized.some((h) => ["subject", "subject name", "subject id", "course", "course name"].includes(h));
  if (hasDedicatedSubjectCol) return false;
  const commonWideSubjects = ["html", "css", "python", "javascript", "sql", "math", "physics", "java", "dsa", "distributed systems"];
  return normalized.some((h) => commonWideSubjects.includes(h));
}

export function parseCsvText(text: string): ParsedWorksheet {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const parseLine = (line: string) => { const cells: string[] = []; let cell = ""; let quoted = false; for (let index = 0; index < line.length; index += 1) { const character = line[index]; if (character === '"') { if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; } else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; } else cell += character; } cells.push(cell.trim()); return cells; };
  const [headers = [], ...rows] = lines.map(parseLine);
  return { name: "CSV worksheet", headers, rows };
}

export async function analyzeImportFile(file: File): Promise<ParsedWorkbook> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return { fileName: file.name, fileSize: file.size, fileType: "csv", worksheets: [parseCsvText(await file.text())], parserStatus: "ready" };
  const fileType = extension === "xls" ? "xls" : "xlsx";
  return { fileName: file.name, fileSize: file.size, fileType, worksheets: [], parserStatus: "unsupported", parserMessage: "Excel workbook parsing is not connected yet. Use CSV for deterministic preview, or add a SheetJS/Pandas adapter in a future phase." };
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const [key, aliases] of Object.entries(headerAliases)) {
    const match = headers.find((header) => {
      const clean = header.toLowerCase().trim();
      return clean === key.toLowerCase() || aliases.includes(clean);
    });
    if (match) mapping[key as keyof ColumnMapping] = match;
  }
  return mapping;
}

const getValue = (row: string[], headers: string[], mapped?: string) => mapped ? row[headers.indexOf(mapped)]?.trim() ?? "" : "";
function issue(code: string, message: string, severity: "warning" | "error" | "info" = "error"): ImportValidationIssue { return { code, message, severity }; }

export function validateWorksheet(worksheet: ParsedWorksheet, mapping: ColumnMapping): ImportValidationRow[] {
  const students = listStudents(); const subjects = listSubjects(); const seen = new Set<string>();
  return worksheet.rows.map((row, index) => {
    const values = { studentId: getValue(row, worksheet.headers, mapping.studentId), studentName: getValue(row, worksheet.headers, mapping.studentName), subject: getValue(row, worksheet.headers, mapping.subject), progressPercent: getValue(row, worksheet.headers, mapping.progressPercent), effectiveDate: getValue(row, worksheet.headers, mapping.effectiveDate), mentorNotes: getValue(row, worksheet.headers, mapping.mentorNotes) };
    const rawProgress = (values.progressPercent ?? "").trim();
    const isBlank = rawProgress === "";
    if (isBlank) {
      return {
        rowNumber: index + 2,
        values,
        classification: "Skipped",
        action: "Skip",
        changeType: "No update",
        previousProgress: null,
        difference: null,
        issues: [issue("NO_UPDATE", "No progress value supplied in this cell; existing data preserved.", "info")],
        isDateDefaulted: false
      };
    }
    const issues: ImportValidationIssue[] = []; const empty = row.every((value) => !value.trim()); if (empty) issues.push(issue("EMPTY_ROW", "The row is empty."));
    if (!values.studentId && !values.studentName) issues.push(issue("MISSING_STUDENT", "Student ID or student name is required."));
    const student = students.find((item) => item.studentId.toLowerCase() === values.studentId.toLowerCase() || (!!values.studentName && item.fullName.toLowerCase() === values.studentName.toLowerCase()));
    if ((values.studentId || values.studentName) && !student) issues.push(issue("UNKNOWN_STUDENT", "No matching EduPilot student was found."));
    const subject = subjects.find((item) => item.id.toLowerCase() === values.subject.toLowerCase() || item.name.toLowerCase() === values.subject.toLowerCase());
    if (!values.subject) issues.push(issue("MISSING_SUBJECT", "Subject name or subject ID is required.")); else if (!subject) issues.push(issue("UNKNOWN_SUBJECT", "No matching EduPilot subject was found."));
    const progress = Number(values.progressPercent); if (!values.progressPercent || !Number.isFinite(progress) || progress < 0 || progress > 100) issues.push(issue("INVALID_PROGRESS", "Progress must be a number from 0 to 100."));
    let isDateDefaulted = false;
    if (!values.effectiveDate) {
      values.effectiveDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
      isDateDefaulted = true;
      issues.push(issue("DATE_DEFAULTED", `Effective date was missing; defaulted to today (${values.effectiveDate}).`, "info"));
    } else if (Number.isNaN(Date.parse(values.effectiveDate))) {
      issues.push(issue("INVALID_DATE", "Effective date must be a valid date."));
    }
    if (student && subject && !student.subjectIds.includes(subject.id)) issues.push(issue("UNASSIGNED_SUBJECT", "The subject is not assigned to this student."));
    const key = `${student?.id ?? values.studentId}|${subject?.id ?? values.subject}|${values.effectiveDate}`; if (seen.has(key)) issues.push(issue("DUPLICATE_FILE_ROW", "This student-subject-date combination is duplicated in the file.")); seen.add(key);
    const existing = student && subject ? (requireProgressRecords(student.id, subject.id).some((record) => record.effectiveDate === values.effectiveDate && record.entryType === "update")) : false;
    if (existing) issues.push(issue("DUPLICATE_EXISTING", "A progress record already exists for this student, subject, and date.", "warning"));
    if (student && !values.studentId && values.studentName) issues.push(issue("NAME_MATCH", "Student matched by name; review before importing.", "warning"));
    return { rowNumber: index + 2, values, classification: issues.some((item) => item.severity === "error") ? "Invalid" : issues.length ? "Warning" : "Valid", issues, resolvedStudentId: student?.id, resolvedSubjectId: subject?.id, isDateDefaulted };
  });
}

function requireProgressRecords(studentId: string, subjectId: string) { return getProgressHistory(studentId, subjectId); }

export function executeImport(fileName: string, rows: ImportValidationRow[]): ImportBatch {
  let successfulImports = 0; const errors: ImportValidationRow[] = [];
  rows.forEach((row) => { if (row.classification === "Invalid" || row.issues.some((item) => item.code === "DUPLICATE_EXISTING")) { errors.push(row); return; } try { recordProgress({ studentId: row.resolvedStudentId!, subjectId: row.resolvedSubjectId!, progressPercent: Number(row.values.progressPercent), effectiveDate: row.values.effectiveDate, updatedBy: "Excel import", mentorNotes: row.values.mentorNotes || `Imported from ${fileName}` }); successfulImports += 1; } catch { errors.push({ ...row, classification: "Invalid", issues: [...row.issues, issue("IMPORT_FAILED", "The progress record could not be imported.")] }); } });
  const rejectedRecords = errors.filter((row) => row.classification === "Invalid").length; const skippedRecords = errors.length - rejectedRecords; const batch: ImportBatch = { id: `IMP-${Date.now()}`, fileName, uploadedAt: new Date().toISOString(), totalRows: rows.length, successfulImports, skippedRecords, rejectedRecords, status: rejectedRecords > 0 ? successfulImports > 0 ? "Partially completed" : "Failed" : "Completed", errors };
  importHistoryStore = [batch, ...importHistoryStore]; return batch;
}

export function listImportHistory(): ImportBatch[] { return [...importHistoryStore]; }
