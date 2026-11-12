import { randomUUID } from "crypto";
import pinoHttp from "pino-http";
import { logger } from "../lib/logger";

const MAX_REQUEST_ID_LENGTH = 100;

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" &&
      incoming.length > 0 &&
      incoming.length <= MAX_REQUEST_ID_LENGTH
        ? incoming
        : randomUUID();

    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});
