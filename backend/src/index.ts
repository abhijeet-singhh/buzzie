import "dotenv/config";
import http from "http";
import { Env } from "./config/env.config";
import connectDatabase, { disconnectDatabase } from "./config/database.config";
import { closeRedisClients } from "./config/redis.config";
import { logger } from "./lib/logger";
import { closeSocket, initializeSocket } from "./lib/socket";
import { createApp } from "./app";

const app = createApp();
const server = http.createServer(app);

initializeSocket(server);

const SHUTDOWN_TIMEOUT_MS = 12000;
const SHUTDOWN_STEP_TIMEOUT_MS = 2500;
let isShuttingDown = false;

const withShutdownTimeout = <T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      timeoutMs,
    );
    timer.unref();

    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Shutting down gracefully");

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  const steps: Array<[string, () => Promise<void>]> = [
    ["socket", closeSocket],
    [
      "http",
      async () => {
        if (server.listening) {
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
          });
        }
      },
    ],
    ["database", disconnectDatabase],
    ["redis", closeRedisClients],
  ];

  for (const [label, task] of steps) {
    try {
      await withShutdownTimeout(
        task(),
        SHUTDOWN_STEP_TIMEOUT_MS,
        `${label} shutdown`,
      );
    } catch (error) {
      logger.error(
        { label, err: error instanceof Error ? error : undefined },
        "Error during shutdown step",
      );
    }
  }

  clearTimeout(forceExitTimer);
  logger.info("Graceful shutdown complete");
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

const startServer = async () => {
  try {
    await connectDatabase();

    server.listen(Env.PORT, () => {
      logger.info(
        { port: Env.PORT, env: Env.NODE_ENV },
        "Server started",
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

void startServer();
