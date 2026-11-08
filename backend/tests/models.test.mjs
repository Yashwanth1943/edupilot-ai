import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  AssignmentModel,
  ImportBatchModel,
  ImportRowErrorModel,
  ProgressCorrectionModel,
  ProgressRecordModel,
  StudentModel,
  SubjectModel,
  UserModel,
} from "../dist/models/index.js";

const ids = { institution: new mongoose.Types.ObjectId(), student: new mongoose.Types.ObjectId(), subject: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(), batch: new mongoose.Types.ObjectId() };

test("required fields and enum/range validation are enforced without a database", () => {
  const student = new StudentModel({ institutionId: ids.institution, studentId: "STU001", fullName: "Ada Lovelace", email: "ada@example.com", enrollmentDate: new Date() });
  assert.equal(student.validateSync(), undefined);

  const invalidProgress = new ProgressRecordModel({ institutionId: ids.institution, studentId: ids.student, subjectId: ids.subject, progressPercent: 101, effectiveDate: new Date(), updatedBy: ids.user });
  assert.ok(invalidProgress.validateSync()?.errors.progressPercent);

  const invalidEmail = new UserModel({ institutionId: ids.institution, name: "Mentor", email: "not-an-email", passwordHash: "hash" });
  assert.ok(invalidEmail.validateSync()?.errors.email);
});

test("tenant and historical uniqueness indexes are declared", () => {
  const studentIndexes = StudentModel.schema.indexes();
  const subjectIndexes = SubjectModel.schema.indexes();
  const assignmentIndexes = AssignmentModel.schema.indexes();
  const progressIndexes = ProgressRecordModel.schema.indexes();

  assert.ok(studentIndexes.some(([fields, options]) => fields.institutionId === 1 && fields.studentId === 1 && options?.unique));
  assert.ok(subjectIndexes.some(([fields, options]) => fields.institutionId === 1 && fields.subjectId === 1 && options?.unique));
  assert.ok(assignmentIndexes.some(([fields, options]) => fields.studentId === 1 && fields.subjectId === 1 && options?.unique && options.partialFilterExpression?.status === "Active"));
  assert.ok(progressIndexes.some(([fields, options]) => fields.institutionId === 1 && fields.studentId === 1 && fields.subjectId === 1 && fields.effectiveDate === 1 && options?.unique));
});

test("historical snapshots and corrections preserve original values", () => {
  const first = new ProgressRecordModel({ institutionId: ids.institution, studentId: ids.student, subjectId: ids.subject, progressPercent: 40, effectiveDate: new Date("2026-10-10"), updatedBy: ids.user });
  const second = new ProgressRecordModel({ institutionId: ids.institution, studentId: ids.student, subjectId: ids.subject, progressPercent: 48, effectiveDate: new Date("2026-10-20"), updatedBy: ids.user });
  const correction = new ProgressCorrectionModel({ institutionId: ids.institution, progressRecordId: first._id, studentId: ids.student, subjectId: ids.subject, originalValue: first.progressPercent, correctedValue: 41, reason: "Mentor verified assessment result", correctedBy: ids.user });

  assert.equal(first.progressPercent, 40);
  assert.equal(second.progressPercent, 48);
  assert.equal(correction.originalValue, 40);
  assert.equal(correction.correctedValue, 41);
  assert.equal(correction.progressRecordId.toString(), first._id.toString());
});

test("references and timestamps are present on relationship documents", () => {
  const assignment = new AssignmentModel({ institutionId: ids.institution, studentId: ids.student, subjectId: ids.subject, assignedBy: ids.user });
  const batch = new ImportBatchModel({ institutionId: ids.institution, batchId: "BATCH001", idempotencyKey: "key-1", fileName: "progress.csv", uploadedBy: ids.user });
  const rowError = new ImportRowErrorModel({ batchId: ids.batch, institutionId: ids.institution, spreadsheetRowNumber: 2, originalRow: { studentId: "STU001" }, classification: "Invalid", errorCode: "INVALID_PROGRESS", errorMessage: "Progress must be between 0 and 100." });

  assert.equal(assignment.schema.path("studentId").options.ref, "Student");
  assert.equal(assignment.schema.path("subjectId").options.ref, "Subject");
  assert.equal(batch.schema.path("uploadedBy").options.ref, "User");
  assert.equal(rowError.schema.path("batchId").options.ref, "ImportBatch");
  assert.ok(assignment.schema.path("createdAt"));
  assert.ok(batch.schema.path("createdAt"));
  assert.ok(rowError.schema.path("createdAt"));
});
