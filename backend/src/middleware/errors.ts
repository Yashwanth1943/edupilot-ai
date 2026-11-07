import type { ErrorRequestHandler, RequestHandler } from "express";
import { randomUUID } from "node:crypto";

export class ApiError extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }
export const requestContext: RequestHandler = (request, response, next) => { request.requestId = randomUUID(); response.setHeader("X-Request-Id", request.requestId); next(); };
export const notFound: RequestHandler = (request, _response, next) => next(new ApiError(404, `Route not found: ${request.method} ${request.path}`));
export const errorHandler: ErrorRequestHandler = (error, request, response, next) => { void next; const status = error instanceof ApiError ? error.status : error?.code === 11000 ? 409 : 500; const message = error instanceof ApiError ? error.message : error?.code === 11000 ? "A duplicate resource already exists." : "Internal server error."; if (status >= 500) console.error(error); response.status(status).json({ error: { message, requestId: request.requestId, ...(error instanceof ApiError && error.details ? { details: error.details } : {}) } }); };
