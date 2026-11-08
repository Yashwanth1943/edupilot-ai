import type { RequestHandler } from "express";
import { z } from "zod";
import * as dashboardService from "../services/dashboard.js";

export const overviewSchema = z.object({ body: z.object({}), params: z.object({}), query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(8) }) });

export const overview: RequestHandler = async (request, response, next) => { try { const q = response.locals.validatedQuery as { limit: number } | undefined; const limit = q?.limit ?? 8; response.json({ data: await dashboardService.overview(request.auth!.institutionId, limit) }); } catch (error) { next(error); } };
