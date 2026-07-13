import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { serveStatic } from "hono/bun";

import { serverConfig } from "../config/env.ts";
import { filesRoutes } from "./routes/files.routes.ts";
import { projectsRoutes } from "./routes/projects.routes.ts";
import { siteRoutes } from "./routes/site.routes.ts";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  const config = serverConfig();
  if (config.auth) {
    const authenticate = basicAuth({ username: config.auth.username, password: config.auth.password });
    app.use("*", (c, next) => {
      if (c.req.path === "/api/health") return next();
      return authenticate(c, next);
    });
    console.log(`[server] basic auth enabled (user: ${config.auth.username})`);
  }

  app.get("/", (c) => c.redirect("/app"));
  app.use(
    "/app/*",
    serveStatic({
      root: "./client/dist",
      rewriteRequestPath: (path) => path.replace(/^\/app/, "") || "/",
    }),
  );
  app.get("/app", serveStatic({ path: "./client/dist/index.html" }));
  app.get("/app/*", serveStatic({ path: "./client/dist/index.html" }));

  app.route("/api/app", projectsRoutes);
  app.route("/api/app/site", siteRoutes);
  app.route("/api", filesRoutes);

  return app;
}
