import { createApp } from "./api/app.ts";
import { serverConfig } from "./config/env.ts";

const app = createApp();

const { port } = serverConfig();
const server = process.env.NODE_ENV === "test" ? null : Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 });

if (server) console.log(`[server] listening on http://localhost:${server.port}`);

export { app };
