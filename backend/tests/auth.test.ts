import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { loginUser, registerUser } from "./helpers/api";

const app = createApp();

describe("auth and health", () => {
  it("registers a user, sets an httpOnly cookie, and exposes safe fields", async () => {
    const { user, cookie } = await registerUser(app);

    expect(user._id).toBeTruthy();
    expect(user.email).toContain("@example.com");
    expect(user).not.toHaveProperty("password");
    expect(cookie).toMatch(/^accessToken=/);
  });

  it("rejects duplicate registrations", async () => {
    const { email } = await registerUser(app);

    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Duplicate",
      email,
      password: "Password123!",
    });

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("ERR_BAD_REQUEST");
  });

  it("returns validation details for malformed registration input", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "", email: "not-an-email", password: "123" });

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("ERR_BAD_REQUEST");
    expect(Array.isArray(response.body.issues)).toBe(true);
    expect(response.body.issues.length).toBeGreaterThan(0);
  });

  it("logs in, reports auth status, and rejects bad credentials", async () => {
    const { email, password, agent } = await registerUser(app);

    const status = await agent.get("/api/v1/auth/status");
    expect(status.status).toBe(200);
    expect(status.body.data.email).toBe(email);

    const badLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "WrongPassword!" });
    expect(badLogin.status).toBe(401);

    const { agent: freshAgent } = await loginUser(app, email, password);
    const freshStatus = await freshAgent.get("/api/v1/auth/status");
    expect(freshStatus.status).toBe(200);
  });

  it("protects authenticated routes and supports logout", async () => {
    const unauthenticated = await request(app).get("/api/v1/chats");
    expect(unauthenticated.status).toBe(401);

    const { agent } = await registerUser(app);
    const logout = await agent.post("/api/v1/auth/logout");
    expect(logout.status).toBe(200);

    const afterLogout = await agent.get("/api/v1/auth/status");
    expect(afterLogout.status).toBe(401);
  });

  it("reports health and assigns request ids", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["access-control-expose-headers"]).toContain(
      "x-request-id",
    );

    const propagated = await request(app)
      .get("/health")
      .set("x-request-id", "test-request-id");
    expect(propagated.headers["x-request-id"]).toBe("test-request-id");
  });
});
