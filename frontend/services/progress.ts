import { getStudentById } from "@/services/students";
import { getSubjectById } from "@/services/subjects";
import type { ProgressComparison, ProgressRecord, ProgressStatus, ProgressSummary } from "@/types/dashboard";

// This append-only store intentionally resets on reload until a backend is introduced.
let progressStore: ProgressRecord[] = [
  { id: "pr-001", studentId: "stu-001", subjectId: "sub-math", progressPercent: 40, effectiveDate: "2024-10-10", recordedAt: "2024-10-10T09:15:00.000Z", updatedBy: "Alex Smith", mentorNotes: "Starting point after the diagnostic review.", entryType: "update" },
  { id: "pr-002", studentId: "stu-001", subjectId: "sub-math", progressPercent: 41, effectiveDate: "2024-10-15", recordedAt: "2024-10-15T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-003", studentId: "stu-001", subjectId: "sub-math", progressPercent: 48, effectiveDate: "2024-10-20", recordedAt: "2024-10-20T09:15:00.000Z", updatedBy: "Alex Smith", mentorNotes: "Strong response to the guided practice plan.", entryType: "update" },
  { id: "pr-004", studentId: "stu-001", subjectId: "sub-math", progressPercent: 48, effectiveDate: "2024-10-25", recordedAt: "2024-10-25T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-005", studentId: "stu-001", subjectId: "sub-math", progressPercent: 62, effectiveDate: "2024-11-01", recordedAt: "2024-11-01T09:15:00.000Z", updatedBy: "Alex Smith", mentorNotes: "Completed the algebra checkpoint.", entryType: "update" },
  { id: "pr-006", studentId: "stu-001", subjectId: "sub-science", progressPercent: 70, effectiveDate: "2024-10-12", recordedAt: "2024-10-12T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-007", studentId: "stu-001", subjectId: "sub-science", progressPercent: 84, effectiveDate: "2024-11-01", recordedAt: "2024-11-01T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-008", studentId: "stu-002", subjectId: "sub-math", progressPercent: 62, effectiveDate: "2024-10-08", recordedAt: "2024-10-08T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-009", studentId: "stu-002", subjectId: "sub-math", progressPercent: 74, effectiveDate: "2024-11-01", recordedAt: "2024-11-01T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-010", studentId: "stu-004", subjectId: "sub-cs", progressPercent: 82, effectiveDate: "2024-10-10", recordedAt: "2024-10-10T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
  { id: "pr-011", studentId: "stu-004", subjectId: "sub-cs", progressPercent: 94, effectiveDate: "2024-11-01", recordedAt: "2024-11-01T09:15:00.000Z", updatedBy: "Alex Smith", entryType: "update" },
];

export interface ProgressInput { studentId: string; subjectId: string; progressPercent: number; effectiveDate: string; updatedBy: string; mentorNotes?: string; }

function sorted(records: ProgressRecord[]) { return [...records].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt)); }
function validateInput(input: ProgressInput) {
  if (!getStudentById(input.studentId)) throw new Error("Selected student was not found.");
  const student = getStudentById(input.studentId);
  if (!getSubjectById(input.subjectId)) throw new Error("Selected subject was not found.");
  if (!student?.subjectIds.includes(input.subjectId)) throw new Error("The subject is not assigned to this student.");
  if (!input.effectiveDate) throw new Error("An effective date is required.");
  if (!input.updatedBy.trim()) throw new Error("Updated by is required.");
  if (!Number.isFinite(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100) throw new Error("Progress must be between 0 and 100.");
}

export function listProgressRecords(filters?: { studentId?: string; subjectId?: string; from?: string; to?: string }): ProgressRecord[] {
  return sorted(progressStore.filter((record) => (!filters?.studentId || record.studentId === filters.studentId) && (!filters?.subjectId || record.subjectId === filters.subjectId) && (!filters?.from || record.effectiveDate >= filters.from) && (!filters?.to || record.effectiveDate <= filters.to))).reverse();
}

export function recordProgress(input: ProgressInput): ProgressRecord {
  validateInput(input);
  const duplicate = progressStore.some((record) => record.entryType === "update" && record.studentId === input.studentId && record.subjectId === input.subjectId && record.effectiveDate === input.effectiveDate);
  if (duplicate) throw new Error("A progress update already exists for this student, subject, and effective date.");
  const record: ProgressRecord = { ...input, id: `pr-${Date.now()}`, recordedAt: new Date().toISOString(), entryType: "update" };
  progressStore = [...progressStore, record];
  return record;
}

export function correctProgress(recordId: string, correctedValue: number, reason: string, updatedBy: string): ProgressRecord {
  const original = progressStore.find((record) => record.id === recordId);
  if (!original) throw new Error("The progress record to correct was not found.");
  if (!Number.isFinite(correctedValue) || correctedValue < 0 || correctedValue > 100) throw new Error("Corrected progress must be between 0 and 100.");
  if (!reason.trim()) throw new Error("A correction reason is required.");
  if (!updatedBy.trim()) throw new Error("Updated by is required.");
  const correction: ProgressRecord = { id: `pr-correction-${Date.now()}`, studentId: original.studentId, subjectId: original.subjectId, progressPercent: correctedValue, effectiveDate: original.effectiveDate, recordedAt: new Date().toISOString(), updatedBy, mentorNotes: original.mentorNotes, entryType: "correction", correctedRecordId: original.id, originalValue: original.progressPercent, correctionReason: reason.trim() };
  progressStore = [...progressStore, correction];
  return correction;
}

export function getProgressHistory(studentId: string, subjectId: string): ProgressRecord[] { return listProgressRecords({ studentId, subjectId }); }
export function getCurrentProgress(studentId: string, subjectId: string): ProgressRecord | undefined { return getProgressHistory(studentId, subjectId)[0]; }
export function getProgressSummary(records: ProgressRecord[], periodRecords = records): ProgressSummary {
  const ordered = sorted(records);
  const period = sorted(periodRecords);
  if (period.length === 0) return { status: "No update", updateCount: 0 };
  const current = period[period.length - 1];
  const previous = period.length > 1 ? period[period.length - 2] : ordered[ordered.findIndex((record) => record.id === current.id) - 1];
  const change = previous ? current.progressPercent - previous.progressPercent : undefined;
  const status: ProgressStatus = change === undefined ? "No update" : change > 0 ? "Improving" : change < 0 ? "Decreased" : "Unchanged";
  return { currentProgress: current.progressPercent, previousProgress: previous?.progressPercent, changeInPoints: change, status, lastRecordedDate: current.effectiveDate, updateCount: period.length };
}

function snapshotAtOrBefore(records: ProgressRecord[], targetDate: string) { return sorted(records.filter((record) => record.effectiveDate <= targetDate)).at(-1); }
export function compareProgress(studentId: string, subjectId: string, earlierDate: string, laterDate: string): ProgressComparison {
  const records = getProgressHistory(studentId, subjectId);
  const earlier = snapshotAtOrBefore(records, earlierDate);
  const later = snapshotAtOrBefore(records, laterDate);
  if (!earlier || !later) return { status: "No update" };
  const difference = later.progressPercent - earlier.progressPercent;
  return { earlier: { progress: earlier.progressPercent, effectiveDate: earlier.effectiveDate }, later: { progress: later.progressPercent, effectiveDate: later.effectiveDate }, difference, status: difference > 0 ? "Improving" : difference < 0 ? "Decreased" : "Unchanged" };
}

export function listCorrections(): ProgressRecord[] { return progressStore.filter((record) => record.entryType === "correction").sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)); }
