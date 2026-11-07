import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { Env } from "../config/env.js";
import { InstitutionModel } from "../models/institution.js";
import { UserModel } from "../models/user.js";

export async function login(input: { email: string; password: string }, env: Env, response: Response) { const user = await UserModel.findOne({ email: input.email }).select("+passwordHash"); if (!user || user.accountStatus !== "Active" || !(await bcrypt.compare(input.password, user.passwordHash))) throw new Error("Invalid email or password."); const institution = await InstitutionModel.findOne({ _id: user.institutionId, status: "Active" }); if (!institution) throw new Error("Institution is not active."); setSession(response, user._id.toString(), user.institutionId.toString(), user.role, env); return { id: user._id, name: user.name, email: user.email, role: user.role, institution: institution.name }; }
function setSession(response: Response, userId: string, institutionId: string, role: string, env: Env) { const token = jwt.sign({ sub: userId, institutionId, role }, env.JWT_SECRET, { expiresIn: "8h" }); response.cookie(env.COOKIE_NAME, token, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }); }
