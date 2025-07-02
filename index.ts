// npx ts-node index.ts
// install ngrok, or something similar, if trying to use from external LLM
// npm install -g ngrok
// expose your local MCP server
// ngrok http 3000

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize the MCP server
const getServer = () => {
  const server = new McpServer({
    name: "swapi-mcp-server",
    version: "1.0.0",
  });

  // Register tools wrapping SWAPI endpoints
  server.registerTool(
    "search_character",
    {
      title: "Search Star Wars Character",
      description: "Search for a Star Wars character by name",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      const searchUrl = `https://swapi.online/api/people/?search=${encodeURIComponent(name)}`;
      const res = await fetch(searchUrl);
      const json = await res.json();
      const text = JSON.stringify(json, null, 2);
      return { content: [{ type: "text", text }] };
    }
  );

  server.registerTool(
    "get_planet",
    {
      title: "Get Planet by ID",
      description: "Get detailed planet info by its ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const res = await fetch(`https://swapi.online/api/planets/${id}/`);
      const json = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(json, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_film",
    {
      title: "Get Film by ID",
      description: "Get detailed film info by its ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const res = await fetch(`https://swapi.online/api/films/${id}/`);
      const json = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(json, null, 2) }],
      };
    }
  );

  return server;
};

// Express setup with CORS for MCP streamable HTTP
const app = express();
app.use(
  cors({
    exposedHeaders: ["mcp-session-id"],
    allowedHeaders: ["mcp-session-id", "content-type"],
  })
);
app.use(express.json());

// Stateless Streamable HTTP transport (see SDK docs)
app.post("/mcp", async (req, res) => {
  try {
    const server = getServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// GET and DELETE not supported in stateless mode
app.get("/mcp", async (req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

// Optional: support stdio transport (for CLI clients)
(async () => {
  const stdio = new StdioServerTransport();
  const server = getServer();
  await server.connect(stdio);
})();

// Start HTTP listener
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 HTTP MCP server running at http://localhost:${PORT}/mcp`);
});
