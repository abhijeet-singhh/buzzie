import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import {
  createDirectChat,
  registerUser,
  sendTextMessage,
} from "./helpers/api";

const app = createApp();

const setupChat = async () => {
  const alice = await registerUser(app, { name: "Alice" });
  const bob = await registerUser(app, { name: "Bob" });
  const chat = await createDirectChat(alice.agent, bob.user._id);
  return { alice, bob, chatId: chat._id };
};

describe("messages", () => {
  it("sends, lists, paginates, and backfills messages", async () => {
    const { alice, bob, chatId } = await setupChat();

    const first = await sendTextMessage(alice.agent, chatId, "hello world");
    const second = await sendTextMessage(bob.agent, chatId, "second message");
    const third = await sendTextMessage(alice.agent, chatId, "third message");

    const page = await alice.agent.get(
      `/api/v1/messages?chatId=${chatId}&limit=2`,
    );
    expect(page.status).toBe(200);
    expect(page.body.messages).toHaveLength(2);
    expect(page.body.messages[0]._id).toBe(third._id);
    expect(page.body.nextCursor).toBe(page.body.messages[1]._id);

    const nextPage = await alice.agent.get(
      `/api/v1/messages?chatId=${chatId}&limit=2&cursor=${page.body.nextCursor}`,
    );
    expect(nextPage.status).toBe(200);
    expect(nextPage.body.messages.map((m: any) => m._id)).toEqual([first._id]);

    const backfill = await alice.agent.get(
      `/api/v1/messages?chatId=${chatId}&since=1970-01-01T00:00:00.000Z&limit=2`,
    );
    expect(backfill.status).toBe(200);
    expect(backfill.body.messages[0]._id).toBe(first._id);
    expect(backfill.body.messages[1]._id).toBe(second._id);
    expect(backfill.body.nextSince).toBeTruthy();

    const conflict = await alice.agent.get(
      `/api/v1/messages?chatId=${chatId}&since=1970-01-01T00:00:00.000Z&cursor=${first._id}`,
    );
    expect(conflict.status).toBe(400);
  });

  it("edits only the sender's text messages", async () => {
    const { alice, bob, chatId } = await setupChat();
    const message = await sendTextMessage(alice.agent, chatId, "original");

    const notSender = await bob.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}`)
      .send({ content: "hijacked" });
    expect(notSender.status).toBe(404);

    const edited = await alice.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}`)
      .send({ content: "edited" });
    expect(edited.status).toBe(200);
    expect(edited.body.messageData.content).toBe("edited");
    expect(edited.body.messageData.editedAt).toBeTruthy();

    const empty = await alice.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}`)
      .send({ content: "   " });
    expect(empty.status).toBe(400);
  });

  it("pins, lists, and unpins messages", async () => {
    const { alice, bob, chatId } = await setupChat();
    const message = await sendTextMessage(alice.agent, chatId, "pin me");

    const pinned = await bob.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}/pin`)
      .send({ pinned: true });
    expect(pinned.status).toBe(200);
    expect(pinned.body.messageData.isPinned).toBe(true);

    const list = await alice.agent.get(
      `/api/v1/messages/pinned?chatId=${chatId}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.messages).toHaveLength(1);
    expect(list.body.messages[0]._id).toBe(message._id);

    const invalid = await alice.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}/pin`)
      .send({ pinned: "yes" });
    expect(invalid.status).toBe(400);

    const unpinned = await bob.agent
      .patch(`/api/v1/messages/${chatId}/${message._id}/pin`)
      .send({ pinned: false });
    expect(unpinned.status).toBe(200);
    expect(unpinned.body.messageData.isPinned).toBe(false);
  });

  it("searches messages with chat scoping", async () => {
    const { alice, bob, chatId } = await setupChat();
    await sendTextMessage(alice.agent, chatId, "unique needle phrase");
    await sendTextMessage(bob.agent, chatId, "another message");

    const search = await alice.agent.get(
      `/api/v1/messages/search?q=needle&chatId=${chatId}`,
    );
    expect(search.status).toBe(200);
    expect(search.body.pagination.total).toBe(1);
    expect(search.body.messages[0].content).toContain("needle");

    const outsidersChat = await alice.agent.get(
      `/api/v1/messages/search?q=needle&chatId=64b000000000000000000000`,
    );
    expect(outsidersChat.status).toBe(400);
  });

  it("rejects malformed media payloads before upload", async () => {
    const { alice, chatId } = await setupChat();

    const malformed = await alice.agent.post("/api/v1/messages").send({
      chatId,
      messageType: "image",
      mediaUrl: "not-a-url",
    });
    expect(malformed.status).toBe(400);

    const unsupportedMime = await alice.agent.post("/api/v1/messages").send({
      chatId,
      messageType: "image",
      mediaUrl: "data:application/x-msdownload;base64,AAAA",
    });
    expect(unsupportedMime.status).toBe(400);
    expect(unsupportedMime.body.message).toContain("Unsupported image type");
  });

  it("deletes only the sender's messages and hides them from lists", async () => {
    const { alice, bob, chatId } = await setupChat();
    const message = await sendTextMessage(alice.agent, chatId, "delete me");

    const notSender = await bob.agent.delete(
      `/api/v1/messages/${chatId}/${message._id}`,
    );
    expect(notSender.status).toBe(404);

    const deleted = await alice.agent.delete(
      `/api/v1/messages/${chatId}/${message._id}`,
    );
    expect(deleted.status).toBe(200);

    const list = await alice.agent.get(`/api/v1/messages?chatId=${chatId}`);
    expect(list.body.messages).toHaveLength(0);
  });

  it("rejects non-participants", async () => {
    const { chatId } = await setupChat();
    const outsider = await registerUser(app);

    const send = await outsider.agent.post("/api/v1/messages").send({
      chatId,
      messageType: "text",
      content: "should not work",
    });
    expect(send.status).toBe(400);

    const list = await outsider.agent.get(`/api/v1/messages?chatId=${chatId}`);
    expect(list.status).toBe(400);

    const single = await outsider.agent.get(`/api/v1/chats/${chatId}`);
    expect(single.status).toBe(404);
  });
});
