import { describe, expect, it } from "vitest";
import { fetchSwapiJson, parseAllowedOrigins, parsePort } from "../../index.js";

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
