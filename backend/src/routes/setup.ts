import { Router } from "express";
import rateLimit from "express-rate-limit";
import { initializeController, setupSchema, setupStatusController } from "../controllers/setup.js";
import { validate } from "../middleware/validate.js";

export function setupRoutes() { const router = Router(); const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false }); router.get("/status", setupStatusController); router.post("/initialize", limiter, validate(setupSchema), initializeController); return router; }
