import type { JobSummary } from "../repositories/storage.ts";

const MAX_TREE_LINES = 200;

/** Indented path tree over all mapped pages — IA evidence for the rebuild agent. */
export function buildSiteTree(job: JobSummary): string {
  interface TreeNode {
    children: Map<string, TreeNode>;
  }
  const root: TreeNode = { children: new Map() };
  for (const page of Object.values(job.pages)) {
    let segments: string[];
    try {
      segments = new URL(page.url).pathname.split("/").filter(Boolean);
    } catch {
      continue;
    }
    let node = root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
  }

  const lines: string[] = ["/"];
  const render = (node: TreeNode, depth: number): void => {
    for (const [segment, child] of [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (lines.length >= MAX_TREE_LINES) return;
      lines.push(`${"  ".repeat(depth + 1)}${segment}`);
      render(child, depth + 1);
    }
  };
  render(root, 0);
  if (lines.length >= MAX_TREE_LINES) lines.push("  …");
  return lines.join("\n");
}
