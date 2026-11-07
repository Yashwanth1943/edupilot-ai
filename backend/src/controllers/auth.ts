import type { RequestHandler } from "express";
import { z } from "zod";
import { login } from "../services/auth.js";
import { ApiError } from "../middleware/errors.js";
import { UserModel } from "../models/user.js";
import { InstitutionModel } from "../models/institution.js";
import type { Env } from "../config/env.js";

export const authSchemas = { login: z.object({ body: z.object({ email: z.string().email(), password: z.string().min(1) }), params: z.object({}), query: z.object({}) }) };
export const loginController = (env: Env): RequestHandler => async (request, response, next) => { try { response.json({ data: await login(request.body, env, response) }); } catch { next(new ApiError(401, "Invalid email or password.")); } };
export const logoutController: RequestHandler = (request, response) => { response.clearCookie(process.env.COOKIE_NAME ?? "edupilot_session", { httpOnly: true, sameSite: "lax" }); response.status(204).send(); };
export const meController: RequestHandler = async (request, response, next) => { try { const user = await UserModel.findById(request.auth!.userId).select("name email role institutionId"); const institution = await InstitutionModel.findById(request.auth!.institutionId).select("name"); response.json({ data: { ...user?.toObject(), institution: institution?.name } }); } catch (error) { next(error); } };
