import XLSX from "xlsx";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";
import { AssignmentModel } from "../models/assignment.js";
import { ProgressRecordModel } from "../models/progress-record.js";
import { ApiError } from "../middleware/errors.js";
import type { ImportValidationIssue, ImportValidationRow, ParsedWorkbook, ParsedWorksheet } from "../types/imports.js";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2500;
export const MAX_IMPORT_WORKSHEETS = 10;
export const MAX_IMPORT_CELLS = 50000;

export function parseCsv(buffer: Buffer): ParsedWorksheet {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  return parseCsvText(text, "CSV");
}

function parseCsvText(text: string, name: string): ParsedWorksheet {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  const cleanRows = dataRows.filter((row) => row.some((cell) => cell.length > 0));
  return {
    name,
    headers,
    rows: cleanRows,
    rowCount: cleanRows.length,
    sampleRows: cleanRows.slice(0, 5)
  };
}

function isZip(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function isCompoundFile(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  );
}

function cellText(cell: XLSX.CellObject | undefined, header: string) {
  if (!cell || (cell.f && cell.v === undefined)) return "";
  if (cell.t === "d" && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (typeof cell.v === "number" && /progress|percent|completion/i.test(header) && typeof cell.z === "string" && cell.z.includes("%")) {
    return String(cell.v * 100);
  }
  return cell.w ?? String(cell.v ?? "");
}

function worksheetToParsed(name: string, worksheet: XLSX.WorkSheet): ParsedWorksheet {
  if (!worksheet["!ref"]) return { name, headers: [], rows: [], rowCount: 0, sampleRows: [] };
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const width = range.e.c - range.s.c + 1;
  const height = range.e.r - range.s.r + 1;
  if (width * height > MAX_IMPORT_CELLS) throw new ApiError(413, `Worksheet ${name} exceeds the processing cell limit.`);

  const headers = Array.from({ length: width }, (_, offset) =>
    cellText(worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + offset })] as XLSX.CellObject | undefined, "header").trim()
  );

  const rows = Array.from({ length: Math.max(0, height - 1) }, (_, rowOffset) =>
    Array.from({ length: width }, (_, columnOffset) =>
      cellText(worksheet[XLSX.utils.encode_cell({ r: range.s.r + rowOffset + 1, c: range.s.c + columnOffset })] as XLSX.CellObject | undefined, headers[columnOffset] ?? "")
    )
  );

  const cleanRows = rows.filter((row) => row.some((cell) => cell.length > 0));

  return {
    name,
    headers,
    rows: cleanRows,
    rowCount: cleanRows.length,
    sampleRows: cleanRows.slice(0, 5)
  };
}

export function parseWorkbook(buffer: Buffer, fileName: string): ParsedWorkbook {
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new ApiError(413, "Uploaded file exceeds the 5 MB limit.");
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return { fileName, fileType: "csv", worksheets: [parseCsv(buffer)] };
  if (extension !== "xlsx" && extension !== "xls") throw new ApiError(415, "Only CSV, XLSX and XLS files are supported.");
  if ((extension === "xlsx" && !isZip(buffer)) || (extension === "xls" && !isCompoundFile(buffer))) {
    throw new ApiError(400, "The uploaded file content does not match its extension.");
  }
  try {
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellFormula: true,
      cellNF: true,
      cellText: true,
      bookVBA: false,
      bookDeps: false,
      WTF: false
    });
    if (workbook.SheetNames.length > MAX_IMPORT_WORKSHEETS) throw new ApiError(413, `Workbook exceeds the maximum of ${MAX_IMPORT_WORKSHEETS} worksheets.`);
    if (workbook.SheetNames.some((name) => (workbook.Sheets[name]?.["!type"] as string | undefined) === "macro")) {
      throw new ApiError(415, "Macro worksheets are not supported.");
    }
    return {
      fileName,
      fileType: extension,
      worksheets: workbook.SheetNames.map((name) => worksheetToParsed(name, workbook.Sheets[name]!))
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "The workbook could not be parsed safely.");
  }
}

export function selectWorkbookSheets(workbook: ParsedWorkbook, names?: string[]) {
  if (!names?.length) return workbook.worksheets;
  const selected = workbook.worksheets.filter((sheet) => names.includes(sheet.name));
  if (selected.length !== names.length) throw new ApiError(400, "One or more selected worksheets were not found.");
  return selected;
}

const headerAliases: Record<string, string[]> = {
  studentId: ["student id", "studentid", "id", "learner id", "roll number", "roll no", "roll_no", "admission no", "admission number", "reg no", "registration number"],
  studentName: ["student name", "name", "full name", "learner name", "student"],
  subject: ["subject", "subject name", "subject id", "course", "course name", "course id", "topic"],
  progressPercent: ["progress", "progress %", "progress percentage", "completion", "completion %", "completion rate", "score", "percentage", "percent"],
  effectiveDate: ["effective date", "date", "progress date", "recorded date", "record date", "snapshot date", "timestamp"],
  mentorNotes: ["mentor notes", "notes", "comment", "comments", "feedback", "remark", "remarks"]
};

export function autoDetectMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const match = headers.find((h) => {
      const clean = h.trim().toLowerCase();
      return clean === field.toLowerCase() || aliases.includes(clean);
    });
    if (match) result[field] = match;
  }
  return result;
}

const issue = (code: string, message: string, severity: "warning" | "error" | "info" = "error"): ImportValidationIssue => ({
  code,
  message,
  severity
});

const mappedValue = (row: string[], headers: string[], value?: string) =>
  value ? row[headers.indexOf(value)]?.trim() ?? "" : "";

const sanitizedCell = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);

function rowValues(raw: string[], headers: string[], mapping: Record<string, string>) {
  return {
    studentId: mappedValue(raw, headers, mapping.studentId),
    studentName: mappedValue(raw, headers, mapping.studentName),
    subject: mappedValue(raw, headers, mapping.subject),
    progressPercent: mappedValue(raw, headers, mapping.progressPercent),
    effectiveDate: mappedValue(raw, headers, mapping.effectiveDate),
    mentorNotes: mappedValue(raw, headers, mapping.mentorNotes)
  };
}

function mappingForSheet(mapping: Record<string, unknown>, sheetName: string) {
  const candidate = mapping[sheetName];
  return candidate && typeof candidate === "object" ? (candidate as Record<string, string>) : (mapping as Record<string, string>);
}

export function getTodayKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function parseCalendarDate(raw: string): { date: Date | null; formatted: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { date: null, formatted: null };

  const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const padM = String(month).padStart(2, "0");
      const padD = String(day).padStart(2, "0");
      const iso = `${year}-${padM}-${padD}`;
      const d = new Date(`${iso}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) {
        return { date: d, formatted: iso };
      }
    }
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return { date: null, formatted: null };
  }

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const iso = `${year}-${month}-${day}`;
  return { date: d, formatted: iso };
}

type StudentRecord = { _id: { toString(): string }; fullName?: string; studentId?: string };
type SubjectRecord = { _id: { toString(): string }; name?: string; subjectId?: string };

export type BatchStudentEntry = {
  studentStatus: import("../types/imports.js").StudentImportStatus;
  student: StudentRecord | null;
  resolvedStudentId?: string;
  issues: ImportValidationIssue[];
  studentIdToUse?: string;
  studentNameToUse?: string;
};

export async function validateValues(
  values: Record<string, string>,
  institutionId: string,
  rowNumber: number,
  worksheetName: string,
  seen: Set<string>,
  isAlreadyDefaulted?: boolean,
  batchStudentMap?: Map<string, BatchStudentEntry>
): Promise<ImportValidationRow> {
  const issues: ImportValidationIssue[] = [];

  // ==========================================
  // 1. STUDENT IDENTITY RESOLUTION (SEPARATE)
  // ==========================================
  const rawStudentId = values.studentId?.trim() ?? "";
  const rawStudentName = values.studentName?.trim() ?? "";
  const cleanStudentId = rawStudentId.replace(/\s+/g, " ").trim();
  const cleanStudentName = rawStudentName.replace(/\s+/g, " ").trim();

  let studentStatus: import("../types/imports.js").StudentImportStatus = "Missing Identity";
  let student: StudentRecord | null = null;
  let resolvedStudentId: string | undefined = undefined;

  const studentKey = cleanStudentId
    ? `id:${cleanStudentId.toLowerCase()}`
    : cleanStudentName
    ? `name:${cleanStudentName.toLowerCase()}`
    : "";

  if (!cleanStudentId && !cleanStudentName) {
    studentStatus = "Missing Identity";
    issues.push(issue("MISSING_STUDENT", "Student ID or Student Name is required for student identification.", "error"));
  } else if (batchStudentMap && studentKey && batchStudentMap.has(studentKey)) {
    const cached = batchStudentMap.get(studentKey)!;
    studentStatus = cached.studentStatus;
    student = cached.student;
    resolvedStudentId = cached.resolvedStudentId;

    if (cleanStudentName && cached.studentNameToUse && cleanStudentName.toLowerCase() !== cached.studentNameToUse.toLowerCase()) {
      studentStatus = "Identity Conflict";
      issues.push(issue("IDENTITY_CONFLICT", `Conflicting student names for ID '${cleanStudentId}': '${cached.studentNameToUse}' vs '${cleanStudentName}'.`, "error"));
    } else {
      issues.push(...cached.issues);
    }
    if (cached.studentIdToUse && !values.studentId) {
      values.studentId = cached.studentIdToUse;
    }
    if (cached.studentNameToUse && !values.studentName) {
      values.studentName = cached.studentNameToUse;
    }
  } else {
    // Both Student ID and Student Name available
    if (cleanStudentId && cleanStudentName) {
      const escapedId = cleanStudentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const existingById = await StudentModel.findOne({
        institutionId,
        studentId: { $regex: new RegExp(`^${escapedId}$`, "i") }
      });

      if (existingById) {
        const existingNorm = existingById.fullName?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
        const sheetNorm = cleanStudentName.toLowerCase();
        if (existingNorm && existingNorm !== sheetNorm) {
          studentStatus = "Identity Conflict";
          issues.push(issue("IDENTITY_CONFLICT", `Student ID '${cleanStudentId}' belongs to '${existingById.fullName}' in EduPilot, but sheet has '${cleanStudentName}'.`, "error"));
        } else {
          studentStatus = "Existing Student";
          student = existingById;
          resolvedStudentId = existingById._id.toString();
        }
      } else {
        studentStatus = "New Student – Will Create";
        issues.push(issue("NEW_STUDENT", `New student '${cleanStudentName}' (${cleanStudentId}) will be created automatically upon confirmation.`, "info"));
      }
    }
    // Only Student ID available
    else if (cleanStudentId && !cleanStudentName) {
      const escapedId = cleanStudentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const existingById = await StudentModel.findOne({
        institutionId,
        studentId: { $regex: new RegExp(`^${escapedId}$`, "i") }
      });

      if (existingById) {
        studentStatus = "Existing Student";
        student = existingById;
        resolvedStudentId = existingById._id.toString();
        if (existingById.fullName) {
          values.studentName = existingById.fullName;
        }
      } else {
        studentStatus = "New Student – Will Create";
        issues.push(issue("NEW_STUDENT", `New student with ID '${cleanStudentId}' will be created automatically upon confirmation. Name can be added later.`, "info"));
      }
    }
    // Only Student Name available
    else if (!cleanStudentId && cleanStudentName) {
      const escapedName = cleanStudentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchesByName = await StudentModel.find({
        institutionId,
        fullName: { $regex: new RegExp(`^${escapedName}$`, "i") }
      });

      if (matchesByName.length === 1 && matchesByName[0]) {
        const matched = matchesByName[0];
        studentStatus = "Existing Student";
        student = matched;
        resolvedStudentId = matched._id.toString();
        values.studentId = matched.studentId;
        issues.push(issue("NAME_MATCH", `Matched existing student '${matched.fullName}' (${matched.studentId}) by name.`, "info"));
      } else if (matchesByName.length === 0) {
        studentStatus = "New Student – Will Create";
        const candidateId = `STU-${cleanStudentName.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "NEW"}-${Date.now().toString(36).toUpperCase()}`;
        values.studentId = candidateId;
        issues.push(issue("NEW_STUDENT", `New student '${cleanStudentName}' will be created automatically upon confirmation.`, "info"));
      } else {
        studentStatus = "Ambiguous Student";
        issues.push(issue("AMBIGUOUS_STUDENT", `Multiple students (${matchesByName.map(s => s.studentId).join(", ")}) share the name '${cleanStudentName}'. Manual selection required.`, "error"));
      }
    }

    if (batchStudentMap && studentKey) {
      batchStudentMap.set(studentKey, {
        studentStatus,
        student,
        resolvedStudentId,
        issues: [...issues],
        studentIdToUse: values.studentId,
        studentNameToUse: values.studentName || cleanStudentName
      });
    }
  }

  // ==========================================
  // 2. PROGRESS RESOLUTION & VALIDATION
  // ==========================================
  const rawProgress = values.progressPercent !== undefined && values.progressPercent !== null
    ? String(values.progressPercent).trim()
    : "";
  const isBlankProgress = rawProgress === "";

  let progressStatus: import("../types/imports.js").ProgressImportStatus = "Will Import";
  let previousProgress: number | null = null;
  let changeType: "Improving" | "Decreased" | "Unchanged" | "No update" | "New" = "New";
  let difference: number | null = null;
  let subject: SubjectRecord | null = null;
  let resolvedSubjectId: string | undefined = undefined;
  let isDateDefaulted = false;

  if (isBlankProgress) {
    progressStatus = "No Update";
    changeType = "No update";
    difference = null;
    issues.push(issue("NO_UPDATE", "No progress value in this cell; existing data preserved.", "info"));
    if (!values.effectiveDate) {
      values.effectiveDate = getTodayKolkata();
    }
    // Also resolve subject for reference if supplied
    if (values.subject?.trim()) {
      const cleanSubject = values.subject.replace(/\s+/g, " ").trim();
      const escapedSubject = cleanSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sub = await SubjectModel.findOne({
        institutionId,
        $or: [
          { subjectId: { $regex: new RegExp(`^${escapedSubject}$`, "i") } },
          { name: { $regex: new RegExp(`^${escapedSubject}$`, "i") } }
        ]
      });
      if (sub) resolvedSubjectId = sub._id.toString();
    }
  } else {
    // Subject validation
    const rawSubject = values.subject?.trim() ?? "";
    if (!rawSubject) {
      progressStatus = "Invalid";
      issues.push(issue("MISSING_SUBJECT", "Subject name or subject ID is required.", "error"));
    } else {
      const cleanSubject = rawSubject.replace(/\s+/g, " ").trim();
      const escapedSubject = cleanSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      subject = await SubjectModel.findOne({
        institutionId,
        $or: [
          { subjectId: { $regex: new RegExp(`^${escapedSubject}$`, "i") } },
          { name: { $regex: new RegExp(`^${escapedSubject}$`, "i") } }
        ]
      });

      if (!subject) {
        progressStatus = "Invalid";
        issues.push(issue("UNKNOWN_SUBJECT", `No matching subject was found for '${rawSubject}'.`, "error"));
      } else {
        resolvedSubjectId = subject._id.toString();
        if (student) {
          const isAssigned = await AssignmentModel.exists({
            institutionId,
            studentId: student._id,
            subjectId: subject._id,
            status: "Active"
          });
          if (!isAssigned) {
            issues.push(issue("AUTO_ASSIGN", `Subject '${subject.name}' will be automatically assigned to this student upon confirmation.`, "info"));
          }
        }
      }
    }

    // Effective Date validation
    const rawDate = values.effectiveDate?.trim() ?? "";
    let effectiveDate: Date | null = null;

    if (!rawDate) {
      const todayKolkata = getTodayKolkata();
      values.effectiveDate = todayKolkata;
      effectiveDate = new Date(`${todayKolkata}T00:00:00.000Z`);
      isDateDefaulted = true;
      issues.push(issue("DATE_DEFAULTED", `Effective date was missing; defaulted to today (${todayKolkata}).`, "info"));
    } else if (isAlreadyDefaulted && rawDate === getTodayKolkata()) {
      effectiveDate = new Date(`${rawDate}T00:00:00.000Z`);
      isDateDefaulted = true;
      issues.push(issue("DATE_DEFAULTED", `Effective date was missing; defaulted to today (${rawDate}).`, "info"));
    } else {
      const parsed = parseCalendarDate(rawDate);
      if (!parsed.date) {
        progressStatus = "Invalid";
        issues.push(issue("INVALID_DATE", `Effective date '${rawDate}' is not a valid date.`, "error"));
        effectiveDate = null;
      } else {
        effectiveDate = parsed.date;
        if (parsed.formatted) values.effectiveDate = parsed.formatted;
      }
    }

    // Numeric progress validation
    const numericString = rawProgress.replace("%", "").trim();
    const progressVal = Number(numericString);

    if (!Number.isFinite(progressVal) || progressVal < 0 || progressVal > 100) {
      progressStatus = "Invalid";
      issues.push(issue("INVALID_PROGRESS", `Progress '${rawProgress}' must be a number between 0 and 100.`, "error"));
    } else {
      // Historical lookup for comparison
      if (student && subject) {
        const queryDate = effectiveDate ?? new Date();
        const existingSnapshots = await ProgressRecordModel.find({
          institutionId,
          studentId: student._id,
          subjectId: subject._id
        }).sort({ effectiveDate: 1, recordedAt: 1 }).lean();

        if (existingSnapshots.length > 0) {
          const prior = existingSnapshots
            .filter((r) => r.effectiveDate.getTime() <= queryDate.getTime())
            .at(-1) ?? existingSnapshots.at(-1);

          if (prior) {
            previousProgress = prior.progressPercent;
          }
        }
      }

      if (previousProgress !== null) {
        difference = Number((progressVal - previousProgress).toFixed(1));
        if (difference > 0) {
          changeType = "Improving";
          progressStatus = "Will Import";
        } else if (difference < 0) {
          changeType = "Decreased";
          progressStatus = "Will Import";
        } else {
          changeType = "Unchanged";
          progressStatus = "Unchanged";
          issues.push(issue("UNCHANGED_PROGRESS", `Progress is unchanged from previous snapshot (${previousProgress}%).`, "warning"));
        }
      } else {
        changeType = "New";
        difference = null;
        progressStatus = "Will Import";
      }

      // Duplicate check on date
      if (student && subject && effectiveDate) {
        const existsOnDate = await ProgressRecordModel.exists({
          institutionId,
          studentId: student._id,
          subjectId: subject._id,
          effectiveDate
        });
        if (existsOnDate) {
          progressStatus = "Duplicate";
          issues.push(issue("DUPLICATE_EXISTING", "A progress record already exists for this student, subject, and date.", "warning"));
        }
      }

      // Duplicate in file check
      const effectiveDateKey = values.effectiveDate?.trim() ?? "";
      const duplicateKey = `${student?._id.toString() ?? values.studentId?.toLowerCase()}|${subject?._id.toString() ?? values.subject?.toLowerCase()}|${effectiveDateKey}`;
      if (seen.has(duplicateKey)) {
        progressStatus = "Duplicate";
        issues.push(issue("DUPLICATE_FILE_ROW", "This student-subject-date combination is duplicated in the import.", "warning"));
      }
      seen.add(duplicateKey);
    }
  }

  // ==========================================
  // 3. ROW CLASSIFICATION & ACTION
  // ==========================================
  const hasErrors = issues.some((item) => item.severity === "error");
  const isDuplicate = progressStatus === "Duplicate";

  let classification: "Valid" | "Warning" | "Invalid" | "Skipped" = "Valid";
  let action: "Insert" | "Skip" | "Reject" = "Insert";

  if (hasErrors || studentStatus === "Missing Identity" || studentStatus === "Identity Conflict" || studentStatus === "Ambiguous Student" || progressStatus === "Invalid") {
    classification = "Invalid";
    action = "Reject";
  } else if (isBlankProgress) {
    classification = "Skipped";
    action = "Skip";
  } else if (isDuplicate) {
    classification = "Warning";
    action = "Skip";
  } else if (issues.some((item) => item.severity === "warning")) {
    classification = "Warning";
    action = "Insert";
  } else {
    classification = "Valid";
    action = "Insert";
  }

  return {
    worksheetName,
    rowNumber,
    values,
    classification,
    studentStatus,
    progressStatus,
    action,
    changeType,
    previousProgress,
    difference,
    issues,
    resolvedStudentId: student?._id.toString() || resolvedStudentId,
    resolvedSubjectId: subject?._id.toString() || resolvedSubjectId,
    isDateDefaulted
  };
}

export async function validateWorkbook(
  workbook: ParsedWorkbook,
  institutionId: string,
  mapping: Record<string, unknown>,
  selectedWorksheetNames?: string[]
) {
  const selected = selectWorkbookSheets(workbook, selectedWorksheetNames);
  const institutionSubjects = await SubjectModel.find({ institutionId, status: "Active" }).lean();
  const seen = new Set<string>();
  const batchStudentMap = new Map<string, BatchStudentEntry>();
  const rows: ImportValidationRow[] = [];
  const worksheetIssues: ImportValidationIssue[] = [];

  for (const worksheet of selected) {
    if (worksheet.headers.length === 0 || worksheet.rows.length === 0) {
      worksheetIssues.push(issue("EMPTY_WORKSHEET", `Worksheet ${worksheet.name} has no data rows.`, "warning"));
      continue;
    }
    if (worksheet.headers.every((header) => !header)) {
      worksheetIssues.push(issue("MISSING_HEADERS", `Worksheet ${worksheet.name} has no usable headers.`));
    }

    const rawSheetMapping = mappingForSheet(mapping, worksheet.name);
    const autoDetected = autoDetectMapping(worksheet.headers);
    const sheetMapping = { ...autoDetected, ...rawSheetMapping };

    const hasMappedSubject = Boolean(
      sheetMapping.subject &&
      worksheet.headers.some((h) => h.trim().toLowerCase() === sheetMapping.subject?.trim().toLowerCase())
    );

    // Check for wide multi-subject columns if single subject column is not explicitly mapped
    const matchedSubjectCols: { header: string; subject: typeof institutionSubjects[0] }[] = [];
    if (!hasMappedSubject) {
      if (sheetMapping.subjectColumns && typeof sheetMapping.subjectColumns === "object") {
        const customSubjectCols = sheetMapping.subjectColumns as Record<string, string>;
        for (const [colHeader, targetSubject] of Object.entries(customSubjectCols)) {
          if (!targetSubject) continue;
          const match = institutionSubjects.find(
            (s) =>
              s.name.toLowerCase() === targetSubject.toLowerCase() ||
              s.subjectId.toLowerCase() === targetSubject.toLowerCase() ||
              s._id.toString() === targetSubject
          );
          if (match && worksheet.headers.some((h) => h.trim().toLowerCase() === colHeader.trim().toLowerCase())) {
            const actualHeader = worksheet.headers.find((h) => h.trim().toLowerCase() === colHeader.trim().toLowerCase()) ?? colHeader;
            matchedSubjectCols.push({ header: actualHeader, subject: match });
          }
        }
      } else {
        const ignoredCols = new Set(
          [
            sheetMapping.studentId?.toLowerCase(),
            sheetMapping.studentName?.toLowerCase(),
            sheetMapping.effectiveDate?.toLowerCase(),
            sheetMapping.mentorNotes?.toLowerCase()
          ].filter(Boolean)
        );

        for (const h of worksheet.headers) {
          const cleanH = h.trim().toLowerCase();
          if (!cleanH || ignoredCols.has(cleanH)) continue;
          const match = institutionSubjects.find(
            (s) => s.name.toLowerCase() === cleanH || s.subjectId.toLowerCase() === cleanH
          );
          if (match) {
            matchedSubjectCols.push({ header: h, subject: match });
          }
        }
      }
    }

    const isWideFormat = matchedSubjectCols.length > 0;
    const customFields = Array.isArray(sheetMapping.customFields)
      ? (sheetMapping.customFields as Array<{ key: string; label: string; sourceColumn: string }>)
      : [];

    for (const [index, raw] of worksheet.rows.entries()) {
      const rowNum = index + 2;
      const isCompletelyBlankRow = raw.every((cell) => !cell || cell.trim() === "");

      if (isCompletelyBlankRow) {
        rows.push({
          worksheetName: worksheet.name,
          rowNumber: rowNum,
          values: { studentId: "", studentName: "", subject: "", progressPercent: "", effectiveDate: "", mentorNotes: "" },
          classification: "Skipped",
          studentStatus: "Missing Identity",
          progressStatus: "No Update",
          action: "Skip",
          changeType: "No update",
          previousProgress: null,
          difference: null,
          issues: [issue("EMPTY_ROW", "Completely empty row in spreadsheet; skipped.", "info")]
        });
        continue;
      }

      if (isWideFormat) {
        for (const col of matchedSubjectCols) {
          const values: Record<string, string> = {
            studentId: mappedValue(raw, worksheet.headers, sheetMapping.studentId),
            studentName: mappedValue(raw, worksheet.headers, sheetMapping.studentName),
            subject: col.subject.name,
            progressPercent: mappedValue(raw, worksheet.headers, col.header),
            effectiveDate: mappedValue(raw, worksheet.headers, sheetMapping.effectiveDate),
            mentorNotes: mappedValue(raw, worksheet.headers, sheetMapping.mentorNotes)
          };
          for (const cf of customFields) {
            if (cf.key && cf.sourceColumn) {
              values[cf.key] = mappedValue(raw, worksheet.headers, cf.sourceColumn);
            }
          }
          rows.push(await validateValues(values, institutionId, rowNum, worksheet.name, seen, false, batchStudentMap));
        }
      } else {
        const values: Record<string, string> = {
          ...rowValues(raw, worksheet.headers, sheetMapping)
        };
        for (const cf of customFields) {
          if (cf.key && cf.sourceColumn) {
            values[cf.key] = mappedValue(raw, worksheet.headers, cf.sourceColumn);
          }
        }
        rows.push(await validateValues(values, institutionId, rowNum, worksheet.name, seen, false, batchStudentMap));
      }
    }
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(413, `Workbook exceeds the maximum of ${MAX_IMPORT_ROWS} data rows.`);
  }

  // Calculate summary
  const uniqueExisting = new Set<string>();
  const uniqueNew = new Set<string>();
  const uniqueAmbiguous = new Set<string>();
  const uniqueMissing = new Set<string>();
  const uniqueConflict = new Set<string>();

  for (const r of rows) {
    const sId = r.values.studentId?.trim().toLowerCase();
    const sName = r.values.studentName?.trim().toLowerCase();
    const key = sId ? `id:${sId}` : (sName ? `name:${sName}` : `row:${r.rowNumber}`);
    if (r.studentStatus === "Existing Student") uniqueExisting.add(key);
    else if (r.studentStatus === "New Student – Will Create") uniqueNew.add(key);
    else if (r.studentStatus === "Ambiguous Student") uniqueAmbiguous.add(key);
    else if (r.studentStatus === "Missing Identity") uniqueMissing.add(key);
    else if (r.studentStatus === "Identity Conflict") uniqueConflict.add(key);
  }

  const progressToImport = rows.filter((r) => r.progressStatus === "Will Import").length;
  const progressSkipped = rows.filter((r) => r.progressStatus === "No Update" || r.progressStatus === "Duplicate").length;
  const progressRejected = rows.filter((r) => r.classification === "Invalid").length;
  const progressUnchanged = rows.filter((r) => r.progressStatus === "Unchanged").length;

  const validRows = rows.filter((r) => r.classification === "Valid" || (r.classification === "Warning" && r.action === "Insert")).length;
  const skippedRows = rows.filter((r) => r.classification === "Skipped" || r.action === "Skip").length;
  const invalidRows = rows.filter((r) => r.classification === "Invalid" || r.action === "Reject").length;

  const summary: import("../types/imports.js").ImportSummary = {
    total: rows.length,
    existingStudentsMatched: uniqueExisting.size,
    newStudentsToCreate: uniqueNew.size,
    ambiguousIdentities: uniqueAmbiguous.size,
    studentsMissingIdentifiers: uniqueMissing.size,
    identityConflicts: uniqueConflict.size,
    progressToImport,
    progressSkipped,
    progressRejected,
    progressUnchanged,
    valid: validRows,
    skipped: skippedRows,
    unchanged: progressUnchanged,
    invalid: invalidRows
  };

  return { rows, summary, worksheetIssues };
}

export async function validateCsv(buffer: Buffer, institutionId: string, mapping: Record<string, unknown>) {
  const workbook = parseWorkbook(buffer, "upload.csv");
  return validateWorkbook(workbook, institutionId, mapping);
}

export async function revalidateRow(row: ImportValidationRow, institutionId: string): Promise<ImportValidationRow> {
  const isDefaulted = Boolean(row.isDateDefaulted && row.values?.effectiveDate === getTodayKolkata());
  return validateValues(row.values, institutionId, row.rowNumber, row.worksheetName ?? "Sheet1", new Set<string>(), isDefaulted);
}

export function safeErrorRow(row: ImportValidationRow) {
  return Object.fromEntries(
    Object.entries({ worksheetName: row.worksheetName, rowNumber: String(row.rowNumber), ...row.values }).map(
      ([key, value]) => [key, sanitizedCell(String(value ?? ""))]
    )
  );
}
