import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Env } from "../config/env.js";
import type { Role } from "../types/models.js";
import { ApiError } from "./errors.js";

export function authenticate(env: Env): RequestHandler { return (request, _response, next) => { const token = request.cookies?.[env.COOKIE_NAME] as string | undefined; if (!token) return next(new ApiError(401, "Authentication required.")); try { const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; institutionId: string; role: Role }; request.auth = { userId: payload.sub, institutionId: payload.institutionId, role: payload.role }; next(); } catch { next(new ApiError(401, "Invalid or expired session.")); } }; }
export function requireRole(...roles: Role[]): RequestHandler { return (request, _response, next) => { if (!request.auth || !roles.includes(request.auth.role)) return next(new ApiError(403, "You do not have permission for this action.")); next(); }; }
