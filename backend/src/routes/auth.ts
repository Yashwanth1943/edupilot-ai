import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Env } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { authSchemas, loginController, logoutController, meController } from "../controllers/auth.js";
export function authRoutes(env: Env) { const router = Router(); const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }); router.post("/login", limiter, validate(authSchemas.login), loginController(env)); router.post("/logout", logoutController); router.get("/me", authenticate(env), meController); return router; }
