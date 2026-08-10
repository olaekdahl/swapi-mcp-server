import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { createApp } from "../../index.js";

let server: HttpServer;
let baseUrl: string;

beforeAll(async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);

    if (url.includes("/planets/1/")) {
      return new Response(JSON.stringify({ name: "Tatooine" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const app = createApp({
    fetchImpl,
    allowedOrigins: ["http://localhost:3000"],
  });

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not determine test server address.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe("MCP HTTP endpoint", () => {
  it("returns registered tools from tools/list", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).toContain("search_character");
    expect(bodyText).toContain("get_planet");
    expect(bodyText).toContain("get_film");
    expect(bodyText).toContain("get_internal_character_fact");
  });

  it("calls get_planet tool via tools/call", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_planet",
          arguments: { id: "1" },
        },
      }),
    });

    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).toContain("Tatooine");
  });

  it("calls get_internal_character_fact tool via tools/call", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_internal_character_fact",
          arguments: { name: "Luke Skywalker" },
        },
      }),
    });

    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).toContain("internal-character-profile-system");
    expect(bodyText).toContain("blue milk warm");
  });
});
