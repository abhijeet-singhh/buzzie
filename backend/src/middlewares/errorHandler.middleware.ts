import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http.config";
import { Env } from "../config/env.config";
import { AppError, ErrorCodes } from "../utils/app-error";
import { logger } from "../lib/logger";

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
): any => {
  if (error instanceof ZodError) {
    logger.warn(
      { method: req.method, path: req.path, requestId: (req as any).id },
      "Validation error",
    );
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));

    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: issues.map((issue) => issue.message).join(", ") || "Invalid request",
      errorCode: ErrorCodes.ERR_BAD_REQUEST,
      issues,
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    logger.warn(
      { method: req.method, path: req.path, requestId: (req as any).id },
      "Invalid identifier",
    );
    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: "Invalid identifier",
      errorCode: ErrorCodes.ERR_BAD_REQUEST,
      issues: [
        {
          path: error.path,
          message: "Invalid identifier",
          code: "invalid_id",
        },
      ],
    });
  }

  if (error instanceof AppError) {
    logger.warn(
      {
        method: req.method,
        path: req.path,
        statusCode: error.statusCode,
        errorCode: error.errorCode,
        requestId: (req as any).id,
      },
      "Handled request error",
    );
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  logger.error(
    {
      err: error,
      method: req.method,
      path: req.path,
      requestId: (req as any).id,
    },
    "Unhandled request error",
  );

  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Internal Server Error",
    errorCode: ErrorCodes.ERR_INTERNAL,
    ...(Env.NODE_ENV !== "production"
      ? { error: error?.message || "Something went wrong" }
      : {}),
  });
};
