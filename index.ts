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
