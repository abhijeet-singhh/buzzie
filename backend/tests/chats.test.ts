import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  createDirectChat,
  createGroupChat,
  registerUser,
  sendTextMessage,
} from "./helpers/api";

const app = createApp();

describe("chats", () => {
  it("creates a direct chat idempotently with pagination and unread counts", async () => {
    const alice = await registerUser(app, { name: "Alice" });
    const bob = await registerUser(app, { name: "Bob" });

    const first = await alice.agent
      .post("/api/v1/chats")
      .send({ participantId: bob.user._id });
    expect(first.status).toBe(201);

    const second = await alice.agent
      .post("/api/v1/chats")
      .send({ participantId: bob.user._id });
    expect(second.status).toBe(201);
    expect(second.body.chat._id).toBe(first.body.chat._id);

    let list = await alice.agent.get("/api/v1/chats");
    expect(list.status).toBe(200);
    expect(list.body.pagination).toMatchObject({
      page: 1,
      total: 1,
      totalPages: 1,
    });
    expect(list.body.chats[0].unreadCount).toBe(0);

    await sendTextMessage(bob.agent, first.body.chat._id, "hello Alice");

    list = await alice.agent.get("/api/v1/chats");
    expect(list.body.chats[0].unreadCount).toBe(1);

    const read = await alice.agent.patch(
      `/api/v1/messages/${first.body.chat._id}/read`,
    );
    expect(read.status).toBe(200);
    expect(read.body.lastReadAt).toBeTruthy();

    list = await alice.agent.get("/api/v1/chats");
    expect(list.body.chats[0].unreadCount).toBe(0);
  });

  it("paginates the chat list", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const carol = await registerUser(app);

    await createDirectChat(alice.agent, bob.user._id);
    await createDirectChat(alice.agent, carol.user._id);

    const pageOne = await alice.agent.get("/api/v1/chats?page=1&limit=1");
    expect(pageOne.status).toBe(200);
    expect(pageOne.body.chats).toHaveLength(1);
    expect(pageOne.body.pagination.total).toBe(2);
    expect(pageOne.body.pagination.totalPages).toBe(2);

    const pageTwo = await alice.agent.get("/api/v1/chats?page=2&limit=1");
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.chats).toHaveLength(1);
    expect(pageTwo.body.chats[0]._id).not.toBe(pageOne.body.chats[0]._id);
  });

  it("creates group chats and validates group rules", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const carol = await registerUser(app);

    const group = await createGroupChat(alice.agent, [
      bob.user._id,
      carol.user._id,
    ]);
    expect(group._id).toBeTruthy();

    const duplicateParticipants = await alice.agent.post("/api/v1/chats").send({
      isGroup: true,
      participants: [bob.user._id, bob.user._id],
      groupName: "Bad group",
    });
    expect(duplicateParticipants.status).toBe(400);

    const selfChat = await alice.agent
      .post("/api/v1/chats")
      .send({ participantId: alice.user._id });
    expect(selfChat.status).toBe(400);

    const missingUser = await alice.agent.post("/api/v1/chats").send({
      isGroup: true,
      participants: [bob.user._id, "64b000000000000000000000"],
      groupName: "Missing user",
    });
    expect(missingUser.status).toBe(404);
  });

  it("returns 400 for malformed ids and pagination parameters", async () => {
    const alice = await registerUser(app);

    const invalidId = await alice.agent.get("/api/v1/chats/not-an-object-id");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.issues[0].code).toBe("invalid_format");

    const invalidPage = await alice.agent.get("/api/v1/chats?page=0");
    expect(invalidPage.status).toBe(400);
  });
});
