import { Router } from "express";
import type { Env } from "../config/env.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  exportStudents,
  exportProgress,
  exportSingleStudentProgress
} from "../controllers/exports.js";

export function exportRoutes(env: Env) {
  const router = Router();
  router.use(authenticate(env));
  router.use(requireRole("Admin", "Mentor"));

  router.get("/students.xlsx", exportStudents);
  router.get("/students", exportStudents);
  router.get("/progress.xlsx", exportProgress);
  router.get("/progress", exportProgress);
  router.get("/students/:id/progress.xlsx", exportSingleStudentProgress);
  router.get("/students/:id/progress", exportSingleStudentProgress);
  router.get("/students/:id.xlsx", exportSingleStudentProgress);

  return router;
}

