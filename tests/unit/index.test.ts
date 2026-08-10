import { describe, expect, it } from "vitest";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { fetchSwapiJson, parseAllowedOrigins, parsePort, parseTrustProxy } from "../../index.js";

describe("parseAllowedOrigins", () => {
  it("parses comma-separated origins", () => {
    const origins = parseAllowedOrigins("http://localhost:3000, https://example.com");
    expect(origins).toEqual(["http://localhost:3000", "https://example.com"]);
  });

  it("uses defaults when value is undefined", () => {
    const origins = parseAllowedOrigins(undefined);
    expect(origins.length).toBeGreaterThan(0);
  });
});

describe("parsePort", () => {
  it("uses fallback when undefined", () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
  });

  it("throws for invalid values", () => {
    expect(() => parsePort("abc", 3000)).toThrow("Invalid PORT value");
  });
});

describe("parseTrustProxy", () => {
  it("uses fallback when undefined", () => {
    expect(parseTrustProxy(undefined, 1)).toBe(1);
  });

  it("parses boolean true and false", () => {
    expect(parseTrustProxy("true", 1)).toBe(true);
    expect(parseTrustProxy("false", 1)).toBe(false);
  });

  it("parses non-negative integer values", () => {
    expect(parseTrustProxy("0", 1)).toBe(0);
    expect(parseTrustProxy("2", 1)).toBe(2);
  });

  it("throws for invalid values", () => {
    expect(() => parseTrustProxy("abc", 1)).toThrow("Invalid TRUST_PROXY value");
  });
});

describe("fetchSwapiJson", () => {
  it("returns parsed json for successful response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const response = await fetchSwapiJson(fetchImpl, "/people/?search=luke");
    expect(response).toEqual({ ok: true });
  });

  it("throws for non-2xx responses", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      });

    await expect(fetchSwapiJson(fetchImpl, "/planets/999/")).rejects.toThrow("404");
  });

  it("throws for network failures", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("network down");
    };

    await expect(fetchSwapiJson(fetchImpl, "/films/1/")).rejects.toThrow("network down");
  });
});

describe("stdio startup logging", () => {
  it("does not write non-protocol output to stdout", async () => {
    const currentFile = fileURLToPath(import.meta.url);
    const projectRoot = resolve(dirname(currentFile), "../..");

    const child = spawn("node", ["--import", "tsx", "index.ts"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ENABLE_HTTP: "0",
        ENABLE_STDIO: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutText = "";
    let stderrText = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutText += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrText += chunk;
    });

    await delay(350);
    expect(child.exitCode).toBeNull();

    child.kill("SIGTERM");
    await once(child, "exit");

    expect(stdoutText).toBe("");
    expect(stderrText).not.toContain('"level":"info"');
  });
});
