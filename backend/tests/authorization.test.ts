import { describe, expect, it } from "vitest";
import ChatModel from "../src/models/chat.model";
import { createApp } from "../src/app";
import {
  createDirectChat,
  createGroupChat,
  registerUser,
} from "./helpers/api";

const app = createApp();

describe("authorization and group lifecycle", () => {
  it("enforces group admin permissions for add/remove member", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const carol = await registerUser(app);
    const dave = await registerUser(app);

    const group = await createGroupChat(alice.agent, [
      bob.user._id,
      carol.user._id,
    ]);

    const memberCannotAdd = await bob.agent
      .patch(`/api/v1/chats/${group._id}/members/add`)
      .send({ userId: dave.user._id });
    expect(memberCannotAdd.status).toBe(403);

    const adminAdds = await alice.agent
      .patch(`/api/v1/chats/${group._id}/members/add`)
      .send({ userId: dave.user._id });
    expect(adminAdds.status).toBe(200);

    const memberCannotRemove = await bob.agent
      .patch(`/api/v1/chats/${group._id}/members/remove`)
      .send({ userId: dave.user._id });
    expect(memberCannotRemove.status).toBe(403);

    const adminRemoves = await alice.agent
      .patch(`/api/v1/chats/${group._id}/members/remove`)
      .send({ userId: dave.user._id });
    expect(adminRemoves.status).toBe(200);

    const removeSelf = await alice.agent
      .patch(`/api/v1/chats/${group._id}/members/remove`)
      .send({ userId: alice.user._id });
    expect(removeSelf.status).toBe(400);
  });

  it("lets members leave groups and transfers creator ownership", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const carol = await registerUser(app);
    const dave = await registerUser(app);

    const group = await createGroupChat(alice.agent, [
      bob.user._id,
      carol.user._id,
      dave.user._id,
    ]);

    const bobLeaves = await bob.agent.delete(
      `/api/v1/chats/${group._id}/members/me`,
    );
    expect(bobLeaves.status).toBe(200);

    const aliceLeaves = await alice.agent.delete(
      `/api/v1/chats/${group._id}/members/me`,
    );
    expect(aliceLeaves.status).toBe(200);

    const stored = await ChatModel.findById(group._id).lean();
    expect(stored).toBeTruthy();
    expect(stored?.participants.map((id) => id.toString())).toEqual(
      expect.arrayContaining([carol.user._id, dave.user._id]),
    );
    expect(stored?.createdBy.toString()).not.toBe(alice.user._id);
    expect(stored?.admins?.map((id) => id.toString())).not.toContain(
      alice.user._id,
    );
  });

  it("rejects leaving direct chats and leaving groups below minimum size", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const carol = await registerUser(app);

    const direct = await createDirectChat(alice.agent, bob.user._id);
    const directLeave = await alice.agent.delete(
      `/api/v1/chats/${direct._id}/members/me`,
    );
    expect(directLeave.status).toBe(400);

    const group = await createGroupChat(alice.agent, [
      bob.user._id,
      carol.user._id,
    ]);
    const bobLeaves = await bob.agent.delete(
      `/api/v1/chats/${group._id}/members/me`,
    );
    expect(bobLeaves.status).toBe(200);

    const carolLeaves = await carol.agent.delete(
      `/api/v1/chats/${group._id}/members/me`,
    );
    expect(carolLeaves.status).toBe(400);
  });

  it("updates the current user's profile with strict validation", async () => {
    const alice = await registerUser(app);

    const updated = await alice.agent
      .patch("/api/v1/users/me")
      .send({ name: "Alice Updated", avatar: "https://example.com/a.png" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Alice Updated");
    expect(updated.body.data.avatar).toBe("https://example.com/a.png");

    const empty = await alice.agent.patch("/api/v1/users/me").send({});
    expect(empty.status).toBe(400);

    const extra = await alice.agent
      .patch("/api/v1/users/me")
      .send({ name: "Nope", isOnline: true });
    expect(extra.status).toBe(400);
  });

  it("returns presence snapshots for requested users", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const response = await alice.agent.get(
      `/api/v1/users/presence?ids=${bob.user._id}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.presences).toHaveLength(1);
    expect(response.body.presences[0]).toMatchObject({
      userId: bob.user._id,
      isOnline: false,
    });
  });
});
