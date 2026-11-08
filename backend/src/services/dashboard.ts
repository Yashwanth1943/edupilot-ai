import { ProgressRecordModel } from "../models/progress-record.js";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";

export async function overview(institutionId: string, activityLimit = 8) {
  const [totalStudents, activeStudents, totalSubjects, activeSubjects, records] = await Promise.all([
    StudentModel.countDocuments({ institutionId }), StudentModel.countDocuments({ institutionId, status: "Active" }),
    SubjectModel.countDocuments({ institutionId }), SubjectModel.countDocuments({ institutionId, status: "Active" }),
    ProgressRecordModel.find({ institutionId }).sort({ effectiveDate: -1, recordedAt: -1 }).limit(10000).populate("studentId", "fullName studentId").populate("subjectId", "name subjectId").populate("updatedBy", "name").lean(),
  ]);
  const latestByPair = new Map<string, typeof records[number]>(); const previousByPair = new Map<string, typeof records[number]>();
  for (const record of [...records].sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())) { const key = `${record.studentId}|${record.subjectId}`; if (latestByPair.has(key)) previousByPair.set(key, latestByPair.get(key)!); latestByPair.set(key, record); }
  const improvingStudents = new Set<string>(); const unchangedStudents = new Set<string>(); const decreasedStudents = new Set<string>(); for (const [key, current] of latestByPair) { const previous = previousByPair.get(key); if (!previous) continue; const change = current.progressPercent - previous.progressPercent; const studentKey = String(current.studentId); if (change > 0) improvingStudents.add(studentKey); else if (change < 0) decreasedStudents.add(studentKey); else unchangedStudents.add(studentKey); void key; }
  const latest = [...latestByPair.values()]; const averageProgress = latest.length ? Number((latest.reduce((sum, record) => sum + record.progressPercent, 0) / latest.length).toFixed(1)) : undefined;
  const subjectMap = new Map<string, { subject: string; completionTotal: number; count: number }>(); for (const record of latest) { const subject = record.subjectId as unknown as { _id: string; name: string }; const key = String(subject?._id ?? record.subjectId); const item = subjectMap.get(key) ?? { subject: subject?.name ?? "Unknown subject", completionTotal: 0, count: 0 }; item.completionTotal += record.progressPercent; item.count += 1; subjectMap.set(key, item); }
  const activity = records.slice(0, activityLimit).map((record) => ({ id: String(record._id), type: record.recordType, effectiveDate: record.effectiveDate, progressPercent: record.progressPercent, student: record.studentId, subject: record.subjectId, updatedBy: record.updatedBy }));
  return { students: { total: totalStudents, active: activeStudents }, subjects: { total: totalSubjects, active: activeSubjects }, progress: { average: averageProgress, improving: improvingStudents.size, unchanged: unchangedStudents.size, decreased: decreasedStudents.size, trackedPairs: latest.length }, subjectCompletion: [...subjectMap.values()].map((item) => ({ subject: item.subject, completion: Number((item.completionTotal / item.count).toFixed(1)), count: item.count })), activity };
}
