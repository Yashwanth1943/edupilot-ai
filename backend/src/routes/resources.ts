import { Router } from "express";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { resourceSchemas, archiveStudent, assignSubject, compareProgress, correctProgress, createProgress, createStudent, createSubject, deleteSubject, getProgress, getStudent, getSubject, listCorrections, listProgress, listStudents, listSubjects, removeAssignment, studentProgress, studentSubjects, subjectProgress, subjectStudents, updateStudent, updateSubject } from "../controllers/resources.js";

const assignmentSchema = z.object({ body: z.object({ studentId: z.string().regex(/^[a-f\d]{24}$/i), subjectId: z.string().regex(/^[a-f\d]{24}$/i) }), params: z.object({}), query: z.object({}) });
const correctionSchema = z.object({ body: z.object({ correctedValue: z.number().min(0).max(100), reason: z.string().min(3) }), params: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }), query: z.object({}) });
const compareSchema = z.object({ body: z.object({}), params: z.object({}), query: z.object({ studentId: z.string(), subjectId: z.string(), earlierDate: z.string(), laterDate: z.string() }) });

export function resourceRoutes(env: Env) { const router = Router(); router.use(authenticate(env));
  router.get("/students", listStudents); router.post("/students", requireRole("Admin", "Mentor"), validate(resourceSchemas.student), createStudent); router.get("/students/:id/subjects", studentSubjects); router.get("/students/:id/progress", studentProgress); router.get("/students/:id", getStudent); router.patch("/students/:id", requireRole("Admin", "Mentor"), updateStudent); router.delete("/students/:id", requireRole("Admin"), archiveStudent);
  router.get("/subjects", listSubjects); router.post("/subjects", requireRole("Admin"), validate(resourceSchemas.subject), createSubject); router.get("/subjects/:id/progress", subjectProgress); router.get("/subjects/:id", getSubject); router.patch("/subjects/:id", requireRole("Admin"), updateSubject); router.delete("/subjects/:id", requireRole("Admin"), deleteSubject);
  router.post("/assignments", requireRole("Admin", "Mentor"), validate(assignmentSchema), assignSubject); router.delete("/assignments/:id", requireRole("Admin", "Mentor"), removeAssignment); router.get("/assignments/subject/:subjectId", subjectStudents);
  router.get("/progress", listProgress); router.post("/progress", requireRole("Admin", "Mentor"), validate(resourceSchemas.progress), createProgress); router.get("/progress/compare", validate(compareSchema), compareProgress); router.get("/progress/corrections", listCorrections); router.get("/progress/:id", getProgress); router.post("/progress/:id/correction", requireRole("Admin", "Mentor"), validate(correctionSchema), correctProgress);
  return router;
}
