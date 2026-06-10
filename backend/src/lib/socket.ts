import { Server as HTTPServer } from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { Env } from "../config/env.config";
import { setupRedisAdapter } from "../config/redis.config";
import {
  socketAuthMiddleware,
  type AuthenticatedSocket,
} from "../middlewares/socketAuth.middleware";
import UserModel from "../models/user.model";
import ChatModel from "../models/chat.model";
import { validateChatParticipant } from "../services/chat.service";

let io: Server | null = null;

const onlineUsers = new Map<string, Set<string>>();
const typingThrottle = new Map<string, number>();

const TYPING_THROTTLE_MS = 2000;

export const initializeSocket = (httpServer: HTTPServer) => {
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

    const wasOffline = !onlineUsers.has(userId);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

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

    socket.on("typing:start", (chatId: string) => {
      const key = `${userId}:${chatId}`;
      const now = Date.now();
      const last = typingThrottle.get(key);
      if (last && now - last < TYPING_THROTTLE_MS) return;

      typingThrottle.set(key, now);
      socket.to(`chat:${chatId}`).emit("typing:start", { userId, chatId });
    });

    socket.on("typing:stop", (chatId: string) => {
      if (chatId) {
        socket.to(`chat:${chatId}`).emit("typing:stop", { userId, chatId });
      }
    });

    socket.on("disconnect", async () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);

        typingThrottle.forEach((_, key) => {
          if (key.startsWith(`${userId}:`)) typingThrottle.delete(key);
        });

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          await UserModel.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });

          io?.emit("user:offline", { userId });
        }
      }
    });
  });
};

function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export const emitNewChatToParticipants = (
  participantIds: string[],
  chat: Record<string, any>,
) => {
  const instance = getIO();
  for (const participantId of participantIds) {
    instance.to(`user:${participantId}`).emit("chat:new", chat);
  }
};

export const emitNewMessageToChatRoom = (
  chatId: string,
  message: Record<string, any>,
) => {
  getIO().to(`chat:${chatId}`).emit("message:new", message);
};

export const emitLastMessageToParticipants = (
  participantIds: string[],
  chatId: string,
  lastMessage: Record<string, any>,
) => {
  const instance = getIO();
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
    .to(`chat:${chatId}`)
    .emit("message:read", { chatId, userId, lastReadAt });
};

export const emitMessageDeleted = (chatId: string, messageId: string) => {
  getIO()
    .to(`chat:${chatId}`)
    .emit("message:deleted", { chatId, messageId });
};

export const emitChatUpdated = (chat: Record<string, any>) => {
  const instance = getIO();
  const participantIds: string[] = chat.participants?.map((p: any) =>
    typeof p === "string" ? p : p._id?.toString() || p.toString(),
  );
  for (const participantId of participantIds) {
    instance.to(`user:${participantId}`).emit("chat:updated", chat);
  }
};

export const isUserOnline = (userId: string): boolean => {
  return onlineUsers.has(userId);
};

export const getUserSocketIds = (userId: string): string[] => {
  const sockets = onlineUsers.get(userId);
  return sockets ? Array.from(sockets) : [];
};
