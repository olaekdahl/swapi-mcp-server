import express from "express";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
};

export type AppOptions = {
  fetchImpl?: typeof fetch;
  allowedOrigins?: string[];
  log?: Logger;
};

const isStdioOnlyMode = () =>
  process.env.ENABLE_STDIO === "1" && process.env.ENABLE_HTTP === "0";

const defaultLogger: Logger = {
  info: (message, context = {}) => {
    if (isStdioOnlyMode()) {
      return;
    }
    console.error(JSON.stringify({ level: "info", message, ...context }));
  },
  error: (message, context = {}) => {
    console.error(JSON.stringify({ level: "error", message, ...context }));
  },
};

const SWAPI_BASE_URL = "https://swapi.online/api";

export const parseAllowedOrigins = (value?: string): string[] => {
  const rawOrigins = value ?? "http://localhost:3000,http://localhost:5173";
  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

export const parsePort = (value: string | undefined, fallback = 3000): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return parsed;
};

const makeToolError = (message: string) => {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
};

const buildAnalyzeCharacterPromptText = (characterName: string): string => {
  return `Please analyze the Star Wars character "${characterName}".

First, search for this character to get their information, then provide:
1. Background and origin
2. Role in the Star Wars saga
3. Key relationships with other characters
4. Notable abilities or characteristics
5. Appearances in films or shows

Use the search_character tool to find information about them.`;
};

const buildCompareCharactersPromptText = (character1: string, character2: string): string => {
  return `Please compare and contrast the Star Wars characters "${character1}" and "${character2}".

Search for both characters using the search_character tool, then provide:
1. Similarities (background, abilities, role in the story)
2. Key differences (goals, allegiances, powers)
3. How they interact with each other (if applicable)
4. Their relative power levels or influence
5. Which era(s) of the saga they appear in

Format your response as a detailed comparison.`;
};

const buildExplorePlanetPromptText = (planetId: string): string => {
  return `Please provide a detailed exploration of the Star Wars planet with ID "${planetId}".

Use the get_planet tool to retrieve the planet information, then provide:
1. Planet description and environment
2. Climate and terrain
3. Notable inhabitants and species
4. Important events that took place there
5. Its significance in the Star Wars story
6. Any connection to major characters

Create an engaging narrative about this world.`;
};

export const fetchSwapiJson = async (fetchImpl: typeof fetch, path: string) => {
  let response: globalThis.Response;
  try {
    response = await fetchImpl(`${SWAPI_BASE_URL}${path}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`SWAPI request failed: ${details}`);
  }

  if (!response.ok) {
    throw new Error(`SWAPI request failed with ${response.status} ${response.statusText}`);
  }

  try {
    return await response.json();
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`SWAPI response parse failed: ${details}`);
  }
};

// Initialize the MCP server
export const createMcpServer = (fetchImpl: typeof fetch = fetch) => {
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
      try {
        const json = await fetchSwapiJson(fetchImpl, `/people/?search=${encodeURIComponent(name)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return makeToolError(details);
      }
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
      try {
        const json = await fetchSwapiJson(fetchImpl, `/planets/${encodeURIComponent(id)}/`);
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return makeToolError(details);
      }
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
      try {
        const json = await fetchSwapiJson(fetchImpl, `/films/${encodeURIComponent(id)}/`);
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        return makeToolError(details);
      }
    }
  );

  // Prompt compatibility tools for clients that can only call tools (not prompts/get).
  server.registerTool(
    "prompt_analyze_character",
    {
      title: "Prompt Template: Analyze Character",
      description: "Returns the analyze-character prompt template text for tools-only clients",
      inputSchema: { characterName: z.string() },
    },
    async ({ characterName }) => {
      return {
        content: [{ type: "text" as const, text: buildAnalyzeCharacterPromptText(characterName) }],
      };
    }
  );

  server.registerTool(
    "prompt_compare_characters",
    {
      title: "Prompt Template: Compare Characters",
      description: "Returns the compare-characters prompt template text for tools-only clients",
      inputSchema: { character1: z.string(), character2: z.string() },
    },
    async ({ character1, character2 }) => {
      return {
        content: [{ type: "text" as const, text: buildCompareCharactersPromptText(character1, character2) }],
      };
    }
  );

  server.registerTool(
    "prompt_explore_planet",
    {
      title: "Prompt Template: Explore Planet",
      description: "Returns the explore-planet prompt template text for tools-only clients",
      inputSchema: { planetId: z.string() },
    },
    async ({ planetId }) => {
      return {
        content: [{ type: "text" as const, text: buildExplorePlanetPromptText(planetId) }],
      };
    }
  );

  // Register resources (static content that can be referenced)
  server.registerResource(
    "introduction",
    "star-wars-guide://introduction",
    {
      mimeType: "text/plain",
      name: "Star Wars Universe Introduction",
      description: "Introduction to the Star Wars universe and key information",
    },
    async () => {
      return {
        contents: [
          {
            uri: "star-wars-guide://introduction",
            mimeType: "text/plain",
            text: `# Star Wars Universe Guide

The Star Wars saga spans multiple eras, featuring iconic characters, planets, and epic films.

## Key Resources Available
- **Characters**: Search for and retrieve information about Star Wars characters
- **Planets**: Get details about worlds across the galaxy
- **Films**: Access information about the Star Wars films

## Available Tools
- search_character: Find characters by name
- get_planet: Retrieve planet information by ID
- get_film: Get film details by ID

Use these tools to explore the Star Wars universe!`,
          },
        ],
      };
    }
  );

  server.registerResource(
    "popular-characters",
    "star-wars-guide://popular-characters",
    {
      mimeType: "text/plain",
      name: "Popular Star Wars Characters",
      description: "Information about popular Star Wars characters to explore",
    },
    async () => {
      return {
        contents: [
          {
            uri: "star-wars-guide://popular-characters",
            mimeType: "text/plain",
            text: `# Popular Star Wars Characters

Here are some popular characters you can search for:

1. **Luke Skywalker** - Main protagonist of the original trilogy
2. **Darth Vader** - Iconic Sith Lord and Anakin Skywalker
3. **Princess Leia** - Leader and force user
4. **Han Solo** - Smuggler and pilot of the Millennium Falcon
5. **Yoda** - Ancient Jedi Master
6. **Obi-Wan Kenobi** - Jedi Knight and mentor
7. **Darth Sidious** - The Emperor and Sith Lord
8. **Boba Fett** - Legendary bounty hunter
9. **Chewbacca** - Wookiee co-pilot
10. **C-3PO** - Protocol droid

Try searching for any of these characters using the search_character tool!`,
          },
        ],
      };
    }
  );

  // Register prompt templates (reusable prompts for common tasks)
  server.registerPrompt(
    "analyze-character",
    {
      title: "Analyze Star Wars Character",
      description: "Template for analyzing a Star Wars character's background and role",
      argsSchema: {
        characterName: z.string().describe("The name of the character to analyze"),
      },
    },
    async ({ characterName }) => {
      return {
        description: `Analyzing character: ${characterName}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildAnalyzeCharacterPromptText(characterName),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "compare-characters",
    {
      title: "Compare Two Star Wars Characters",
      description: "Template for comparing and contrasting two Star Wars characters",
      argsSchema: {
        character1: z.string().describe("First character to compare"),
        character2: z.string().describe("Second character to compare"),
      },
    },
    async ({ character1, character2 }) => {
      return {
        description: `Comparing characters: ${character1} and ${character2}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildCompareCharactersPromptText(character1, character2),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "explore-planet",
    {
      title: "Explore a Star Wars Planet",
      description: "Template for exploring and describing a Star Wars planet",
      argsSchema: {
        planetId: z.string().describe("The ID of the planet to explore (e.g., '1' for Tatooine)"),
      },
    },
    async ({ planetId }) => {
      return {
        description: `Exploring planet: ${planetId}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildExplorePlanetPromptText(planetId),
            },
          },
        ],
      };
    }
  );

  return server;
};

const methodNotAllowedBody = JSON.stringify({
  jsonrpc: "2.0",
  error: {
    code: -32000,
    message: "Method not allowed.",
  },
  id: null,
});

export const createApp = (options: AppOptions = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  const log = options.log ?? defaultLogger;
  const app = express();

  app.use(
    cors({
      origin: allowedOrigins,
      exposedHeaders: ["mcp-session-id"],
      allowedHeaders: ["mcp-session-id", "content-type"],
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/mcp",
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Stateless Streamable HTTP transport (see SDK docs)
  app.post("/mcp", async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const server = createMcpServer(fetchImpl);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      log.error("Error handling MCP request", { error: details });
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

  // GET and DELETE are not supported in stateless mode.
  app.get("/mcp", async (_: ExpressRequest, res: ExpressResponse) => {
    res.writeHead(405).end(methodNotAllowedBody);
  });

  app.delete("/mcp", async (_: ExpressRequest, res: ExpressResponse) => {
    res.writeHead(405).end(methodNotAllowedBody);
  });

  app.get("/healthz", (_: ExpressRequest, res: ExpressResponse) => {
    res.status(200).json({ ok: true });
  });

  return app;
};

type StartedServer = {
  httpServer?: HttpServer;
  stop: () => Promise<void>;
};

export const startServer = async (options: AppOptions = {}): Promise<StartedServer> => {
  const log = options.log ?? defaultLogger;
  const enableHttp = process.env.ENABLE_HTTP !== "0";
  const enableStdio = process.env.ENABLE_STDIO === "1";

  if (!enableHttp && !enableStdio) {
    throw new Error("At least one transport must be enabled via ENABLE_HTTP or ENABLE_STDIO.");
  }

  const stopHandlers: Array<() => Promise<void>> = [];
  let httpServer: HttpServer | undefined;

  if (enableHttp) {
    const app = createApp(options);
    const port = parsePort(process.env.PORT, 3000);
    httpServer = await new Promise<HttpServer>((resolve) => {
      const server = createServer(app);
      server.listen(port, () => {
        log.info("HTTP MCP server started", { url: `http://localhost:${port}/mcp` });
        resolve(server);
      });
    });

    stopHandlers.push(async () => {
      if (httpServer === undefined) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        httpServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    });
  }

  if (enableStdio) {
    const server = createMcpServer(options.fetchImpl ?? fetch);
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    log.info("Stdio MCP transport started");
    stopHandlers.push(async () => {
      await server.close();
    });
  }

  return {
    httpServer,
    stop: async () => {
      for (const stopHandler of stopHandlers.reverse()) {
        await stopHandler();
      }
    },
  };
};

const installProcessHandlers = (stop: () => Promise<void>, log: Logger) => {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info("Shutdown signal received", { signal });
    try {
      await stop();
      process.exit(0);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      log.error("Shutdown failed", { error: details });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

const isMainModule = () => {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }
  return import.meta.url === pathToFileURL(entryPoint).href;
};

if (isMainModule()) {
  void (async () => {
    try {
      const started = await startServer();
      installProcessHandlers(started.stop, defaultLogger);

      process.on("uncaughtException", (error) => {
        defaultLogger.error("Uncaught exception", { error: error.message });
      });
      process.on("unhandledRejection", (reason) => {
        defaultLogger.error("Unhandled rejection", { reason: String(reason) });
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      defaultLogger.error("Startup failed", { error: details });
      process.exit(1);
    }
  })();
}
