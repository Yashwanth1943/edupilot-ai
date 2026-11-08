import type { RequestHandler } from "express";
import * as dashboardService from "../services/dashboard.js";

export const overview: RequestHandler = async (request, response, next) => { try { const limit = Math.min(Math.max(Number(request.query.limit ?? 8), 1), 50); response.json({ data: await dashboardService.overview(request.auth!.institutionId, limit) }); } catch (error) { next(error); } };
