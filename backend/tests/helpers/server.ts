import http from "http";
import type { AddressInfo } from "net";
import { createApp } from "../../src/app";
import { closeSocket, initializeSocket } from "../../src/lib/socket";

export const createTestServer = async () => {
  const app = createApp();
  const server = http.createServer(app);
  initializeSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  return {
    app,
    server,
    url: `http://127.0.0.1:${port}`,
  };
};

export const closeTestServer = async (server: http.Server) => {
  await closeSocket();

  if (server.listening) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
};
