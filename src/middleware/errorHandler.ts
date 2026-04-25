import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = "Internal server error";
  let details: unknown = undefined;

  if (error instanceof ApiError) {
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
    details = {
      code: error.code,
      meta: error.meta
    };
  } else if (error instanceof Error) {
    message = error.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    details,
    stack: env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined
  });
}
