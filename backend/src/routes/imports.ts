import { Router } from "express";
import multer from "multer";
import type { Env } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { executeImport, listImports, previewImport } from "../controllers/imports.js";
export function importRoutes(env: Env) { const router = Router(); router.use(authenticate(env)); const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }); router.post("/preview", upload.single("file"), previewImport); router.post("/:id/execute", executeImport); router.get("/", listImports); return router; }
