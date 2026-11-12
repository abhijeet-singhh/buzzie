import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import passport from "passport";
import { Env } from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import {
  checkDatabaseHealth,
} from "./config/database.config";
import {
  checkRedisHealth,
  isRedisConfigured,
} from "./config/redis.config";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import "./config/passport.config";
import router from "./routes";

export const createApp = () => {
  const app = express();

  if (Env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    cors({
      origin: [Env.FRONTEND_ORIGIN],
      credentials: true,
      exposedHeaders: ["x-request-id"],
    }),
  );

  app.use(passport.initialize());

  app.get(
    "/health",
    asyncHandler(async (_req: Request, res: Response) => {
      const [mongoOk, redisOk] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
      ]);
      const ready = mongoOk && redisOk;

      return res
        .status(ready ? HTTPSTATUS.OK : HTTPSTATUS.SERVICE_UNAVAILABLE)
        .json({
          message: ready ? "Server is healthy" : "Server is not ready",
          status: ready ? "OK" : "UNAVAILABLE",
          checks: {
            mongodb: mongoOk ? "up" : "down",
            redis: isRedisConfigured()
              ? redisOk
                ? "up"
                : "down"
              : "not_configured",
          },
        });
    }),
  );

  app.use("/api/v1", router);

  app.use(errorHandler);

  return app;
};
