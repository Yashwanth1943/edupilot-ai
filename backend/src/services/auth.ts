import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { Env } from "../config/env.js";
import { InstitutionModel } from "../models/institution.js";
import { UserModel } from "../models/user.js";

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export type SessionClaims = { sub: string; institutionId: string; role: "Admin" | "Mentor" };

export async function login(input: { email: string; password: string }, env: Env, response: Response) { const user = await UserModel.findOne({ email: input.email }).select("+passwordHash"); if (!user || user.accountStatus !== "Active" || !(await bcrypt.compare(input.password, user.passwordHash))) throw new Error("Invalid email or password."); const institution = await InstitutionModel.findOne({ _id: user.institutionId, status: "Active" }); if (!institution) throw new Error("Institution is not active."); setSession(response, { sub: user._id.toString(), institutionId: user.institutionId.toString(), role: user.role }, env); return { id: user._id, name: user.name, email: user.email, role: user.role, institution: institution.name }; }
export function setSession(response: Response, claims: SessionClaims, env: Env) { const token = jwt.sign(claims, env.JWT_SECRET, { expiresIn: "8h" }); response.cookie(env.COOKIE_NAME, token, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", maxAge: SESSION_MAX_AGE_MS, path: "/" }); }
export function verifySessionToken(token: string, env: Env): SessionClaims { const payload = jwt.verify(token, env.JWT_SECRET); if (!payload || typeof payload !== "object" || typeof payload.sub !== "string" || typeof payload.institutionId !== "string" || (payload.role !== "Admin" && payload.role !== "Mentor")) throw new Error("Invalid session claims."); return { sub: payload.sub, institutionId: payload.institutionId, role: payload.role }; }
export function clearSession(response: Response, env: Env) { response.clearCookie(env.COOKIE_NAME, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/" }); }
