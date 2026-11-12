import { getRedisClient, isRedisConfigured } from "../config/redis.config";

const PRESENCE_KEY_PREFIX = "buzzie:presence:user:";
const TYPING_KEY_PREFIX = "buzzie:typing:";
const PRESENCE_TTL_MS = 60_000;
const PRESENCE_KEY_TTL_SECONDS = 300;
const TYPING_TTL_MS = 2_000;

const localSockets = new Map<string, Set<string>>();
const localTyping = new Map<string, number>();

const presenceKey = (userId: string) => `${PRESENCE_KEY_PREFIX}${userId}`;
const typingKey = (userId: string, chatId: string) =>
  `${TYPING_KEY_PREFIX}${userId}:${chatId}`;

const getRedis = () => {
  if (!isRedisConfigured()) return null;
  return getRedisClient();
};

const logRedisFallback = (operation: string, error: unknown) => {
  console.error(
    `Redis presence ${operation} failed, using local fallback:`,
    error instanceof Error ? error.message : error,
  );
};

export const addUserSocket = async (
  userId: string,
  socketId: string,
): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const now = Date.now();
      const key = presenceKey(userId);
      const wasOnline = (await redis.zcount(key, now, "+inf")) > 0;

      await redis
        .multi()
        .zremrangebyscore(key, "-inf", now)
        .zadd(key, now + PRESENCE_TTL_MS, socketId)
        .expire(key, PRESENCE_KEY_TTL_SECONDS)
        .exec();

      return !wasOnline;
    } catch (error) {
      logRedisFallback("add", error);
    }
  }

  const sockets = localSockets.get(userId);
  const wasOnline = Boolean(sockets && sockets.size > 0);

  if (!sockets) {
    localSockets.set(userId, new Set([socketId]));
  } else {
    sockets.add(socketId);
  }

  return !wasOnline;
};

export const refreshUserSocket = async (
  userId: string,
  socketId: string,
): Promise<void> => {
  const redis = getRedis();

  if (redis) {
    try {
      const now = Date.now();
      await redis
        .multi()
        .zadd(presenceKey(userId), now + PRESENCE_TTL_MS, socketId)
        .expire(presenceKey(userId), PRESENCE_KEY_TTL_SECONDS)
        .exec();
      return;
    } catch (error) {
      logRedisFallback("refresh", error);
    }
  }

  const sockets = localSockets.get(userId);
  if (sockets) {
    sockets.add(socketId);
  } else {
    localSockets.set(userId, new Set([socketId]));
  }
};

export const removeUserSocket = async (
  userId: string,
  socketId: string,
): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const now = Date.now();
      const key = presenceKey(userId);

      await redis
        .multi()
        .zrem(key, socketId)
        .zremrangebyscore(key, "-inf", now)
        .exec();

      const active = await redis.zcount(key, now, "+inf");
      if (active === 0) {
        await redis.del(key);
      }

      return active === 0;
    } catch (error) {
      logRedisFallback("remove", error);
    }
  }

  const sockets = localSockets.get(userId);
  if (!sockets) return true;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    localSockets.delete(userId);
    return true;
  }

  return false;
};

export const isUserOnline = async (userId: string): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const active = await redis.zcount(presenceKey(userId), Date.now(), "+inf");
      return active > 0;
    } catch (error) {
      logRedisFallback("read", error);
    }
  }

  return Boolean(localSockets.get(userId)?.size);
};

export const getUserOnlineStatuses = async (
  userIds: string[],
): Promise<Map<string, boolean>> => {
  const statuses = new Map<string, boolean>();
  if (userIds.length === 0) return statuses;

  const redis = getRedis();

  if (redis) {
    try {
      const now = Date.now();
      const pipeline = redis.pipeline();

      for (const userId of userIds) {
        pipeline.zcount(presenceKey(userId), now, "+inf");
      }

      const rows = await pipeline.exec();

      userIds.forEach((userId, index) => {
        const row = rows?.[index];
        const count = row && !row[0] ? Number(row[1]) : 0;
        statuses.set(userId, count > 0);
      });

      return statuses;
    } catch (error) {
      logRedisFallback("snapshot", error);
    }
  }

  for (const userId of userIds) {
    statuses.set(userId, Boolean(localSockets.get(userId)?.size));
  }

  return statuses;
};

export const throttleTyping = async (
  userId: string,
  chatId: string,
): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const result = await redis.set(
        typingKey(userId, chatId),
        "1",
        "PX",
        TYPING_TTL_MS,
        "NX",
      );
      return result === "OK";
    } catch (error) {
      logRedisFallback("typing throttle", error);
    }
  }

  const key = typingKey(userId, chatId);
  const now = Date.now();
  const last = localTyping.get(key);

  if (last && now - last < TYPING_TTL_MS) return false;

  localTyping.set(key, now);
  return true;
};

export const clearTypingThrottle = async (
  userId: string,
  chatId: string,
): Promise<void> => {
  const key = typingKey(userId, chatId);
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      logRedisFallback("typing clear", error);
    }
  }

  localTyping.delete(key);
};

export const clearUserTyping = (userId: string): void => {
  localTyping.forEach((_, key) => {
    if (key.startsWith(`${TYPING_KEY_PREFIX}${userId}:`)) {
      localTyping.delete(key);
    }
  });
};
