import pino from "pino";
import { Env } from "../config/env.config";

export const logger = pino({
  level: Env.LOG_LEVEL,
  base: { service: "buzzie-backend" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "*.password",
      "req.body.password",
    ],
    censor: "[redacted]",
  },
});
