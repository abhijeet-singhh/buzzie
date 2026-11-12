import { Server as HTTPServer } from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { Env } from "../config/env.config";
import { logger } from "./logger";
import { setupRedisAdapter } from "../config/redis.config";
import {
  socketAuthMiddleware,
  type AuthenticatedSocket,
} from "../middlewares/socketAuth.middleware";
import UserModel from "../models/user.model";
import ChatModel from "../models/chat.model";
import { validateChatParticipant } from "../services/chat.service";
import {
  addUserSocket,
  clearTypingThrottle,
  clearUserTyping,
  isUserOnline as isUserOnlineInPresence,
  refreshUserSocket,
  removeUserSocket,
  throttleTyping,
} from "./presence";

let io: Server | null = null;

const PRESENCE_HEARTBEAT_MS = 30_000;

export const initializeSocket = (httpServer: HTTPServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: Env.FRONTEND_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  setupRedisAdapter(io);

  io.use(socketAuthMiddleware);

  io.on("connection", async (socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const userId = authedSocket.userId;

    const wasOffline = await addUserSocket(userId, socket.id);
    const presenceHeartbeat = setInterval(() => {
      void refreshUserSocket(userId, socket.id);
    }, PRESENCE_HEARTBEAT_MS);
    presenceHeartbeat.unref?.();

    await UserModel.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
    });

    if (wasOffline) {
      io?.emit("user:online", { userId });
    }

    socket.join(`user:${userId}`);

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chats = await ChatModel.find({ participants: userObjectId })
      .select("_id")
      .lean();

    for (const chat of chats) {
      socket.join(`chat:${chat._id.toString()}`);
    }

    socket.on(
      "chat:join",
      async (chatId: string, callback?: (err?: string) => void) => {
        try {
          await validateChatParticipant(chatId, userId);
          socket.join(`chat:${chatId}`);
          callback?.();
        } catch {
          callback?.("Unauthorized: You are not a participant in this chat");
        }
      },
    );

    socket.on("chat:leave", (chatId: string) => {
      if (chatId) {
        socket.leave(`chat:${chatId}`);
      }
    });

    socket.on("typing:start", async (chatId: string) => {
      if (!chatId) return;

      try {
        const allowed = await throttleTyping(userId, chatId);
        if (!allowed) return;

        socket.to(`chat:${chatId}`).emit("typing:start", { userId, chatId });
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : error },
          "Error handling typing:start",
        );
      }
    });

    socket.on("typing:stop", async (chatId: string) => {
      if (!chatId) return;

      try {
        await clearTypingThrottle(userId, chatId);
        socket.to(`chat:${chatId}`).emit("typing:stop", { userId, chatId });
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : error },
          "Error handling typing:stop",
        );
      }
    });

    socket.on("disconnect", async () => {
      clearInterval(presenceHeartbeat);
      clearUserTyping(userId);

      try {
        const nowOffline = await removeUserSocket(userId, socket.id);

        if (nowOffline) {
          await UserModel.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });

          io?.emit("user:offline", { userId });
        }
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : error },
          "Error during socket disconnect",
        );
      }
    });
  });

  return io;
};

export const closeSocket = async (): Promise<void> => {
  if (!io) return;

  const instance = io;
  io = null;

  await new Promise<void>((resolve) => {
    instance.close(() => resolve());
  });
};

function getIO(): Server | null {
  return io;
}

export const emitNewChatToParticipants = (
  participantIds: string[],
  chat: Record<string, any>,
) => {
  const instance = getIO();
  if (!instance) return;

  for (const participantId of participantIds) {
    instance.to(`user:${participantId}`).emit("chat:new", chat);
  }
};

export const emitNewMessageToChatRoom = (
  chatId: string,
  message: Record<string, any>,
) => {
  getIO()?.to(`chat:${chatId}`).emit("message:new", message);
};

export const emitLastMessageToParticipants = (
  participantIds: string[],
  chatId: string,
  lastMessage: Record<string, any>,
) => {
  const instance = getIO();
  if (!instance) return;

  const payload = { chatId, lastMessage };
  for (const participantId of participantIds) {
    instance.to(`user:${participantId}`).emit("chat:update", payload);
  }
};

export const emitMessageRead = (
  chatId: string,
  userId: string,
  lastReadAt: Date,
) => {
  getIO()
    ?.to(`chat:${chatId}`)
    .emit("message:read", { chatId, userId, lastReadAt });
};

export const emitMessageDeleted = (chatId: string, messageId: string) => {
  getIO()
    ?.to(`chat:${chatId}`)
    .emit("message:deleted", { chatId, messageId });
};

export const emitMessageUpdated = (
  chatId: string,
  message: Record<string, any>,
) => {
  getIO()?.to(`chat:${chatId}`).emit("message:updated", message);
};

export const emitChatUpdated = (chat: Record<string, any>) => {
  const instance = getIO();
  if (!instance) return;

  const participantIds: string[] = chat.participants?.map((p: any) =>
    typeof p === "string" ? p : p._id?.toString() || p.toString(),
  );
  for (const participantId of participantIds) {
    instance.to(`user:${participantId}`).emit("chat:updated", chat);
  }
};

export const emitChatRemoved = (userId: string, chatId: string) => {
  const instance = getIO();
  if (!instance) return;

  instance.to(`user:${userId}`).emit("chat:removed", { chatId });
  instance.in(`user:${userId}`).socketsLeave(`chat:${chatId}`);
};

export const isUserOnline = (userId: string): Promise<boolean> => {
  return isUserOnlineInPresence(userId);
};

export const getUserSocketIds = async (userId: string): Promise<string[]> => {
  const instance = getIO();
  if (!instance) return [];

  const sockets = await instance.in(`user:${userId}`).fetchSockets();
  return sockets.map((socket) => socket.id);
};
