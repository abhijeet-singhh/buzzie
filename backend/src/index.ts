import "dotenv/config";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import passport from "passport";
import { Env } from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import connectDatabase from "./config/database.config";

import "./config/passport.config";
import router from "./routes";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: [Env.FRONTEND_ORIGIN],
    credentials: true,
  }),
);

app.use(passport.initialize());

app.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(HTTPSTATUS.OK).json({
      message: "Server is healthy",
      status: "OK",
    });
  }),
);

app.use("/api/v1", router);

app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(Env.PORT, () => {
      console.log(`Server running on port ${Env.PORT} in ${Env.NODE_ENV} mode`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
