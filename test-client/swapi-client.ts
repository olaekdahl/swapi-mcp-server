// tsx ./swapi-client.ts

import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const serverUrl = process.env.MCP_SERVER_URL ?? 'http://localhost:3100/mcp';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const tools = [
  {
    type: "mcp" as const,
    server_label: 'swapi',
    server_url: serverUrl,
    require_approval: 'never' as const,
  },
];

try {
  const resp = await openai.responses.create({
    model,
    tools,
    // simplest form - a single prompt string
    input: 'Where was Luke Skywalker born and how tall is he?',
    // or a richer message list:
    /*
    input: [
      { role: 'system',
        content: [{ type: 'input_text', text: 'You are a Star Wars expert.' }] },
      { role: 'user',
        content: [{ type: 'input_text',
                    text: 'Where was Luke Skywalker born and how tall is he?' }] }
    ],
    */
  });

  console.log(resp.output_text);
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error('Failed to run test client.');
  console.error(`MCP server URL: ${serverUrl}`);
  console.error(`Reason: ${details}`);
  console.error('Tip: if this URL is localhost, use a tunnel URL when the model runtime cannot access your local machine.');
  process.exitCode = 1;
}
