import type { RequestHandler } from "express";
import { z } from "zod";
import { AssignmentModel } from "../models/assignment.js";
import { ApiError } from "../middleware/errors.js";
import * as studentService from "../services/students.js";
import * as subjectService from "../services/subjects.js";
import * as assignmentService from "../services/assignments.js";
import * as progressService from "../services/progress.js";

const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const studentFields = {
  studentId: z.string().trim().min(1, "Student ID is required"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v.toLowerCase() : ""))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Invalid email address"
    })
    .optional(),
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : ""))
    .optional(),
  department: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : ""))
    .optional(),
  enrollmentDate: z.coerce.date(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  subjectIds: z.array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid subject ID")).optional()
};
const subjectFields = { subjectId: z.string().trim().min(1), name: z.string().trim().min(2), description: z.string().trim().min(1), department: z.string().trim().min(1), totalModules: z.number().int().positive(), status: z.enum(["Active", "Draft", "Archived"]).default("Active") };
const listQuery = z.object({ q: z.string().optional(), status: z.string().optional(), page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional(), sort: z.string().optional(), order: z.enum(["asc", "desc"]).optional() });
const paginationQuery = z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional() });
const progressListQuery = z.object({ studentId: z.string().regex(/^[a-f\d]{24}$/i).optional(), subjectId: z.string().regex(/^[a-f\d]{24}$/i).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional(), sort: z.enum(["effectiveDate", "recordedAt", "progressPercent"]).optional(), order: z.enum(["asc", "desc"]).optional() });
export const resourceSchemas = { resourceId: z.object({ body: z.object({}), params: z.object({ id }), query: z.object({}) }), subjectParam: z.object({ body: z.object({}), params: z.object({ subjectId: id }), query: z.object({}) }), student: z.object({ body: z.object(studentFields), params: z.object({}), query: z.object({}) }), studentUpdate: z.object({ body: z.object(studentFields).partial().refine((value) => Object.keys(value).length > 0, "At least one field is required"), params: z.object({ id }), query: z.object({}) }), subject: z.object({ body: z.object(subjectFields), params: z.object({}), query: z.object({}) }), subjectUpdate: z.object({ body: z.object(subjectFields).partial().refine((value) => Object.keys(value).length > 0, "At least one field is required"), params: z.object({ id }), query: z.object({}) }), studentList: z.object({ body: z.object({}), params: z.object({}), query: listQuery }), subjectList: z.object({ body: z.object({}), params: z.object({}), query: listQuery }), nestedAssignment: z.object({ body: z.object({ subjectId: id }), params: z.object({ studentId: id }), query: z.object({}) }), nestedRemoval: z.object({ body: z.object({}), params: z.object({ studentId: id, subjectId: id }), query: z.object({}) }), progress: z.object({ body: z.object({ studentId: id, subjectId: id, progressPercent: z.number().min(0).max(100), effectiveDate: z.coerce.date(), mentorNotes: z.string().optional() }), params: z.object({}), query: z.object({}) }), paginationQuery: z.object({ body: z.object({}), params: z.object({}), query: paginationQuery }), subjectProgressQuery: z.object({ body: z.object({}), params: z.object({ id }), query: progressListQuery }) };
const institution = (request: Parameters<RequestHandler>[0]) => request.auth!.institutionId;
const param = (request: Parameters<RequestHandler>[0], name: string) => String(request.params[name] ?? "");

export const listStudents: RequestHandler = async (request, response, next) => { try { const result = await studentService.listStudents(institution(request), response.locals.validatedQuery ?? {}); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const createStudent: RequestHandler = async (request, response, next) => {
  try {
    const { subjectIds, ...studentData } = request.body;
    const item = await studentService.createStudent(institution(request), studentData);
    if (Array.isArray(subjectIds) && subjectIds.length > 0) {
      for (const subjectId of subjectIds) {
        await assignmentService.assignSubject(
          institution(request),
          item._id.toString(),
          subjectId,
          request.auth!.userId
        ).catch((err) => {
          if (err instanceof ApiError && err.status === 409) return;
          throw err;
        });
      }
    }
    const full = await studentService.getStudent(institution(request), item._id.toString());
    response.status(201).json({ data: full ?? item });
  } catch (error) {
    next(error);
  }
};
export const getStudent: RequestHandler = async (request, response, next) => { try { const item = await studentService.getStudent(institution(request), param(request, "id")); if (!item) throw new ApiError(404, "Student not found."); response.json({ data: item }); } catch (error) { next(error); } };
export const updateStudent: RequestHandler = async (request, response, next) => {
  try {
    const { subjectIds, ...studentData } = request.body;
    const studentId = param(request, "id");
    const item = await studentService.updateStudent(institution(request), studentId, studentData);
    if (!item) throw new ApiError(404, "Student not found.");

    if (Array.isArray(subjectIds)) {
      const currentAssignments = await assignmentService.listStudentAssignments(institution(request), studentId);
      const currentSubjectIds = currentAssignments.map((a) => {
        const sub = a.subjectId as unknown as { _id?: unknown };
        return sub && typeof sub === "object" && "_id" in sub ? String(sub._id) : a.subjectId.toString();
      });

      for (const currentSubId of currentSubjectIds) {
        if (!subjectIds.includes(currentSubId)) {
          await assignmentService.removeAssignment(institution(request), studentId, currentSubId).catch(() => undefined);
        }
      }

      for (const newSubId of subjectIds) {
        if (!currentSubjectIds.includes(newSubId)) {
          await assignmentService.assignSubject(
            institution(request),
            studentId,
            newSubId,
            request.auth!.userId
          ).catch((err) => {
            if (err instanceof ApiError && err.status === 409) return;
            throw err;
          });
        }
      }
    }

    const full = await studentService.getStudent(institution(request), studentId);
    response.json({ data: full ?? item });
  } catch (error) {
    next(error);
  }
};
export const archiveStudent: RequestHandler = async (request, response, next) => { try { const item = await studentService.archiveStudent(institution(request), param(request, "id")); if (!item) throw new ApiError(404, "Student not found."); response.json({ data: item }); } catch (error) { next(error); } };
export const studentSubjects: RequestHandler = async (request, response, next) => { try { const student = await studentService.getStudent(institution(request), param(request, "id")); if (!student) throw new ApiError(404, "Student not found."); response.json({ data: await assignmentService.listStudentAssignments(institution(request), param(request, "id")) }); } catch (error) { next(error); } };

export const listSubjects: RequestHandler = async (request, response, next) => { try { const result = await subjectService.listSubjects(institution(request), response.locals.validatedQuery ?? {}); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const createSubject: RequestHandler = async (request, response, next) => { try { const item = await subjectService.createSubject(institution(request), request.body); response.status(201).json({ data: item }); } catch (error) { next(error); } };
export const getSubject: RequestHandler = async (request, response, next) => { try { const item = await subjectService.getSubject(institution(request), param(request, "id")); if (!item) throw new ApiError(404, "Subject not found."); response.json({ data: item }); } catch (error) { next(error); } };
export const updateSubject: RequestHandler = async (request, response, next) => { try { const item = await subjectService.updateSubject(institution(request), param(request, "id"), request.body); if (!item) throw new ApiError(404, "Subject not found."); response.json({ data: item }); } catch (error) { next(error); } };
export const deleteSubject: RequestHandler = async (request, response, next) => { try { const item = await subjectService.archiveSubject(institution(request), param(request, "id")); if (!item) throw new ApiError(404, "Subject not found."); response.json({ data: item }); } catch (error) { next(error); } };

export const assignSubject: RequestHandler = async (request, response, next) => { try { const item = await assignmentService.assignSubject(institution(request), request.body.studentId, request.body.subjectId, request.auth!.userId); response.status(201).json({ data: item }); } catch (error) { next(error); } };
export const assignNestedSubject: RequestHandler = async (request, response, next) => { try { const item = await assignmentService.assignSubject(institution(request), param(request, "studentId"), request.body.subjectId, request.auth!.userId); response.status(201).json({ data: item }); } catch (error) { next(error); } };
export const removeAssignment: RequestHandler = async (request, response, next) => { try { const item = await AssignmentModel.findOne({ _id: request.params.id, institutionId: institution(request) }); if (!item) throw new ApiError(404, "Assignment not found."); const updated = await assignmentService.removeAssignment(institution(request), item.studentId.toString(), item.subjectId.toString()); response.json({ data: updated }); } catch (error) { next(error); } };
export const removeNestedAssignment: RequestHandler = async (request, response, next) => { try { const item = await assignmentService.removeAssignment(institution(request), param(request, "studentId"), param(request, "subjectId")); response.json({ data: item }); } catch (error) { next(error); } };
export const subjectStudents: RequestHandler = async (request, response, next) => { try { const subject = await subjectService.getSubject(institution(request), param(request, "subjectId")); if (!subject) throw new ApiError(404, "Subject not found."); response.json({ data: await assignmentService.listSubjectAssignments(institution(request), param(request, "subjectId")) }); } catch (error) { next(error); } };

export const listProgress: RequestHandler = async (request, response, next) => { try { const result = await progressService.listProgress(institution(request), response.locals.validatedQuery ?? {}); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const getProgress: RequestHandler = async (request, response, next) => { try { const record = await progressService.getProgress(institution(request), param(request, "id")); if (!record) throw new ApiError(404, "Progress record not found."); response.json({ data: record }); } catch (error) { next(error); } };
export const studentProgress: RequestHandler = async (request, response, next) => { try { const result = await progressService.listProgress(institution(request), response.locals.validatedQuery ?? {}, param(request, "id")); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const studentSubjectProgress: RequestHandler = async (request, response, next) => { try { const result = await progressService.listProgress(institution(request), response.locals.validatedQuery ?? {}, param(request, "studentId"), param(request, "subjectId")); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const subjectProgress: RequestHandler = async (request, response, next) => { try { const result = await progressService.listProgress(institution(request), response.locals.validatedQuery ?? {}, undefined, param(request, "id")); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
export const createProgress: RequestHandler = async (request, response, next) => { try { const item = await progressService.createProgress(institution(request), { ...request.body, updatedBy: request.auth!.userId }); response.status(201).json({ data: item }); } catch (error) { next(error); } };
export const compareProgress: RequestHandler = async (request, response, next) => { try { const q = response.locals.validatedQuery ?? {}; const result = await progressService.compareProgress(institution(request), String(q.studentId), String(q.subjectId), new Date(String(q.earlierDate)), new Date(String(q.laterDate))); response.json({ data: result }); } catch (error) { next(error); } };
export const progressSummary: RequestHandler = async (request, response, next) => { try { const q = response.locals.validatedQuery ?? {}; const result = await progressService.summary(institution(request), String(q.studentId), String(q.subjectId), q.from ? new Date(String(q.from)) : undefined, q.to ? new Date(String(q.to)) : undefined); response.json({ data: result }); } catch (error) { next(error); } };
export const correctProgress: RequestHandler = async (request, response, next) => { try { const correction = await progressService.createCorrection(institution(request), param(request, "id"), request.body.correctedValue, request.body.reason, request.auth!.userId); response.status(201).json({ data: correction }); } catch (error) { next(error); } };
export const listCorrections: RequestHandler = async (request, response, next) => { try { const result = await progressService.listCorrections(institution(request), response.locals.validatedQuery ?? {}); response.json({ data: result.items, meta: result.meta }); } catch (error) { next(error); } };
