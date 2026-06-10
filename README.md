# SWAPI MCP Server

A Model Context Protocol (MCP) server that wraps the [Star Wars API (SWAPI)](https://swapi.online/) as MCP tools, allowing LLMs and clients to search for Star Wars characters, planets, and films.

## Features

- **MCP-compliant server** using the official TypeScript SDK
- Exposes three tools:
  - `search_character`: Search for a Star Wars character by name
  - `get_planet`: Get detailed planet info by ID
  - `get_film`: Get detailed film info by ID
- Supports HTTP (stateless, streamable) and optional stdio transport
- Includes unit, integration, and smoke tests

## Code Structure

- `index.ts`: Main entry point. Exports app/server builders, registers tools, and configures HTTP/stdio transports.
- `test-client/`: Example OpenAI client that demonstrates how to call the MCP server as a tool from an LLM.
- `tests/`: Unit tests, MCP HTTP integration tests, and smoke test script.

## Tool Details

### search_character

- **Input:** `{ name: string }`
- **Description:** Searches SWAPI for characters matching the given name.
- **Returns:** JSON-formatted list of matching characters.

### get_planet

- **Input:** `{ id: string }`
- **Description:** Fetches detailed info for a planet by its SWAPI ID.
- **Returns:** JSON-formatted planet details.

### get_film

- **Input:** `{ id: string }`
- **Description:** Fetches detailed info for a film by its SWAPI ID.
- **Returns:** JSON-formatted film details.

## How It Works

- Uses the [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) to create an MCP server.
- Each tool is registered with an input schema (using [zod](https://zod.dev/)) and an async handler that fetches data from SWAPI.
- The server can be accessed via HTTP POST requests to `/mcp` or via stdio (for CLI clients).

## Running the Server

### Prerequisites

- Node.js v22 or newer
- npm

### Install dependencies

```bash
npm install
```

### Environment variables

- `PORT` (default `3000`)
- `ENABLE_HTTP` (default `1`; set `0` to disable HTTP transport)
- `ENABLE_STDIO` (default `0`; set `1` to enable stdio transport)
- `ALLOWED_ORIGINS` (comma-separated CORS allowlist, defaults to `http://localhost:3000,http://localhost:5173`)

### Run in HTTP mode (default)

```bash
npm run dev
```

- The server will listen on `http://localhost:3000/mcp` (or the port set in the `PORT` environment variable).

### Run in stdio mode (for CLI clients)

```bash
ENABLE_HTTP=0 ENABLE_STDIO=1 npm run dev
```

### Run both transports

```bash
ENABLE_STDIO=1 npm run dev
```

### Build and run compiled output

```bash
npm run build
npm start
```

## Use From Another VS Code Instance (Same Machine)

This is the easiest way to use this MCP server from a second local VS Code window.

### Option A (recommended): Register as a stdio MCP server

1. Open a second VS Code instance.
2. Open the workspace where you want to use this MCP server.
3. Open Command Palette and run `MCP: Add Server`.
4. Choose a local/command (stdio) server type.
5. Use these values:
   - Name: `swapi-local`
   - Command: `node`
   - Args: `--import`, `tsx`, `index.ts`
   - Working directory: `/path/to/swapi-mcp-server`
   - Environment variables:
     - `ENABLE_HTTP=0`
     - `ENABLE_STDIO=1`
6. Save the MCP server configuration and reload the second VS Code window if prompted.
7. In Chat, verify the server is available (for example via MCP server/tools list UI, then call a tool like `search_character`).

If your VS Code MCP setup uses a JSON config file, this is the equivalent stdio config:

```json
{
  "servers": {
    "swapi-local": {
      "type": "stdio",
      "command": "node",
      "args": ["--import", "tsx", "index.ts"],
      "cwd": "/path/to/swapi-mcp-server",
      "env": {
        "ENABLE_HTTP": "0",
        "ENABLE_STDIO": "1"
      }
    }
  }
}
```

Minimal server entry (using placeholder path):

```json
{
  "swapi-local": {
    "type": "stdio",
    "command": "node",
    "args": ["--import", "tsx", "index.ts"],
    "cwd": "/path/to/swapi-mcp-server",
    "env": {
      "ENABLE_HTTP": "0",
      "ENABLE_STDIO": "1"
    }
  }
}
```

If you see `Cannot find module .../dist/index.js` in MCP logs, your server was launched with a command that expects a built artifact. Use the direct stdio command shown above, or run `npm run build` before using `npm start`.

### Option B: Register as an HTTP MCP server

1. In this repository, start the server in a terminal:

```bash
npm run dev
```

2. In the second VS Code instance, add an MCP server using URL:

```text
http://localhost:3000/mcp
```

3. Save and test by calling a tool from Chat.

If your VS Code MCP setup uses JSON config, this is the equivalent HTTP config:

```json
{
  "servers": {
    "swapi-http": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Example HTTP Request

**List tools:**

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":0,"method":"tools/list","params":{}}'
```

**Search for a character:**

```bash
curl -N -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_character",
      "arguments": { "name": "Luke" }
    },
    "id": 1
  }'
```

**Get a planet by ID:**

```bash
curl -N -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_planet",
      "arguments": { "id": "1" }
    },
    "id": 2
  }'
```

**Get a film by ID:**

```bash
curl -N -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_film",
      "arguments": { "id": "1" }
    },
    "id": 3
  }'
```

## Test Client: OpenAI + MCP Integration

The `test-client/` directory contains an example script (`swapi-client.ts`) that demonstrates how to call the MCP server as a tool from an OpenAI LLM (e.g., GPT-4o-mini).

### How it works

- Uses the OpenAI SDK and MCP tool integration.
- Registers the MCP server as a tool for the LLM.
- Sends a prompt/question to the LLM, which can call the MCP tools to answer.

### Example: `test-client/swapi-client.ts`

```typescript
// node --loader ts-node/esm ./swapi-client.ts
import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const serverUrl = process.env.MCP_SERVER_URL ?? 'http://localhost:3000/mcp';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const tools = [
  {
    type: "mcp" as const,
    server_label: 'swapi',
    server_url: serverUrl,
    require_approval: 'never' as const,
  },
];

const resp = await openai.responses.create({
  model,
  tools,
  input: 'Where was Luke Skywalker born and how tall is he?',
});

console.log(resp.output_text);
```

### Running the test client

1. Install dependencies:
   ```bash
   cd test-client
   npm install
   ```
2. Set your OpenAI API key in a `.env` file:
   ```env
   OPENAI_API_KEY=sk-...
   ```
3. Start the MCP server (in the parent directory):
   ```bash
  npm run dev
   ```
4. Run the test client:
   ```bash
  cd test-client
  npm run dev
   ```

- You should see the LLM's answer, which may include information fetched from the SWAPI MCP tools.
- To test with a remote tunnel, set `MCP_SERVER_URL` in `test-client/.env`.

## Testing

Run all tests:

```bash
npm test
```

Run focused suites:

```bash
npm run test:unit
npm run test:integration
npm run smoke
```

Run full verification:

```bash
npm run verify
```

## Notes

- The server is stateless for HTTP requests (no session management).
- CORS is enabled with an allowlist and exposes the `mcp-session-id` header.
- For more details on MCP, see the [TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk).
