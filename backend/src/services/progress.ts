import { AssignmentModel } from "../models/assignment.js";
import { ProgressCorrectionModel } from "../models/progress-correction.js";
import { ProgressRecordModel } from "../models/progress-record.js";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";
import { ApiError } from "../middleware/errors.js";
import { pagination } from "../utils/pagination.js";

export type ProgressStatus = "Improving" | "Unchanged" | "Decreased" | "No update";
export type ProgressSummary = { currentProgress?: number; previousProgress?: number; changeInPoints?: number; status: ProgressStatus; lastRecordedDate?: Date; updateCount: number };

function dateValue(value: unknown, field: string) { const date = new Date(String(value)); if (Number.isNaN(date.getTime())) throw new ApiError(400, `${field} must be a valid date.`); return date; }
function statusFor(difference: number | undefined): ProgressStatus { if (difference === undefined) return "No update"; if (difference > 0) return "Improving"; if (difference < 0) return "Decreased"; return "Unchanged"; }
function sortDirection(value: unknown): 1 | -1 { return value === "asc" ? 1 : -1; }

export function calculateStatus(difference: number | undefined): ProgressStatus { return statusFor(difference); }
export function calculateSummary(records: Array<{ progressPercent: number; effectiveDate: Date }>): ProgressSummary { const ordered = [...records].sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime()); const current = ordered.at(-1); const previous = ordered.at(-2); const difference = current && previous ? current.progressPercent - previous.progressPercent : undefined; return { currentProgress: current?.progressPercent, previousProgress: previous?.progressPercent, changeInPoints: difference, status: statusFor(difference), lastRecordedDate: current?.effectiveDate, updateCount: ordered.length }; }
export function snapshotAtOrBefore<T extends { effectiveDate: Date }>(records: T[], date: Date) { return [...records].filter((record) => record.effectiveDate.getTime() <= date.getTime()).sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime()).at(-1); }

async function verifyScope(institutionId: string, studentId: string, subjectId?: string) {
  const student = await StudentModel.findOne({ _id: studentId, institutionId }).select("_id");
  if (!student) throw new ApiError(404, "Student not found.");
  if (!subjectId) return;
  const subject = await SubjectModel.findOne({ _id: subjectId, institutionId }).select("_id");
  if (!subject) throw new ApiError(404, "Subject not found.");
}

export async function listProgress(institutionId: string, query: Record<string, unknown>, fixedStudentId?: string, fixedSubjectId?: string) {
  const { page, limit, skip } = pagination(query);
  const studentId = fixedStudentId ?? (query.studentId ? String(query.studentId) : undefined);
  const subjectId = fixedSubjectId ?? (query.subjectId ? String(query.subjectId) : undefined);
  if (studentId) await verifyScope(institutionId, studentId, subjectId);
  else if (subjectId && !(await SubjectModel.exists({ _id: subjectId, institutionId }))) throw new ApiError(404, "Subject not found.");
  const effectiveDate = query.from || query.to ? { ...(query.from ? { $gte: dateValue(query.from, "from") } : {}), ...(query.to ? { $lte: dateValue(query.to, "to") } : {}) } : undefined;
  const filter = { institutionId, ...(studentId ? { studentId } : {}), ...(subjectId ? { subjectId } : {}), ...(effectiveDate ? { effectiveDate } : {}) };
  const sortField = ["effectiveDate", "recordedAt", "progressPercent"].includes(String(query.sort)) ? String(query.sort) : "effectiveDate";
  const sort: Record<string, 1 | -1> = { [sortField]: sortDirection(query.order), ...(sortField !== "recordedAt" ? { recordedAt: sortDirection(query.order) } : {}) };
  const [items, total] = await Promise.all([ProgressRecordModel.find(filter).sort(sort).skip(skip).limit(limit), ProgressRecordModel.countDocuments(filter)]);
  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function createProgress(institutionId: string, input: { studentId: string; subjectId: string; progressPercent: number; effectiveDate: Date; mentorNotes?: string; updatedBy: string; recordType?: "Manual" | "Import"; importBatchId?: string }) {
  await verifyScope(institutionId, input.studentId, input.subjectId);
  const assigned = await AssignmentModel.exists({ institutionId, studentId: input.studentId, subjectId: input.subjectId, status: "Active" });
  if (!assigned) throw new ApiError(400, "The subject is not assigned to this student.");
  return ProgressRecordModel.create({ ...input, institutionId, recordType: input.recordType ?? "Manual" });
}

export async function getProgress(institutionId: string, id: string) { return ProgressRecordModel.findOne({ _id: id, institutionId }); }

export async function compareProgress(institutionId: string, studentId: string, subjectId: string, earlier: Date, later: Date) {
  if (later < earlier) throw new ApiError(400, "laterDate must be on or after earlierDate.");
  await verifyScope(institutionId, studentId, subjectId);
  const records = await ProgressRecordModel.find({ institutionId, studentId, subjectId, effectiveDate: { $lte: later } }).sort({ effectiveDate: 1, recordedAt: 1 });
  const earlierRecord = snapshotAtOrBefore(records, earlier);
  const laterRecord = snapshotAtOrBefore(records, later);
  const difference = earlierRecord && laterRecord ? laterRecord.progressPercent - earlierRecord.progressPercent : undefined;
  return { earlier: earlierRecord, later: laterRecord, difference, status: statusFor(difference) };
}

export async function summary(institutionId: string, studentId: string, subjectId: string, from?: Date, to?: Date) {
  await verifyScope(institutionId, studentId, subjectId);
  const filter = { institutionId, studentId, subjectId, ...(from || to ? { effectiveDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) };
  return calculateSummary(await ProgressRecordModel.find(filter).sort({ effectiveDate: 1, recordedAt: 1 }));
}

export async function createCorrection(institutionId: string, progressRecordId: string, correctedValue: number, reason: string, correctedBy: string) {
  const original = await ProgressRecordModel.findOne({ _id: progressRecordId, institutionId });
  if (!original) throw new ApiError(404, "Progress record not found.");
  return ProgressCorrectionModel.create({ institutionId, progressRecordId: original._id, studentId: original.studentId, subjectId: original.subjectId, originalValue: original.progressPercent, correctedValue, reason, correctedBy });
}

export function listCorrections(institutionId: string, query: Record<string, unknown>) { const { page, limit, skip } = pagination(query); return Promise.all([ProgressCorrectionModel.find({ institutionId }).sort({ correctedAt: -1 }).skip(skip).limit(limit), ProgressCorrectionModel.countDocuments({ institutionId })]).then(([items, total]) => ({ items, meta: { page, limit, total, pages: Math.ceil(total / limit) } })); }
