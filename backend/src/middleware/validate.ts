import type { RequestHandler } from "express";
import type { z } from "zod";
import { ApiError } from "./errors.js";
export function validate(schema: z.ZodType): RequestHandler { return (request, response, next) => { const result = schema.safeParse({ body: request.body ?? {}, params: request.params ?? {}, query: request.query ?? {} }); if (!result.success) return next(new ApiError(400, "Request validation failed.", result.error.issues)); const data = result.data as { body: unknown; params: Record<string, string>; query: Record<string, unknown> }; request.body = data.body; request.params = data.params; response.locals.validatedQuery = data.query; next(); }; }
