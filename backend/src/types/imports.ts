export interface ImportValidationIssue { code: string; message: string; severity: "warning" | "error"; }
export interface ParsedWorksheet { name: string; headers: string[]; rows: string[][]; }
export interface ParsedWorkbook { fileName: string; fileType: "csv" | "xlsx" | "xls"; worksheets: ParsedWorksheet[]; }
export interface ImportValidationRow { worksheetName?: string; rowNumber: number; values: Record<string, string>; classification: "Valid" | "Warning" | "Invalid"; issues: ImportValidationIssue[]; resolvedStudentId?: string; resolvedSubjectId?: string; }
