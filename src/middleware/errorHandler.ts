import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { PrivacyError } from "../services/privacyDeletion.service";
import { env } from "../config/env";
import { logServerError } from "./requestDiagnostics";

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = "Internal server error";
  let details: unknown = undefined;

  if (error instanceof PrivacyError) {
    statusCode = error.status;
    message = error.code === "IDENTITY_REVERIFICATION_REQUIRED"
      ? "This customer identity requires verification before another order can be created. Please contact Speedy Sweeties."
      : "Privacy protection could not be verified. Please retry later.";
  } else if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = "Validation failed";
    details = error.flatten();
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = "Database request error";
    details =
      env.NODE_ENV === "development"
        ? {
            code: error.code,
            meta: error.meta
          }
        : undefined;
  } else if (error instanceof Error) {
    message = env.NODE_ENV === "development" ? error.message : "Internal server error";
  }

  if (statusCode >= 500) logServerError(error, req, res);
  res.status(statusCode).json({
    success: false,
    message,
    details,
    stack: env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined
  });
}
