import { randomUUID } from "crypto";
import type { Express } from "express";
import request from "supertest";

export type TestAgent = ReturnType<typeof request.agent>;

export type TestUser = {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
};

const extractCookie = (setCookie: string[] | string | undefined): string => {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("Expected an auth cookie in the response");
  return raw.split(";")[0];
};

export const registerUser = async (
  app: Express,
  overrides: { name?: string; email?: string; password?: string } = {},
) => {
  const suffix = randomUUID().replace(/[^a-f]/g, "").slice(0, 8);
  const email = overrides.email ?? `user-${suffix}@example.com`;
  const password = overrides.password ?? "Password123!";
  const agent = request.agent(app);

  const response = await agent.post("/api/v1/auth/register").send({
    name: overrides.name ?? `User ${suffix}`,
    email,
    password,
  });

  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${response.text}`);
  }

  return {
    agent,
    user: response.body.data as TestUser,
    email,
    password,
    cookie: extractCookie(response.headers["set-cookie"]),
  };
};

export const loginUser = async (
  app: Express,
  email: string,
  password: string,
) => {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/v1/auth/login")
    .send({ email, password });

  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} ${response.text}`);
  }

  return {
    agent,
    user: response.body.data as TestUser,
    cookie: extractCookie(response.headers["set-cookie"]),
  };
};

export const createDirectChat = async (
  agent: TestAgent,
  participantId: string,
) => {
  const response = await agent
    .post("/api/v1/chats")
    .send({ participantId });

  if (response.status !== 201) {
    throw new Error(`Chat creation failed: ${response.status} ${response.text}`);
  }

  return response.body.chat as { _id: string };
};

export const createGroupChat = async (
  agent: TestAgent,
  participants: string[],
  groupName = "Test group",
) => {
  const response = await agent.post("/api/v1/chats").send({
    isGroup: true,
    participants,
    groupName,
  });

  if (response.status !== 201) {
    throw new Error(`Group creation failed: ${response.status} ${response.text}`);
  }

  return response.body.chat as { _id: string };
};

export const sendTextMessage = async (
  agent: TestAgent,
  chatId: string,
  content: string,
) => {
  const response = await agent
    .post("/api/v1/messages")
    .send({ chatId, messageType: "text", content });

  if (response.status !== 201) {
    throw new Error(`Send message failed: ${response.status} ${response.text}`);
  }

  return response.body.messageData as {
    _id: string;
    content: string;
    createdAt: string;
  };
};
