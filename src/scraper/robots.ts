export interface RobotsMatcher {
  isAllowed(url: URL): boolean;
}

interface RobotsRule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

/**
 * Minimal robots.txt matcher: picks the most specific user-agent group
 * (our UA token over `*`), then applies longest-match-wins Allow/Disallow
 * with `*` and `$` wildcard support. Null/unfetchable robots allows all.
 */
export function createRobotsMatcher(robotsText: string | null, userAgent: string): RobotsMatcher {
  if (!robotsText) return { isAllowed: () => true };

  const uaLower = userAgent.toLowerCase();
  const groups = new Map<string, { allow: boolean; path: string }[]>();
  let currentAgents: string[] = [];
  let rulesSeen = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (rulesSeen) {
        currentAgents = [];
        rulesSeen = false;
      }
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (!groups.has(agent)) groups.set(agent, []);
    } else if (key === "allow" || key === "disallow") {
      rulesSeen = true;
      if (!value && key === "disallow") continue;
      for (const agent of currentAgents) {
        groups.get(agent)?.push({ allow: key === "allow", path: value });
      }
    }
  }

  let selected: { allow: boolean; path: string }[] | undefined;
  let bestMatch = -1;
  for (const [agent, ruleList] of groups) {
    if (agent === "*") continue;
    if (uaLower.includes(agent) && agent.length > bestMatch) {
      bestMatch = agent.length;
      selected = ruleList;
    }
  }
  if (!selected) selected = groups.get("*");
  if (!selected || selected.length === 0) return { isAllowed: () => true };

  const rules: RobotsRule[] = selected
    .filter((r) => r.path)
    .map((r) => ({ allow: r.allow, pattern: robotsPathRegex(r.path), length: r.path.length }));

  return {
    isAllowed(url: URL): boolean {
      const target = url.pathname + url.search;
      let winner: RobotsRule | null = null;
      for (const rule of rules) {
        if (!rule.pattern.test(target)) continue;
        if (!winner || rule.length > winner.length || (rule.length === winner.length && rule.allow && !winner.allow)) {
          winner = rule;
        }
      }
      return winner ? winner.allow : true;
    },
  };
}

function robotsPathRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = anchored ? path.slice(0, -1) : path;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}
