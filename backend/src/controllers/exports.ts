import type { RequestHandler } from "express";
import { z } from "zod";
import { generateStudentProgressExport } from "../services/exports.js";
import { ApiError } from "../middleware/errors.js";

export const exportQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["All", "Active", "Inactive"]).optional(),
  studentId: z.string().optional(),
  subjectId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeHistory: z
    .preprocess((v) => (v === undefined ? true : v === "true" || v === true), z.boolean())
    .optional(),
  includeSummary: z
    .preprocess((v) => (v === undefined ? true : v === "true" || v === true), z.boolean())
    .optional(),
  includeSubjects: z
    .preprocess((v) => (v === undefined ? true : v === "true" || v === true), z.boolean())
    .optional(),
  mode: z.enum(["all", "summary", "history"]).optional()
});

export const exportStudents: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth?.institutionId) {
      throw new ApiError(401, "Authentication required.");
    }

    const query = exportQuerySchema.parse(request.query);
    const { buffer, fileName } = await generateStudentProgressExport(
      request.auth.institutionId,
      {
        ...query,
        includeSummary: query.includeSummary ?? true,
        includeHistory: query.includeHistory ?? true,
        includeSubjects: query.includeSubjects ?? true
      }
    );

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportProgress: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth?.institutionId) {
      throw new ApiError(401, "Authentication required.");
    }

    const query = exportQuerySchema.parse(request.query);
    const { buffer, fileName } = await generateStudentProgressExport(
      request.auth.institutionId,
      {
        ...query,
        includeSummary: query.includeSummary ?? true,
        includeHistory: query.includeHistory ?? true,
        includeSubjects: query.includeSubjects ?? true
      }
    );

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const exportSingleStudentProgress: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth?.institutionId) {
      throw new ApiError(401, "Authentication required.");
    }

    const id = String(request.params.id || request.params.studentId || "").trim();
    if (!id) {
      throw new ApiError(400, "Student ID parameter is required.");
    }

    const query = exportQuerySchema.parse(request.query);
    const { buffer, fileName } = await generateStudentProgressExport(
      request.auth.institutionId,
      {
        ...query,
        studentId: id,
        includeSummary: query.includeSummary ?? true,
        includeHistory: query.includeHistory ?? true,
        includeSubjects: query.includeSubjects ?? true
      }
    );

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
};

