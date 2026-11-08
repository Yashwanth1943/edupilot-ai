import type { RequestHandler } from "express";
import type { Env } from "../config/env.js";
import type { Role } from "../types/models.js";
import { ApiError } from "./errors.js";
import { InstitutionModel } from "../models/institution.js";
import { UserModel } from "../models/user.js";
import { verifySessionToken } from "../services/auth.js";

export function authenticate(env: Env): RequestHandler { return async (request, _response, next) => { const token = request.cookies?.[env.COOKIE_NAME] as string | undefined; if (!token) return next(new ApiError(401, "Authentication required.")); try { const claims = verifySessionToken(token, env); const user = await UserModel.findById(claims.sub).select("institutionId role accountStatus"); if (!user || user.accountStatus !== "Active") return next(new ApiError(401, "Authentication required.")); const institution = await InstitutionModel.findOne({ _id: user.institutionId, status: "Active" }).select("_id"); if (!institution || user.institutionId.toString() !== claims.institutionId) return next(new ApiError(401, "Authentication required.")); request.auth = { userId: user._id.toString(), institutionId: user.institutionId.toString(), role: user.role as Role }; next(); } catch (error) { if (error instanceof ApiError) return next(error); next(new ApiError(401, "Invalid or expired session.")); } }; }
export function requireRole(...roles: Role[]): RequestHandler { return (request, _response, next) => { if (!request.auth || !roles.includes(request.auth.role)) return next(new ApiError(403, "You do not have permission for this action.")); next(); }; }
export function requireInstitutionScope(parameter = "institutionId"): RequestHandler { return (request, _response, next) => { const requested = request.params[parameter] ?? request.body?.[parameter] ?? request.query?.[parameter]; if (requested && (!request.auth || requested !== request.auth.institutionId)) return next(new ApiError(403, "You do not have permission for this institution.")); next(); }; }
