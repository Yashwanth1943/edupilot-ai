import type { RequestHandler } from "express";
import { ImportBatchModel } from "../models/import-batch.js";
import { ImportRowErrorModel } from "../models/import-row-error.js";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";
import { assignSubject } from "../services/assignments.js";
import { ApiError } from "../middleware/errors.js";
import { createProgress } from "../services/progress.js";
import { MAX_IMPORT_FILE_BYTES, parseCalendarDate, parseWorkbook, revalidateRow, safeErrorRow, validateWorkbook } from "../services/csv-import.js";
import { pagination } from "../utils/pagination.js";
import type { ImportValidationRow, ImportSummary } from "../types/imports.js";

function computeImportSummary(rows: ImportValidationRow[]): ImportSummary {
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

  return {
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
}

function mappingFromRequest(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "mapping must be a valid JSON object.");
  }
}

function worksheetsFromRequest(value: unknown) {
  if (value === undefined || value === "") return undefined;
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error();
    return parsed as string[];
  } catch {
    throw new ApiError(400, "worksheets must be a JSON array of worksheet names.");
  }
}

function batchId(request: Parameters<RequestHandler>[0]) {
  return String(request.params.id ?? "");
}

function batchQuery(institutionId: string, id: string) {
  return /^[a-f\d]{24}$/i.test(id)
    ? { institutionId, $or: [{ _id: id }, { batchId: id }] }
    : { institutionId, batchId: id };
}

export const previewImport: RequestHandler = async (request, response, next) => {
  try {
    if (!request.file) throw new ApiError(400, "CSV, XLSX or XLS file is required.");
    if (request.file.size > MAX_IMPORT_FILE_BYTES) throw new ApiError(413, "Uploaded file exceeds the 5 MB limit.");
    const idempotencyKey = String(request.get("Idempotency-Key") ?? "").trim();
    if (!idempotencyKey) throw new ApiError(400, "Idempotency-Key header is required.");

    const existing = await ImportBatchModel.findOne({ institutionId: request.auth!.institutionId, idempotencyKey });
    if (existing) {
      response.status(200).json({ data: { batch: existing, worksheets: [], rows: existing.errorReport } });
      return;
    }

    const workbook = parseWorkbook(request.file.buffer, request.file.originalname);
    const result = await validateWorkbook(
      workbook,
      request.auth!.institutionId,
      mappingFromRequest(request.body.mapping),
      worksheetsFromRequest(request.body.worksheets)
    );

    if (result.rows.length === 0) throw new ApiError(400, "The selected worksheets contain no data rows.");

    const validRows = result.summary.valid ?? result.rows.filter((row) => row.classification === "Valid" || (row.classification === "Warning" && row.action === "Insert")).length;
    const skippedRows = result.summary.skipped ?? result.rows.filter((row) => row.classification === "Skipped" || row.action === "Skip").length;
    const unchangedRows = result.summary.progressUnchanged ?? result.rows.filter((row) => row.changeType === "Unchanged").length;
    const invalidRows = result.summary.invalid ?? result.rows.filter((row) => row.classification === "Invalid" || row.action === "Reject").length;

    const batch = await ImportBatchModel.create({
      institutionId: request.auth!.institutionId,
      batchId: `IMP-${Date.now()}`,
      idempotencyKey,
      fileName: request.file.originalname,
      status: "Preview",
      totalRows: result.rows.length,
      validRows,
      skippedRecords: skippedRows,
      unchangedRecords: unchangedRows,
      rejectedRecords: invalidRows,
      errorReport: result.rows,
      uploadedBy: request.auth!.userId
    });

    const issueRows = result.rows.filter((row) => row.issues.length > 0 && row.classification === "Invalid");
    if (issueRows.length) {
      await ImportRowErrorModel.insertMany(
        issueRows.flatMap((row) =>
          row.issues.map((item) => ({
            batchId: batch._id,
            institutionId: request.auth!.institutionId,
            spreadsheetRowNumber: row.rowNumber,
            originalRow: safeErrorRow(row),
            classification: "Invalid",
            errorCode: item.code,
            errorMessage: item.message
          }))
        )
      );
    }

    response.status(201).json({
      data: {
        batch,
        fileName: workbook.fileName,
        fileType: workbook.fileType,
        worksheets: workbook.worksheets.map((sheet) => ({
          name: sheet.name,
          headers: sheet.headers,
          rowCount: sheet.rowCount ?? sheet.rows.length,
          sampleRows: sheet.sampleRows ?? sheet.rows.slice(0, 5)
        })),
        selectedWorksheets: result.rows
          .map((row) => row.worksheetName)
          .filter((name, index, names) => name && names.indexOf(name) === index),
        rows: result.rows,
        summary: result.summary
      }
    });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};

export const revalidateImport: RequestHandler = async (request, response, next) => {
  try {
    const id = batchId(request);
    const batch = await ImportBatchModel.findOne(batchQuery(request.auth!.institutionId, id));
    if (!batch) throw new ApiError(404, "Import batch not found.");

    const inputRows = (Array.isArray(request.body?.rows) ? request.body.rows : []) as ImportValidationRow[];
    const revalidatedRows: ImportValidationRow[] = [];

    for (const row of inputRows) {
      const updated = await revalidateRow(row, request.auth!.institutionId);
      revalidatedRows.push(updated);
    }

    const summary = computeImportSummary(revalidatedRows);

    batch.errorReport = revalidatedRows as unknown as typeof batch.errorReport;
    batch.totalRows = revalidatedRows.length;
    batch.validRows = summary.valid ?? 0;
    batch.skippedRecords = summary.skipped ?? 0;
    batch.unchangedRecords = summary.progressUnchanged ?? 0;
    batch.rejectedRecords = summary.invalid ?? 0;
    await batch.save();

    response.json({
      data: {
        batch,
        rows: revalidatedRows,
        summary
      }
    });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};

export const executeImport: RequestHandler = async (request, response, next) => {
  try {
    const id = batchId(request);
    const batch = await ImportBatchModel.findOne(batchQuery(request.auth!.institutionId, id));
    if (!batch) throw new ApiError(404, "Import batch not found.");
    if (batch.status !== "Preview") throw new ApiError(409, "This import batch has already been executed.");

    // If client provided edited rows, use them! Otherwise fall back to stored errorReport
    const inputRows: ImportValidationRow[] = Array.isArray(request.body?.rows) && request.body.rows.length > 0
      ? (request.body.rows as ImportValidationRow[])
      : ((Array.isArray(batch.errorReport) ? JSON.parse(JSON.stringify(batch.errorReport)) : []) as ImportValidationRow[]);

    const institutionId = request.auth!.institutionId;
    const userId = request.auth!.userId;

    // 1. Re-check and create genuinely new students once per import batch
    const resolvedStudentsMap = new Map<string, string>();
    const matchedStudentsSet = new Set<string>();
    let createdStudentsCount = 0;

    for (const row of inputRows) {
      const sId = row.values.studentId?.trim();
      const sName = row.values.studentName?.trim();
      if (!sId && !sName) continue;

      const studentKey = sId ? `id:${sId.toLowerCase()}` : `name:${sName!.toLowerCase()}`;

      if (row.studentStatus === "Existing Student" && row.resolvedStudentId) {
        resolvedStudentsMap.set(studentKey, row.resolvedStudentId);
        matchedStudentsSet.add(studentKey);
        continue;
      }

      if (row.studentStatus === "New Student – Will Create" && !resolvedStudentsMap.has(studentKey)) {
        // Re-check MongoDB Atlas in case already created
        let existing = null;
        if (sId) {
          const escapedId = sId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          existing = await StudentModel.findOne({
            institutionId,
            studentId: { $regex: new RegExp(`^${escapedId}$`, "i") }
          });
        } else if (sName) {
          const escapedName = sName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          existing = await StudentModel.findOne({
            institutionId,
            fullName: { $regex: new RegExp(`^${escapedName}$`, "i") }
          });
        }

        if (existing) {
          resolvedStudentsMap.set(studentKey, existing._id.toString());
          matchedStudentsSet.add(studentKey);
        } else {
          // Create new minimal student profile
          const assignedId = sId || `STU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
          const created = await StudentModel.create({
            institutionId,
            studentId: assignedId,
            fullName: sName || assignedId,
            status: "Active",
            enrollmentDate: new Date()
          });
          resolvedStudentsMap.set(studentKey, created._id.toString());
          createdStudentsCount += 1;
        }
      }
    }

    // 2. Process rows for progress records and necessary assignments
    const newErrors: ImportValidationRow[] = [];
    let successfulImports = 0;
    let skippedRecords = 0;
    let unchangedRecords = 0;
    let rejectedRecords = 0;

    for (const row of inputRows) {
      const sId = row.values.studentId?.trim();
      const sName = row.values.studentName?.trim();
      const studentKey = sId ? `id:${sId.toLowerCase()}` : (sName ? `name:${sName.toLowerCase()}` : "");

      // Handle invalid student identity
      if (
        row.studentStatus === "Missing Identity" ||
        row.studentStatus === "Identity Conflict" ||
        row.studentStatus === "Ambiguous Student"
      ) {
        rejectedRecords += 1;
        newErrors.push(row);
        continue;
      }

      const studentMongoId = row.resolvedStudentId || (studentKey ? resolvedStudentsMap.get(studentKey) : undefined);
      if (!studentMongoId) {
        rejectedRecords += 1;
        newErrors.push(row);
        continue;
      }

      const rawProgress = row.values.progressPercent !== undefined && row.values.progressPercent !== null
        ? String(row.values.progressPercent).trim()
        : "";
      const isBlank = rawProgress === "";

      // Blank or explicit skip
      if (isBlank || row.progressStatus === "No Update" || row.classification === "Skipped" || row.action === "Skip") {
        skippedRecords += 1;
        continue;
      }

      // Duplicate
      if (row.progressStatus === "Duplicate" || row.issues?.some((i) => i.code === "DUPLICATE_EXISTING")) {
        skippedRecords += 1;
        continue;
      }

      // Invalid row
      if (row.classification === "Invalid" || row.action === "Reject" || row.progressStatus === "Invalid") {
        rejectedRecords += 1;
        newErrors.push(row);
        continue;
      }

      if (row.progressStatus === "Unchanged") {
        unchangedRecords += 1;
      }

      // Resolve subject
      let subjectMongoId = row.resolvedSubjectId;
      if (!subjectMongoId && row.values.subject?.trim()) {
        const cleanSubject = row.values.subject.replace(/\s+/g, " ").trim();
        const escapedSubject = cleanSubject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const sub = await SubjectModel.findOne({
          institutionId,
          $or: [
            { subjectId: { $regex: new RegExp(`^${escapedSubject}$`, "i") } },
            { name: { $regex: new RegExp(`^${escapedSubject}$`, "i") } }
          ]
        });
        if (sub) subjectMongoId = sub._id.toString();
      }

      if (!subjectMongoId) {
        rejectedRecords += 1;
        newErrors.push(row);
        continue;
      }

      // Ensure student-subject assignment is active for legitimate progress updates
      try {
        await assignSubject(institutionId, studentMongoId, subjectMongoId, userId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Already actively assigned, continue cleanly
        } else {
          throw err;
        }
      }

      // Insert progress snapshot
      const numericProgress = Number(rawProgress.replace("%", "").trim());
      const effectiveDate = parseCalendarDate(row.values.effectiveDate ?? "").date ?? new Date();

      try {
        await createProgress(institutionId, {
          studentId: studentMongoId,
          subjectId: subjectMongoId,
          progressPercent: numericProgress,
          effectiveDate,
          mentorNotes: row.values.mentorNotes,
          updatedBy: userId,
          recordType: "Import",
          importBatchId: batch._id.toString()
        });
        successfulImports += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          skippedRecords += 1;
        } else {
          rejectedRecords += 1;
          newErrors.push(row);
        }
      }
    }

    if (newErrors.length) {
      await ImportRowErrorModel.insertMany(
        newErrors.flatMap((row) =>
          (row.issues || []).map((item) => ({
            batchId: batch._id,
            institutionId,
            spreadsheetRowNumber: row.rowNumber,
            originalRow: safeErrorRow(row),
            classification: "Invalid",
            errorCode: item.code,
            errorMessage: item.message
          }))
        )
      );
    }

    batch.importedRows = successfulImports;
    batch.successfulImports = successfulImports;
    batch.skippedRecords = skippedRecords;
    batch.unchangedRecords = unchangedRecords;
    batch.rejectedRecords = rejectedRecords;
    batch.status = rejectedRecords > 0
      ? (successfulImports > 0 || createdStudentsCount > 0 ? "Partially completed" : "Failed")
      : "Completed";
    batch.completionTimestamp = new Date();
    await batch.save();

    response.json({
      data: {
        batch,
        createdStudentsCount,
        matchedStudentsCount: matchedStudentsSet.size,
        insertedCount: successfulImports,
        skippedCount: skippedRecords,
        unchangedCount: unchangedRecords,
        rejectedCount: rejectedRecords,
        summary: {
          total: inputRows.length,
          createdStudentsCount,
          matchedStudentsCount: matchedStudentsSet.size,
          inserted: successfulImports,
          skipped: skippedRecords,
          unchanged: unchangedRecords,
          rejected: rejectedRecords
        }
      }
    });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};

export const listImports: RequestHandler = async (request, response, next) => {
  try {
    const { page, limit, skip } = pagination(response.locals.validatedQuery ?? request.query);
    const filter = { institutionId: request.auth!.institutionId };
    const [items, total] = await Promise.all([
      ImportBatchModel.find(filter).populate("uploadedBy", "name email role").sort({ createdAt: -1 }).skip(skip).limit(limit),
      ImportBatchModel.countDocuments(filter)
    ]);
    response.json({ data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};

export const getImport: RequestHandler = async (request, response, next) => {
  try {
    const id = batchId(request);
    const batch = await ImportBatchModel.findOne(batchQuery(request.auth!.institutionId, id)).populate("uploadedBy", "name email role");
    if (!batch) throw new ApiError(404, "Import batch not found.");
    response.json({ data: batch });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};

export const listImportErrors: RequestHandler = async (request, response, next) => {
  try {
    const id = batchId(request);
    const batch = await ImportBatchModel.findOne(batchQuery(request.auth!.institutionId, id));
    if (!batch) throw new ApiError(404, "Import batch not found.");
    const { page, limit, skip } = pagination(response.locals.validatedQuery ?? request.query);
    const filter = { batchId: batch._id, institutionId: request.auth!.institutionId };
    const [items, total] = await Promise.all([
      ImportRowErrorModel.find(filter).sort({ spreadsheetRowNumber: 1, createdAt: 1 }).skip(skip).limit(limit),
      ImportRowErrorModel.countDocuments(filter)
    ]);
    response.json({ data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("executeImport error details:", error);
    next(error);
  }
};
