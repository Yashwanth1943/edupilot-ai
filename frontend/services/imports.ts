import { getProgressHistory, recordProgress } from "@/services/progress";
import { listStudents } from "@/services/students";
import { listSubjects } from "@/services/subjects";
import { apiClient } from "@/services/api-client";
import type { ColumnMapping, ImportBatch, ImportValidationIssue, ImportValidationRow, ParsedWorkbook, ParsedWorksheet } from "@/types/dashboard";

const backendBatch = (raw: Record<string, unknown>): ImportBatch => ({ id: String(raw._id ?? raw.batchId ?? ""), fileName: String(raw.fileName ?? ""), uploadedAt: String(raw.createdAt ?? raw.uploadedAt ?? new Date().toISOString()), totalRows: Number(raw.totalRows ?? 0), successfulImports: Number(raw.successfulImports ?? raw.importedRows ?? 0), skippedRecords: Number(raw.skippedRecords ?? 0), rejectedRecords: Number(raw.rejectedRecords ?? 0), status: (raw.status === "Preview" ? "Completed" : String(raw.status ?? "Failed")) as ImportBatch["status"], errors: [] });
export async function apiPreviewImport(file: File, mapping: ColumnMapping, worksheets?: string[]) { const result = await apiClient.imports.preview(file, mapping as Record<string, string>, worksheets); return { batch: backendBatch(result.batch as unknown as Record<string, unknown>), worksheets: result.worksheets as Array<{ name: string; headers: string[]; rowCount: number }>, rows: result.rows as ImportValidationRow[] }; }
export async function apiConfirmImport(batchId: string) { return backendBatch(await apiClient.imports.execute(batchId) as unknown as Record<string, unknown>); }
export async function apiListImportHistory() { const result = await apiClient.imports.history(); return result.items.map((item) => backendBatch(item as unknown as Record<string, unknown>)); }

let importHistoryStore: ImportBatch[] = [];

const headerAliases: Record<keyof ColumnMapping, string[]> = {
  studentId: ["student id", "studentid", "id", "learner id"],
  studentName: ["student name", "name", "full name", "learner name"],
  subject: ["subject", "subject name", "subject id", "course"],
  progressPercent: ["progress", "progress %", "progress percentage", "completion", "completion %"],
  effectiveDate: ["effective date", "date", "progress date", "recorded date"],
  mentorNotes: ["mentor notes", "notes", "comment", "comments"],
};

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
  (Object.keys(headerAliases) as (keyof ColumnMapping)[]).forEach((key) => { const match = headers.find((header) => headerAliases[key].includes(header.toLowerCase().trim())); if (match) mapping[key] = match; });
  return mapping;
}

const getValue = (row: string[], headers: string[], mapped?: string) => mapped ? row[headers.indexOf(mapped)]?.trim() ?? "" : "";
function issue(code: string, message: string, severity: "warning" | "error" = "error"): ImportValidationIssue { return { code, message, severity }; }

export function validateWorksheet(worksheet: ParsedWorksheet, mapping: ColumnMapping): ImportValidationRow[] {
  const students = listStudents(); const subjects = listSubjects(); const seen = new Set<string>();
  return worksheet.rows.map((row, index) => {
    const values = { studentId: getValue(row, worksheet.headers, mapping.studentId), studentName: getValue(row, worksheet.headers, mapping.studentName), subject: getValue(row, worksheet.headers, mapping.subject), progressPercent: getValue(row, worksheet.headers, mapping.progressPercent), effectiveDate: getValue(row, worksheet.headers, mapping.effectiveDate), mentorNotes: getValue(row, worksheet.headers, mapping.mentorNotes) };
    const issues: ImportValidationIssue[] = []; const empty = row.every((value) => !value.trim()); if (empty) issues.push(issue("EMPTY_ROW", "The row is empty."));
    if (!values.studentId && !values.studentName) issues.push(issue("MISSING_STUDENT", "Student ID or student name is required."));
    const student = students.find((item) => item.studentId.toLowerCase() === values.studentId.toLowerCase() || (!!values.studentName && item.fullName.toLowerCase() === values.studentName.toLowerCase()));
    if ((values.studentId || values.studentName) && !student) issues.push(issue("UNKNOWN_STUDENT", "No matching EduPilot student was found."));
    const subject = subjects.find((item) => item.id.toLowerCase() === values.subject.toLowerCase() || item.name.toLowerCase() === values.subject.toLowerCase());
    if (!values.subject) issues.push(issue("MISSING_SUBJECT", "Subject name or subject ID is required.")); else if (!subject) issues.push(issue("UNKNOWN_SUBJECT", "No matching EduPilot subject was found."));
    const progress = Number(values.progressPercent); if (!values.progressPercent || !Number.isFinite(progress) || progress < 0 || progress > 100) issues.push(issue("INVALID_PROGRESS", "Progress must be a number from 0 to 100."));
    if (!values.effectiveDate || Number.isNaN(Date.parse(values.effectiveDate))) issues.push(issue("INVALID_DATE", "Effective date must be a valid date."));
    if (student && subject && !student.subjectIds.includes(subject.id)) issues.push(issue("UNASSIGNED_SUBJECT", "The subject is not assigned to this student."));
    const key = `${student?.id ?? values.studentId}|${subject?.id ?? values.subject}|${values.effectiveDate}`; if (seen.has(key)) issues.push(issue("DUPLICATE_FILE_ROW", "This student-subject-date combination is duplicated in the file.")); seen.add(key);
    const existing = student && subject ? (requireProgressRecords(student.id, subject.id).some((record) => record.effectiveDate === values.effectiveDate && record.entryType === "update")) : false;
    if (existing) issues.push(issue("DUPLICATE_EXISTING", "A progress record already exists for this student, subject, and date.", "warning"));
    if (student && !values.studentId && values.studentName) issues.push(issue("NAME_MATCH", "Student matched by name; review before importing.", "warning"));
    return { rowNumber: index + 2, values, classification: issues.some((item) => item.severity === "error") ? "Invalid" : issues.length ? "Warning" : "Valid", issues, resolvedStudentId: student?.id, resolvedSubjectId: subject?.id };
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
