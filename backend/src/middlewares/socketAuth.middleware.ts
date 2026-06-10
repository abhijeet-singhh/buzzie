import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Env } from "../config/env.config";

const COOKIE_NAME = "accessToken";

export interface AuthenticatedSocket extends Socket {
  userId: string;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
) => {
  try {
    const rawCookie = socket.handshake.headers.cookie;
    if (!rawCookie) {
      return next(new Error("Unauthorized: No cookie provided"));
    }

    const cookies = parseCookies(rawCookie);
    const token = cookies[COOKIE_NAME];
    if (!token) {
      return next(new Error("Unauthorized: No access token"));
    }

    const decoded = jwt.verify(token, Env.JWT_SECRET) as { userId: string };
    if (!decoded?.userId) {
      return next(new Error("Unauthorized: Invalid token payload"));
    }

    (socket as AuthenticatedSocket).userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error("Unauthorized: Invalid or expired token"));
  }
};
