import { describe, expect, test } from "bun:test";
import { assertPublicUrl, BlockedUrlError, isPublicIpv4, isPublicIpv6 } from "./ssrf-guard.ts";

describe("isPublicIpv4", () => {
  test("public addresses pass", () => {
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
    expect(isPublicIpv4("1.1.1.1")).toBe(true);
    expect(isPublicIpv4("93.184.216.34")).toBe(true);
  });

  test("private / reserved ranges blocked", () => {
    expect(isPublicIpv4("127.0.0.1")).toBe(false);
    expect(isPublicIpv4("10.0.0.1")).toBe(false);
    expect(isPublicIpv4("172.16.0.1")).toBe(false);
    expect(isPublicIpv4("172.31.255.255")).toBe(false);
    expect(isPublicIpv4("192.168.1.1")).toBe(false);
    expect(isPublicIpv4("169.254.169.254")).toBe(false); // cloud metadata
    expect(isPublicIpv4("0.0.0.0")).toBe(false);
    expect(isPublicIpv4("100.64.0.1")).toBe(false); // CGNAT
    expect(isPublicIpv4("224.0.0.1")).toBe(false); // multicast
  });

  test("172.32 is public (outside 172.16/12)", () => {
    expect(isPublicIpv4("172.32.0.1")).toBe(true);
  });
});

describe("isPublicIpv6", () => {
  test("blocks loopback, link-local, ULA, multicast", () => {
    expect(isPublicIpv6("::1")).toBe(false);
    expect(isPublicIpv6("::")).toBe(false);
    expect(isPublicIpv6("fe80::1")).toBe(false);
    expect(isPublicIpv6("fd00::1")).toBe(false);
    expect(isPublicIpv6("fc00::1")).toBe(false);
    expect(isPublicIpv6("ff02::1")).toBe(false);
  });

  test("v4-mapped inherits v4 rules", () => {
    expect(isPublicIpv6("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIpv6("::ffff:8.8.8.8")).toBe(true);
  });

  test("public v6 passes", () => {
    expect(isPublicIpv6("2606:4700:4700::1111")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  test("rejects non-http protocols", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  test("rejects localhost by name", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://foo.localhost")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  test("rejects literal private IPs without DNS", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    await expect(assertPublicUrl("http://[::1]/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://192.168.0.1/")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  test("rejects malformed URL", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  test("allows a public literal IP", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeUndefined();
  });
});
