export type IconName =
  | "layout-dashboard"
  | "users"
  | "book-open"
  | "chart-no-axes-combined"
  | "file-spreadsheet"
  | "sparkles"
  | "settings";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  adminOnly?: boolean;
}

export interface Metric {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: IconName;
  accent: "blue" | "violet" | "cyan" | "orange";
}

export interface ProgressPoint {
  month: string;
  progress: number;
}

export interface SubjectCompletion {
  subject: string;
  completion: number;
  color: string;
}

export interface ActivityItem {
  title: string;
  description: string;
  time: string;
  tone: "blue" | "violet" | "green" | "orange";
}

export interface Insight {
  title: string;
  description: string;
  tag: string;
  priority: "High" | "Medium" | "Low";
}

export type StudentStatus = "Active" | "Inactive";
export type SubjectStatus = "Active" | "Draft" | "Archived";

export interface Subject {
  id: string;
  name: string;
  description: string;
  department: string;
  totalModules: number;
  status: SubjectStatus;
  enrolledStudentCount?: number;
}

export interface LearningActivity {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "lesson" | "assessment" | "milestone";
}

export interface AssessmentSummary {
  completed: number;
  averageScore: number;
  nextAssessment: string;
}

export interface Student {
  id: string;
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  enrollmentDate: string;
  status: StudentStatus;
  subjectIds: string[];
  overallProgress: number;
  subjectProgress: Record<string, number>;
  recentActivities: LearningActivity[];
  assessmentSummary: AssessmentSummary;
}

export type ProgressEntryType = "update" | "correction";
export type ProgressStatus = "Improving" | "Unchanged" | "Decreased" | "No update";

export interface ProgressRecord {
  id: string;
  studentId: string;
  subjectId: string;
  progressPercent: number;
  effectiveDate: string;
  recordedAt: string;
  updatedBy: string;
  mentorNotes?: string;
  entryType: ProgressEntryType;
  correctedRecordId?: string;
  originalValue?: number;
  correctionReason?: string;
}

export interface ProgressSummary {
  currentProgress?: number;
  previousProgress?: number;
  changeInPoints?: number;
  status: ProgressStatus;
  lastRecordedDate?: string;
  updateCount: number;
}

export interface ProgressComparison {
  earlier?: { progress: number; effectiveDate: string };
  later?: { progress: number; effectiveDate: string };
  difference?: number;
  status: ProgressStatus;
}

export type ImportStep = "upload" | "mapping" | "validation" | "preview" | "complete";
export type ImportColumnKey = "studentId" | "studentName" | "subject" | "progressPercent" | "effectiveDate" | "mentorNotes";
export type ImportRecordClass = "Valid" | "Warning" | "Invalid" | "Skipped";

export interface CustomFieldMapping {
  key: string;
  label: string;
  sourceColumn: string;
  dataType: "string" | "number" | "date" | "percentage";
  storageDestination: "unpersisted" | "student_metadata" | "progress_metadata";
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
  fileSize: number;
  fileType: "csv" | "xlsx" | "xls";
  worksheets: ParsedWorksheet[];
  parserStatus: "ready" | "unsupported";
  parserMessage?: string;
}

export interface ColumnMapping {
  studentId?: string;
  studentName?: string;
  subject?: string;
  progressPercent?: string;
  effectiveDate?: string;
  mentorNotes?: string;
  subjectColumns?: Record<string, string>;
  customFields?: CustomFieldMapping[];
  [key: string]: unknown;
}

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

export interface ImportValidationRow {
  worksheetName?: string;
  rowNumber: number;
  values: Record<string, string>;
  classification: ImportRecordClass;
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

export interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  totalRows: number;
  successfulImports: number;
  skippedRecords: number;
  unchangedRecords?: number;
  rejectedRecords: number;
  status: "Completed" | "Partially completed" | "Failed";
  errors: ImportValidationRow[];
}
