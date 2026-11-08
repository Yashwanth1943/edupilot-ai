import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";
import type { Env } from "../config/env.js";

export function csrfProtection(env: Env): RequestHandler { return (request, response, next) => { const existing = request.cookies?.edupilot_csrf as string | undefined; const token = existing ?? randomBytes(24).toString("hex"); if (!existing) response.cookie("edupilot_csrf", token, { httpOnly: false, secure: env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000, path: "/" }); if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next(); const origin = request.get("origin"); if (origin && origin !== env.FRONTEND_ORIGIN) return next(new ApiError(403, "Request origin is not allowed.")); if (request.path.endsWith("/login")) return next(); if (!request.cookies?.[env.COOKIE_NAME]) return next(); if (request.get("x-csrf-token") !== token) return next(new ApiError(403, "CSRF token missing or invalid.")); next(); }; }
