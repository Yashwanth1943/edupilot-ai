import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { authRoutes } from "./routes/auth.js";
import { resourceRoutes } from "./routes/resources.js";
import { importRoutes } from "./routes/imports.js";
import { exportRoutes } from "./routes/exports.js";
import { errorHandler, notFound, requestContext } from "./middleware/errors.js";
import { csrfProtection } from "./middleware/csrf.js";
import { getDatabaseStatus } from "./config/database.js";
import { setupRoutes } from "./routes/setup.js";

export function createApp(env: Env) { const app = express(); app.disable("x-powered-by"); app.use(helmet()); app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true })); app.use(express.json({ limit: "1mb" })); app.use(express.urlencoded({ extended: true })); app.use(cookieParser()); app.use(requestContext); app.use(csrfProtection(env)); app.get("/api/health", (_request, response) => { const databaseStatus = getDatabaseStatus(); response.status(databaseStatus === "connected" ? 200 : 503).json({ applicationName: "EduPilot AI API", apiStatus: "operational", databaseStatus, serverTimestamp: new Date().toISOString() }); }); app.get("/health", (_request, response) => response.redirect(307, "/api/health")); app.get("/api/auth/csrf", (request, response) => response.json({ data: { token: request.cookies?.edupilot_csrf } })); app.use("/api/setup", setupRoutes()); app.use("/api/auth", authRoutes(env)); app.use("/api", resourceRoutes(env)); app.use("/api/imports", importRoutes(env)); app.use("/api/exports", exportRoutes(env)); app.use(notFound); app.use(errorHandler); return app; }
