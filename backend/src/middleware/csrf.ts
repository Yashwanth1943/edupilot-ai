import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";

export const csrfProtection: RequestHandler = (request, response, next) => { const existing = request.cookies?.edupilot_csrf as string | undefined; const token = existing ?? randomBytes(24).toString("hex"); if (!existing) response.cookie("edupilot_csrf", token, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }); if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next(); if (request.path.endsWith("/login") || request.path.endsWith("/logout")) return next(); if (!request.cookies?.[process.env.COOKIE_NAME ?? "edupilot_session"]) return next(); if (request.get("x-csrf-token") !== token) return next(new ApiError(403, "CSRF token missing or invalid.")); next(); };
