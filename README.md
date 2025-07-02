# SWAPI MCP Server

A Model Context Protocol (MCP) server that wraps the [Star Wars API (SWAPI)](https://swapi.online/) as MCP tools, allowing LLMs and clients to search for Star Wars characters, planets, and films.

## Features

- **MCP-compliant server** using the official TypeScript SDK
- Exposes three tools:
  - `search_character`: Search for a Star Wars character by name
  - `get_planet`: Get detailed planet info by ID
  - `get_film`: Get detailed film info by ID
- Supports both HTTP (stateless, streamable) and stdio transports

## Code Structure

- `index.ts`: Main entry point. Sets up the MCP server, registers tools, and configures HTTP and stdio transports.
- `test-client/`: Example OpenAI client that demonstrates how to call the MCP server as a tool from an LLM.

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

- Node.js v18 or newer
- npm

### Install dependencies

```bash
npm install
```

### Run in HTTP mode (default)

```bash
npx ts-node index.ts
```

- The server will listen on `http://localhost:3000/mcp` (or the port set in the `PORT` environment variable).

### Run in stdio mode (for CLI clients)

- The server automatically starts a stdio transport for CLI-based MCP clients.

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

const tools = [
  {
    type: "mcp" as const,
    server_label: 'swapi',
    server_url: 'http://localhost:3000/mcp', // this has to be accessible from your LLM
    require_approval: 'never' as const,
  },
];

const resp = await openai.responses.create({
  model: 'gpt-4o-mini',
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
   npx ts-node index.ts
   ```
4. Run the test client:
   ```bash
   node --loader ts-node/esm ./swapi-client.ts
   ```

- You should see the LLM's answer, which may include information fetched from the SWAPI MCP tools.
- You can also point the `server_url` to a public ngrok URL if you want to test from outside localhost.

## Notes

- The server is stateless for HTTP requests (no session management).
- CORS is enabled for the `mcp-session-id` header.
- For more details on MCP, see the [TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk).
