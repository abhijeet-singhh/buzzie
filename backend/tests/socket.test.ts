import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  createDirectChat,
  registerUser,
  sendTextMessage,
} from "./helpers/api";
import { closeTestServer, createTestServer } from "./helpers/server";

type TestServer = Awaited<ReturnType<typeof createTestServer>>;
let testServer: TestServer;

beforeAll(async () => {
  testServer = await createTestServer();
});

afterAll(async () => {
  await closeTestServer(testServer.server);
});

const waitForSocketEvent = <T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 3000,
) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });

const connectSocket = (cookie: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = createClient(testServer.url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });

describe("socket integration", () => {
  it("rejects unauthenticated socket connections", async () => {
    const socket = createClient(testServer.url, {
      transports: ["websocket"],
      reconnection: false,
    });

    const error = await new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for connect_error")),
        3000,
      );
      socket.once("connect_error", (err: Error) => {
        clearTimeout(timer);
        resolve(err);
      });
    });

    expect(error.message).toMatch(/unauthorized/i);
    socket.close();
  });

  it("delivers presence, chat, message, and edit events", async () => {
    const alice = await registerUser(testServer.app);
    const bob = await registerUser(testServer.app);

    const aliceSocket = await connectSocket(alice.cookie);

    const bobOnline = waitForSocketEvent<{ userId: string }>(
      aliceSocket,
      "user:online",
      (payload) => payload.userId === bob.user._id,
    );
    const bobSocket = await connectSocket(bob.cookie);
    expect(await bobOnline).toEqual({ userId: bob.user._id });

    const chatCreated = waitForSocketEvent<{ _id: string }>(
      aliceSocket,
      "chat:new",
      (payload) => payload._id !== undefined,
    );
    const chat = await createDirectChat(alice.agent, bob.user._id);
    expect((await chatCreated)._id).toBe(chat._id);

    await new Promise<void>((resolve, reject) => {
      aliceSocket.emit("chat:join", chat._id, (err?: string) => {
        if (err) reject(new Error(err));
        else resolve();
      });
    });

    const messageReceived = waitForSocketEvent<{ _id: string }>(
      aliceSocket,
      "message:new",
      (payload) => payload._id !== undefined,
    );
    const message = await sendTextMessage(bob.agent, chat._id, "socket hello");
    expect((await messageReceived)._id).toBe(message._id);

    const updatedReceived = waitForSocketEvent<{ content: string }>(
      aliceSocket,
      "message:updated",
      (payload) => payload.content === "socket edited",
    );
    const edit = await bob.agent
      .patch(`/api/v1/messages/${chat._id}/${message._id}`)
      .send({ content: "socket edited" });
    expect(edit.status).toBe(200);

    expect((await updatedReceived).content).toBe("socket edited");

    bobSocket.close();
    aliceSocket.close();
  });
});
