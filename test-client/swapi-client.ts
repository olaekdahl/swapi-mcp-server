// node --loader ts-node/esm ./swapi-client.ts

import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const tools = [
  {
    type: "mcp" as const,
    server_label: 'swapi',
    server_url: 'https://e019-136-52-4-14.ngrok-free.app/mcp',             
    // server_url: 'http://localhost:3000/mcp',
    require_approval: 'never' as const,
  },
];

const resp = await openai.responses.create({
  model: 'gpt-4o-mini',
  tools,
  // simplest form ─ a single prompt string
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
