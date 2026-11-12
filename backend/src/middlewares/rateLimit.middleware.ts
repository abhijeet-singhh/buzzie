import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Env } from "../config/env.config";
import { HTTPSTATUS } from "../config/http.config";
import { ErrorCodes } from "../utils/app-error";

const isProduction = Env.NODE_ENV === "production";

const rateLimitHandler = (_req: Request, res: Response) => {
  res.status(HTTPSTATUS.TOO_MANY_REQUESTS).json({
    message: "Too many requests, please try again later",
    errorCode: ErrorCodes.ERR_TOO_MANY_REQUESTS,
  });
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => Env.NODE_ENV === "test",
});

export const sendMessageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProduction ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => Env.NODE_ENV === "test",
});
