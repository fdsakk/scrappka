import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for user-supplied scrape targets. The scraper fetches arbitrary
 * URLs on behalf of a user, so every target — and every redirect hop — must be
 * confined to public destinations. Blocks non-http(s) schemes and any hostname
 * that resolves to a loopback, private, link-local or otherwise non-routable
 * address.
 *
 * Not a defense against a TOCTOU DNS-rebind between this check and `fetch`'s own
 * resolution (that needs a custom dialer). It does cover the realistic attacks:
 * a literal private URL, a hostname pointing at an internal IP, and a redirect
 * into private space (re-check `res.url` after every fetch).
 */
export class BlockedUrlError extends Error {}

export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(`Unsupported protocol: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new BlockedUrlError(`Blocked host: ${host}`);
  }

  // Literal IP in the URL — validate directly, no DNS.
  const literalFamily = isIP(stripBrackets(host));
  if (literalFamily !== 0) {
    assertPublicIp(stripBrackets(host));
    return;
  }

  // Hostname — resolve every A/AAAA record and reject if any is non-public.
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`Cannot resolve host: ${host}`);
  }
  if (records.length === 0) throw new BlockedUrlError(`Host has no addresses: ${host}`);
  for (const { address } of records) assertPublicIp(address);
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function assertPublicIp(ip: string): void {
  const family = isIP(ip);
  if (family === 4) {
    if (!isPublicIpv4(ip)) throw new BlockedUrlError(`Blocked non-public address: ${ip}`);
    return;
  }
  if (family === 6) {
    if (!isPublicIpv6(ip)) throw new BlockedUrlError(`Blocked non-public address: ${ip}`);
    return;
  }
  throw new BlockedUrlError(`Not an IP address: ${ip}`);
}

export function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 192 && b === 0 && parts[2] === 0) return false; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking 198.18/15
  if (a >= 224) return false; // multicast + reserved 224.0.0.0/3
  return true;
}

export function isPublicIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // drop zone id
  if (addr === "::" || addr === "::1") return false; // unspecified / loopback

  // IPv4-mapped/compatible (::ffff:x.x.x.x, ::x.x.x.x) — validate the v4 tail.
  const v4tail = addr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4tail) return isPublicIpv4(v4tail[1]);

  if (addr.startsWith("fe80")) return false; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return false; // ULA fc00::/7
  if (addr.startsWith("ff")) return false; // multicast
  return true;
}
