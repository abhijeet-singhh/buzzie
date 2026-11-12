import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";
import { Env } from "./env.config";
import { logger } from "../lib/logger";

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export const isRedisConfigured = (): boolean => Boolean(Env.REDIS_URL);

export const setupRedisAdapter = (io: Server): void => {
  if (!Env.REDIS_URL) return;

  pubClient = new Redis(Env.REDIS_URL, { commandTimeout: 2000 });
  subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (err) =>
    logger.error({ err: err.message }, "Redis pub adapter error"),
  );
  subClient.on("error", (err) =>
    logger.error({ err: err.message }, "Redis sub adapter error"),
  );

  logger.info("Socket.IO Redis adapter enabled");
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Redis operation timed out")),
      timeoutMs,
    );
    timer.unref?.();

    promise.then(
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

export const getRedisClient = (): Redis | null => pubClient;

export const checkRedisHealth = async (timeoutMs = 2000): Promise<boolean> => {
  if (!isRedisConfigured()) return true;
  if (!pubClient) return false;

  try {
    const pong = await withTimeout(pubClient.ping(), timeoutMs);
    return pong === "PONG";
  } catch {
    return false;
  }
};

export const closeRedisClients = async (): Promise<void> => {
  const clients = [pubClient, subClient].filter(
    (client): client is Redis => client !== null,
  );
  pubClient = null;
  subClient = null;

  await Promise.allSettled(clients.map((client) => client.quit()));
};
