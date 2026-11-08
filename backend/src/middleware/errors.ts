import type { ErrorRequestHandler, RequestHandler } from "express";
import { randomUUID } from "node:crypto";

export class ApiError extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }
export const requestContext: RequestHandler = (request, response, next) => { request.requestId = randomUUID(); response.setHeader("X-Request-Id", request.requestId); next(); };
export const notFound: RequestHandler = (request, _response, next) => next(new ApiError(404, `Route not found: ${request.method} ${request.path}`));
export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const isValidation = error?.name === "ValidationError" || error?.name === "CastError";
  const isUploadLimit = error?.code === "LIMIT_FILE_SIZE";
  const isUploadType = error instanceof Error && error.message === "Only CSV, XLSX and XLS files are supported.";
  const status = error instanceof ApiError
    ? error.status
    : error?.code === 11000
    ? 409
    : isUploadLimit
    ? 413
    : isUploadType
    ? 415
    : isValidation
    ? 400
    : 500;
  const duplicateMessage = error?.keyPattern?.studentId || error?.keyValue?.studentId
    ? "A student with this Student ID already exists in your institution."
    : error?.keyPattern?.subjectId || error?.keyValue?.subjectId
    ? "A subject with this Subject ID already exists in your institution."
    : "A duplicate resource already exists.";
  const message = error instanceof ApiError
    ? error.message
    : error?.code === 11000
    ? duplicateMessage
    : isUploadLimit
    ? "Uploaded file exceeds the size limit."
    : isUploadType
    ? "Only CSV, XLSX and XLS files are supported."
    : isValidation
    ? "Resource validation failed."
    : "Internal server error.";
  if (status >= 500) console.error(error);
  response.status(status).json({
    error: {
      message,
      requestId: request.requestId,
      ...(error instanceof ApiError && error.details ? { details: error.details } : {})
    }
  });
};
