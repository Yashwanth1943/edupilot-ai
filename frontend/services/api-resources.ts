import { apiClient } from "@/services/api-client";
import type { ProgressRecord, Student, Subject } from "@/types/dashboard";
import type { StudentInput } from "@/services/students";
import type { SubjectInput } from "@/services/subjects";

type BackendDocument = { _id: string; studentId?: string; subjectId?: string; fullName?: string; email?: string; phone?: string; department?: string; enrollmentDate?: string; status?: string; name?: string; description?: string; totalModules?: number; progressPercent?: number; effectiveDate?: string; recordedAt?: string; mentorNotes?: string; updatedBy?: { name?: string } | string; recordType?: "Manual" | "Import" };

export const idOf = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("_id" in value) return String((value as { _id: unknown })._id ?? "");
    if ("id" in value) return String((value as { id: unknown }).id ?? "");
  }
  return String(value);
};
const dateOnly = (value?: string) => value ? new Date(value).toISOString().slice(0, 10) : "";

export function mapSubject(raw: BackendDocument): Subject { return { id: raw._id, name: raw.name ?? "", description: raw.description ?? "", department: raw.department ?? "", totalModules: raw.totalModules ?? 0, status: (raw.status as Subject["status"]) ?? "Active", enrolledStudentCount: Number((raw as BackendDocument & { enrolledStudentCount?: number }).enrolledStudentCount ?? 0) }; }
export function mapStudent(raw: BackendDocument & { subjectIds?: unknown[] }, subjectIds?: string[]): Student {
  const resolvedSubjectIds = subjectIds ?? (Array.isArray(raw.subjectIds) ? raw.subjectIds.map(idOf) : []);
  return {
    id: raw._id,
    studentId: raw.studentId ?? "",
    fullName: raw.fullName ?? "",
    email: raw.email ?? "",
    phone: raw.phone,
    department: raw.department,
    enrollmentDate: dateOnly(raw.enrollmentDate),
    status: (raw.status as Student["status"]) ?? "Active",
    subjectIds: resolvedSubjectIds,
    overallProgress: 0,
    subjectProgress: {},
    recentActivities: [],
    assessmentSummary: { completed: 0, averageScore: 0, nextAssessment: "Not available from the backend yet" }
  };
}
export function mapProgress(raw: BackendDocument): ProgressRecord { return { id: raw._id, studentId: idOf(raw.studentId), subjectId: idOf(raw.subjectId), progressPercent: raw.progressPercent ?? 0, effectiveDate: dateOnly(raw.effectiveDate), recordedAt: raw.recordedAt ?? new Date().toISOString(), updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : raw.updatedBy?.name ?? "Backend user", mentorNotes: raw.mentorNotes, entryType: raw.recordType === "Import" ? "update" : "update" }; }

export async function apiListStudents(query = "") {
  const result = await apiClient.students.list(query);
  return { items: result.items.map((item) => mapStudent(item as unknown as BackendDocument & { subjectIds?: unknown[] })), meta: result.meta };
}
export async function apiGetStudent(id: string) {
  const raw = await apiClient.students.get(id) as unknown as BackendDocument & { subjectIds?: unknown[] };
  const assignments = (await apiClient.students.getSubjects(id).catch(() => [])) as unknown as Array<{ subjectId?: unknown; _id?: unknown }>;
  const assignedIds = Array.isArray(assignments) && assignments.length > 0
    ? assignments.map((item) => idOf(item.subjectId ?? item._id)).filter(Boolean)
    : undefined;
  return mapStudent(raw, assignedIds);
}
export async function apiCreateStudent(input: StudentInput) {
  const subjectIds = input.subjectIds ?? [];
  const payload: Record<string, unknown> = {
    studentId: input.studentId.trim(),
    fullName: input.fullName.trim(),
    email: input.email?.trim() ? input.email.trim().toLowerCase() : "",
    phone: input.phone?.trim() || "",
    department: input.department?.trim() || "",
    status: input.status ?? "Active",
    subjectIds
  };
  if (input.enrollmentDate) {
    payload.enrollmentDate = new Date(input.enrollmentDate).toISOString();
  }
  const raw = await apiClient.students.create(payload) as unknown as BackendDocument & { subjectIds?: unknown[] };
  await Promise.all(subjectIds.map((subjectId) => apiClient.students.assignSubject(raw._id, subjectId).catch(() => undefined)));
  return mapStudent(raw, subjectIds);
}

export async function apiUpdateStudent(id: string, input: StudentInput) {
  const newSubjectIds = input.subjectIds ?? [];
  const payload: Record<string, unknown> = {
    studentId: input.studentId.trim(),
    fullName: input.fullName.trim(),
    email: input.email?.trim() ? input.email.trim().toLowerCase() : "",
    phone: input.phone?.trim() || "",
    department: input.department?.trim() || "",
    status: input.status,
    subjectIds: newSubjectIds
  };
  if (input.enrollmentDate) {
    payload.enrollmentDate = new Date(input.enrollmentDate).toISOString();
  }
  const raw = await apiClient.students.update(id, payload) as unknown as BackendDocument & { subjectIds?: unknown[] };
  const current = ((await apiClient.students.getSubjects(id).catch(() => [])) as unknown as Array<{ subjectId?: unknown; _id?: unknown }>);
  const currentIds = current.map((item) => idOf(item.subjectId ?? item._id)).filter(Boolean);

  await Promise.all(
    currentIds
      .filter((subjectId) => !newSubjectIds.includes(subjectId))
      .map((subjectId) => apiClient.students.removeSubject(id, subjectId).catch(() => undefined))
  );
  await Promise.all(
    newSubjectIds
      .filter((subjectId) => !currentIds.includes(subjectId))
      .map((subjectId) => apiClient.students.assignSubject(id, subjectId).catch(() => undefined))
  );
  return mapStudent(raw, newSubjectIds);
}
export async function apiListSubjects(query = "") { const result = await apiClient.subjects.list(query); return { items: result.items.map((item) => mapSubject(item as unknown as BackendDocument)), meta: result.meta }; }
export async function apiCreateSubject(input: SubjectInput) { return mapSubject(await apiClient.subjects.create({ subjectId: `SUB-${Date.now()}`, ...input }) as unknown as BackendDocument); }
export async function apiUpdateSubject(id: string, input: SubjectInput) { return mapSubject(await apiClient.subjects.update(id, input) as unknown as BackendDocument); }
export async function apiListProgress(query: string) { const result = await apiClient.progress.list(query); return { items: result.items.map((item) => mapProgress(item as unknown as BackendDocument)), meta: result.meta }; }
export async function apiCreateProgress(input: { studentId: string; subjectId: string; progressPercent: number; effectiveDate: string; mentorNotes?: string }) { return mapProgress(await apiClient.progress.create({ ...input, effectiveDate: new Date(input.effectiveDate).toISOString() }) as unknown as BackendDocument); }
export async function apiAssignSubject(studentId: string, subjectId: string) { await apiClient.students.assignSubject(studentId, subjectId); }
export async function apiRemoveSubject(studentId: string, subjectId: string) { await apiClient.students.removeSubject(studentId, subjectId); }
export async function apiGetStudentSubjects(studentId: string): Promise<string[]> {
  const assignments = ((await apiClient.students.getSubjects(studentId).catch(() => [])) as unknown as Array<{ subjectId?: unknown; _id?: unknown }>);
  return assignments.map((item) => idOf(item.subjectId ?? item._id)).filter(Boolean);
}
