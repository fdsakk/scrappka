import { Hono } from "hono";
import type { Context } from "hono";

import { resolvePagePath } from "../../repositories/storage.ts";

const PREVIEWABLE_EXTENSIONS = [".html", ".md", ".tsx"] as const;

export const filesRoutes = new Hono();

filesRoutes.get("/page-preview", async (c) => {
  const filename = c.req.query("file") ?? "";
  if (!PREVIEWABLE_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
    return c.text(`Preview supports ${PREVIEWABLE_EXTENSIONS.join(", ")}`, 400);
  }
  return servePageFile(c, "inline");
});

filesRoutes.get("/page-download", async (c) => {
  return servePageFile(c, "attachment");
});

async function servePageFile(c: Context, disposition: "inline" | "attachment") {
  const filename = c.req.query("file") ?? "";
  try {
    const path = resolvePagePath(c.req.query("job") ?? "", c.req.query("slug") ?? "", filename);
    const file = Bun.file(path);
    if (!(await file.exists())) return c.text("File not found", 404);
    return new Response(file, {
      headers: {
        "Content-Type": contentTypeFor(filename),
        "Content-Disposition": `${disposition}; filename="${filename.replace(/["/\\]/g, "_")}"`,
      },
    });
  } catch (err) {
    return c.text(errorMessage(err), 400);
  }
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".html")) return "text/html; charset=utf-8";
  if (filename.endsWith(".tsx")) return "text/plain; charset=utf-8";
  if (filename.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
