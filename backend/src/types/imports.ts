export interface ImportValidationIssue { code: string; message: string; severity: "warning" | "error"; }
export interface ImportValidationRow { rowNumber: number; values: Record<string, string>; classification: "Valid" | "Warning" | "Invalid"; issues: ImportValidationIssue[]; resolvedStudentId?: string; resolvedSubjectId?: string; }
