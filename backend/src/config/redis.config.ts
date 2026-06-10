import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";
import { Env } from "./env.config";

export const setupRedisAdapter = (io: Server): void => {
  if (!Env.REDIS_URL) return;

  const pubClient = new Redis(Env.REDIS_URL);
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (err) =>
    console.error("Redis pub adapter error:", err.message),
  );
  subClient.on("error", (err) =>
    console.error("Redis sub adapter error:", err.message),
  );

  console.log("Socket.IO Redis adapter enabled");
};
