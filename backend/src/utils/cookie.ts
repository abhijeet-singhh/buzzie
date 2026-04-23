import jwt from "jsonwebtoken";
import { Response } from "express";
import ms from "ms";
import { Env } from "../config/env.config";

type Time = `${number}${"s" | "m" | "h" | "d" | "w" | "y"}`;

type JwtPayload = {
  userId: string;
};

type CookieParams = {
  res: Response;
  userId: string;
};

const COOKIE_NAME = "accessToken";

// Convert env safely (still recommend validating env separately)
const getExpiresIn = (): Time => {
  return (Env.JWT_EXPIRES_IN as Time) || "7d";
};

export const setJwtAuthCookie = ({ res, userId }: CookieParams) => {
  const expiresIn = getExpiresIn();

  const maxAge = ms(expiresIn);
  if (!maxAge) {
    throw new Error("Invalid JWT_EXPIRES_IN format");
  }

  const token = jwt.sign({ userId } satisfies JwtPayload, Env.JWT_SECRET, {
    audience: ["user"],
    issuer: "Buzzie",
    expiresIn,
  });

  res.cookie(COOKIE_NAME, token, {
    maxAge,
    httpOnly: true,
    secure: Env.NODE_ENV === "production",
    sameSite: "lax", // safer default for most apps
    path: "/", // ensure consistency with clearCookie
  });

  return res;
};

export const clearJwtAuthCookie = (res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: Env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return res;
};
