import XLSX from "xlsx";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";
import { AssignmentModel } from "../models/assignment.js";
import { ProgressRecordModel } from "../models/progress-record.js";
import { ApiError } from "../middleware/errors.js";

export interface ExportOptions {
  q?: string;
  status?: "All" | "Active" | "Inactive";
  studentId?: string;
  subjectId?: string;
  from?: Date;
  to?: Date;
  includeSummary?: boolean;
  includeHistory?: boolean;
  includeSubjects?: boolean;
  mode?: "all" | "summary" | "history";
}

interface PopulatedStudent {
  _id?: unknown;
  studentId?: string;
  fullName?: string;
}

interface PopulatedSubject {
  _id?: unknown;
  subjectId?: string;
  name?: string;
  department?: string;
}

interface PopulatedUser {
  _id?: unknown;
  name?: string;
  email?: string;
}

function formatDate(date?: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(date?: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

function getTodayString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function styleWorksheet(ws: XLSX.WorkSheet, data: unknown[][]) {
  if (!data.length) return;
  const numCols = Math.max(...data.map((r) => r.length));
  const colWidths = new Array(numCols).fill(12);

  for (const row of data) {
    row.forEach((cell, idx) => {
      const str = cell !== undefined && cell !== null ? String(cell) : "";
      if (str.length + 3 > colWidths[idx]) {
        colWidths[idx] = Math.min(45, str.length + 3);
      }
    });
  }

  ws["!cols"] = colWidths.map((w) => ({ wch: Math.max(12, w) }));
  if (data.length > 1) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: data.length - 1, c: numCols - 1 }
      })
    };
  }
  ws["!views"] = [{ state: "frozen", ySplit: 1 }];
}

export async function generateStudentProgressExport(
  institutionId: string,
  options: ExportOptions = {}
): Promise<{ buffer: Buffer; fileName: string; meta: Record<string, number> }> {
  // 1. Fetch available subjects for the institution
  const allSubjects = await SubjectModel.find({ institutionId }).sort({ name: 1 }).lean();
  const subjectMap = new Map<string, typeof allSubjects[number]>();
  for (const sub of allSubjects) {
    subjectMap.set(sub._id.toString(), sub);
    if (sub.subjectId) subjectMap.set(sub.subjectId.toLowerCase(), sub);
  }

  // Filter subject if requested
  let targetSubjectDoc = null;
  if (options.subjectId) {
    targetSubjectDoc =
      subjectMap.get(options.subjectId) ||
      subjectMap.get(options.subjectId.toLowerCase()) ||
      (await SubjectModel.findOne({ institutionId, _id: options.subjectId }).lean());
    if (!targetSubjectDoc) {
      throw new ApiError(404, "Subject not found in institution.");
    }
  }

  // Determine active subjects to display in wide columns
  const displaySubjects = targetSubjectDoc ? [targetSubjectDoc] : allSubjects;

  // 2. Fetch students matching criteria
  const studentFilter: Record<string, unknown> = { institutionId };
  if (options.status && options.status !== "All") {
    studentFilter.status = options.status;
  }

  if (options.studentId) {
    const sId = options.studentId.trim();
    const isObjectId = /^[a-f\d]{24}$/i.test(sId);
    studentFilter.$or = [
      ...(isObjectId ? [{ _id: sId }] : []),
      { studentId: { $regex: new RegExp(`^${sId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } }
    ];
  }

  if (options.q && options.q.trim()) {
    const escaped = options.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    studentFilter.$or = [
      { fullName: regex },
      { studentId: regex },
      { email: regex },
      { phone: regex }
    ];
  }

  const students = await StudentModel.find(studentFilter).sort({ studentId: 1 }).lean();
  const studentIds = students.map((s) => s._id);

  // 3. Fetch active subject assignments for these students
  const assignments = await AssignmentModel.find({
    institutionId,
    studentId: { $in: studentIds },
    status: "Active"
  }).lean();

  const assignedSubjectIdsByStudent = new Map<string, Set<string>>();
  for (const a of assignments) {
    const sKey = a.studentId.toString();
    const subKey = a.subjectId.toString();
    if (!assignedSubjectIdsByStudent.has(sKey)) {
      assignedSubjectIdsByStudent.set(sKey, new Set());
    }
    assignedSubjectIdsByStudent.get(sKey)!.add(subKey);
  }

  // 4. Fetch progress records
  const progressFilter: Record<string, unknown> = {
    institutionId,
    studentId: { $in: studentIds }
  };

  if (targetSubjectDoc) {
    progressFilter.subjectId = targetSubjectDoc._id;
  }

  if (options.from || options.to) {
    progressFilter.effectiveDate = {
      ...(options.from ? { $gte: options.from } : {}),
      ...(options.to ? { $lte: options.to } : {})
    };
  }

  // Fetch all historical records matching scope
  const progressRecords = await ProgressRecordModel.find(progressFilter)
    .populate("studentId", "studentId fullName")
    .populate("subjectId", "subjectId name department")
    .populate("updatedBy", "name email")
    .sort({ effectiveDate: -1, recordedAt: -1 })
    .lean();

  // 5. Build latest progress lookup per student-subject pair
  interface LatestProgressInfo {
    score: number;
    effectiveDate: Date;
    mentorName: string;
  }
  const latestByStudentSubject = new Map<string, LatestProgressInfo>();
  const studentLatestActivityDate = new Map<string, Date>();
  const studentLatestMentor = new Map<string, string>();

  // Process from oldest to newest so newest overwrites
  const chronoRecords = [...progressRecords].sort(
    (a, b) =>
      new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime() ||
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  for (const rec of chronoRecords) {
    const sId = (rec.studentId as PopulatedStudent)?._id?.toString() || rec.studentId?.toString() || "";
    const subId = (rec.subjectId as PopulatedSubject)?._id?.toString() || rec.subjectId?.toString() || "";
    const pairKey = `${sId}|${subId}`;

    const mentorName = (rec.updatedBy as PopulatedUser)?.name || "";
    latestByStudentSubject.set(pairKey, {
      score: rec.progressPercent,
      effectiveDate: new Date(rec.effectiveDate),
      mentorName
    });

    const currentDate = studentLatestActivityDate.get(sId);
    if (!currentDate || new Date(rec.effectiveDate).getTime() >= currentDate.getTime()) {
      studentLatestActivityDate.set(sId, new Date(rec.effectiveDate));
      if (mentorName) studentLatestMentor.set(sId, mentorName);
    }
  }

  // 6. Assemble Worksheet 1: Student Summary (Wide Format)
  const summaryRows: unknown[][] = [];
  const summaryHeaders = [
    "Student ID",
    "Student Name",
    "Email",
    "Mobile Number",
    "Department",
    "Student Status",
    "Assigned Subjects",
    ...displaySubjects.map((s) => s.name),
    "Last Updated Date",
    "Mentor / Recorded By"
  ];
  summaryRows.push(summaryHeaders);

  for (const student of students) {
    const sId = student._id.toString();
    const assignedSet = assignedSubjectIdsByStudent.get(sId) || new Set();

    const assignedNames = Array.from(assignedSet)
      .map((id) => subjectMap.get(id)?.name)
      .filter(Boolean)
      .join(", ");

    const subjectProgressValues: unknown[] = displaySubjects.map((sub) => {
      const subId = sub._id.toString();
      const pairKey = `${sId}|${subId}`;
      const latest = latestByStudentSubject.get(pairKey);

      // If progress recorded: preserve value (including 0!)
      if (latest !== undefined) {
        return latest.score;
      }
      // Blank progress remains empty string
      return "";
    });

    const lastUpdated = studentLatestActivityDate.get(sId);
    const mentor = studentLatestMentor.get(sId) || "";

    summaryRows.push([
      student.studentId,
      student.fullName || "",
      student.email || "",
      student.phone || "",
      student.department || "",
      student.status || "Active",
      assignedNames || "—",
      ...subjectProgressValues,
      lastUpdated ? formatDate(lastUpdated) : "",
      mentor
    ]);
  }

  // 7. Assemble Worksheet 2: Progress History
  const historyRows: unknown[][] = [];
  const historyHeaders = [
    "Student ID",
    "Student Name",
    "Subject ID",
    "Subject Name",
    "Progress Percentage",
    "Effective Date",
    "Recorded By",
    "Mentor Notes",
    "Record Type",
    "Recorded At"
  ];
  historyRows.push(historyHeaders);

  for (const rec of progressRecords) {
    const sDoc = rec.studentId as PopulatedStudent;
    const subDoc = rec.subjectId as PopulatedSubject;
    const uDoc = rec.updatedBy as PopulatedUser;

    historyRows.push([
      sDoc?.studentId || "",
      sDoc?.fullName || "",
      subDoc?.subjectId || "",
      subDoc?.name || "",
      rec.progressPercent, // 0-100 number
      formatDate(rec.effectiveDate),
      uDoc?.name || "",
      rec.mentorNotes || "",
      rec.recordType || "Manual",
      formatDateTime(rec.recordedAt)
    ]);
  }

  // 8. Assemble Worksheet 3: Subject Summary
  const subjectSummaryRows: unknown[][] = [];
  const subjectSummaryHeaders = [
    "Subject ID",
    "Subject Name",
    "Department",
    "Total Assigned Students",
    "Students With Progress",
    "Average Latest Progress",
    "Improving Students",
    "Unchanged Students",
    "Decreased Students",
    "Students Without Updates"
  ];
  subjectSummaryRows.push(subjectSummaryHeaders);

  for (const sub of displaySubjects) {
    const subId = sub._id.toString();

    // Find all students assigned to this subject
    const assignedStudents = students.filter((s) => {
      const sAssigned = assignedSubjectIdsByStudent.get(s._id.toString());
      return sAssigned && sAssigned.has(subId);
    });

    let withProgressCount = 0;
    let progressTotal = 0;
    let improvingCount = 0;
    let unchangedCount = 0;
    let decreasedCount = 0;

    for (const student of assignedStudents) {
      const pairKey = `${student._id.toString()}|${subId}`;
      const latest = latestByStudentSubject.get(pairKey);

      if (latest !== undefined) {
        withProgressCount += 1;
        progressTotal += latest.score;

        // Find previous progress record for trajectory calculation
        const studentSubRecords = chronoRecords.filter((r) => {
          const s = (r.studentId as PopulatedStudent)?._id?.toString() || r.studentId?.toString() || "";
          const b = (r.subjectId as PopulatedSubject)?._id?.toString() || r.subjectId?.toString() || "";
          return s === student._id.toString() && b === subId;
        });

        if (studentSubRecords.length >= 2) {
          const prev = studentSubRecords[studentSubRecords.length - 2];
          if (prev) {
            const diff = latest.score - prev.progressPercent;
            if (diff > 0) improvingCount += 1;
            else if (diff < 0) decreasedCount += 1;
            else unchangedCount += 1;
          }
        }
      }
    }

    const withoutUpdates = Math.max(0, assignedStudents.length - withProgressCount);
    const avgProgress =
      withProgressCount > 0 ? `${(progressTotal / withProgressCount).toFixed(1)}%` : "—";

    subjectSummaryRows.push([
      sub.subjectId,
      sub.name,
      sub.department || "",
      assignedStudents.length,
      withProgressCount,
      avgProgress,
      improvingCount,
      unchangedCount,
      decreasedCount,
      withoutUpdates
    ]);
  }

  // 9. Build Workbook with appropriate worksheets
  const wb = XLSX.utils.book_new();

  const includeSummary = options.includeSummary !== false && options.mode !== "history";
  const includeHistory = options.includeHistory !== false && options.mode !== "summary";
  const includeSubjects = options.includeSubjects !== false;

  if (includeSummary) {
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    styleWorksheet(wsSummary, summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Student Summary");
  }

  if (includeHistory) {
    const wsHistory = XLSX.utils.aoa_to_sheet(historyRows);
    styleWorksheet(wsHistory, historyRows);
    XLSX.utils.book_append_sheet(wb, wsHistory, "Progress History");
  }

  if (includeSubjects) {
    const wsSubjects = XLSX.utils.aoa_to_sheet(subjectSummaryRows);
    styleWorksheet(wsSubjects, subjectSummaryRows);
    XLSX.utils.book_append_sheet(wb, wsSubjects, "Subject Summary");
  }

  // 10. Generate file name
  const today = getTodayString();
  let baseName = "EduPilot_Student_Progress";
  if (options.studentId && students.length === 1 && students[0]) {
    const cleanId = (students[0].studentId || "Student").replace(/[^a-zA-Z0-9_-]/g, "_");
    baseName = `EduPilot_${cleanId}_Progress`;
  } else if (targetSubjectDoc) {
    const cleanSub = (targetSubjectDoc.name || "Subject").replace(/[^a-zA-Z0-9_-]/g, "_");
    baseName = `EduPilot_${cleanSub}_Progress`;
  }

  const fileName = `${baseName}_${today}.xlsx`;
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    fileName,
    meta: {
      studentsCount: students.length,
      progressCount: progressRecords.length,
      subjectsCount: displaySubjects.length
    }
  };
}
