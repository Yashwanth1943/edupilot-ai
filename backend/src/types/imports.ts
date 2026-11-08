export type StudentImportStatus =
  | "Existing Student"
  | "New Student – Will Create"
  | "Ambiguous Student"
  | "Missing Identity"
  | "Identity Conflict";

export type ProgressImportStatus =
  | "Will Import"
  | "No Update"
  | "Unchanged"
  | "Invalid"
  | "Duplicate";

export interface ImportValidationIssue {
  code: string;
  message: string;
  severity: "warning" | "error" | "info";
}

export interface ParsedWorksheet {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount?: number;
  sampleRows?: string[][];
}

export interface ParsedWorkbook {
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  worksheets: ParsedWorksheet[];
}

export interface ImportValidationRow {
  worksheetName?: string;
  rowNumber: number;
  values: Record<string, string>;
  classification: "Valid" | "Warning" | "Invalid" | "Skipped";
  studentStatus?: StudentImportStatus;
  progressStatus?: ProgressImportStatus;
  issues: ImportValidationIssue[];
  resolvedStudentId?: string;
  resolvedSubjectId?: string;
  previousProgress?: number | null;
  changeType?: "Improving" | "Decreased" | "Unchanged" | "No update" | "New";
  difference?: number | null;
  action?: "Insert" | "Skip" | "Reject";
  isDateDefaulted?: boolean;
}

export interface ImportSummary {
  total: number;
  existingStudentsMatched: number;
  newStudentsToCreate: number;
  ambiguousIdentities: number;
  studentsMissingIdentifiers: number;
  identityConflicts: number;
  progressToImport: number;
  progressSkipped: number;
  progressRejected: number;
  progressUnchanged: number;
  valid?: number;
  skipped?: number;
  unchanged?: number;
  invalid?: number;
}
