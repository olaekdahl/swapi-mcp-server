// tsx ./swapi-client.ts

import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const serverUrl = process.env.MCP_SERVER_URL ?? 'http://localhost:3100/mcp';
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const prompt = process.env.OPENAI_PROMPT ?? 'Where was Luke Skywalker born and how tall is he?';
const traceEnabled = process.env.MCP_TRACE !== '0';
const verboseTrace = process.env.MCP_TRACE_VERBOSE === '1';
const traceStart = Date.now();

const trace = (step: string, details?: string) => {
  if (!traceEnabled) {
    return;
  }
  const elapsedSeconds = ((Date.now() - traceStart) / 1000).toFixed(2);
  const detailSuffix = details === undefined ? '' : ` | ${details}`;
  console.log(`[trace +${elapsedSeconds}s] ${step}${detailSuffix}`);
};

const getStringField = (item: Record<string, unknown>, key: string): string | undefined => {
  const value = item[key];
  return typeof value === 'string' ? value : undefined;
};

const traceResponseItems = (output: unknown) => {
  if (!Array.isArray(output)) {
    trace('No structured response items were returned by the API.');
    return;
  }

  trace('Structured response items received', `count=${output.length}`);

  output.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      trace(`Output[${index}]`, 'non-object item');
      return;
    }

    const record = item as Record<string, unknown>;
    const itemType = getStringField(record, 'type') ?? 'unknown';
    const name = getStringField(record, 'name');
    const status = getStringField(record, 'status');
    const role = getStringField(record, 'role');
    const serverLabel = getStringField(record, 'server_label');

    const parts = [`type=${itemType}`];
    if (name !== undefined) {
      parts.push(`name=${name}`);
    }
    if (role !== undefined) {
      parts.push(`role=${role}`);
    }
    if (status !== undefined) {
      parts.push(`status=${status}`);
    }
    if (serverLabel !== undefined) {
      parts.push(`server_label=${serverLabel}`);
    }

    trace(`Output[${index}]`, parts.join(', '));

    if (verboseTrace) {
      console.log(JSON.stringify(record, null, 2));
    }
  });
};

const tools = [
  {
    type: "mcp" as const,
    server_label: 'swapi',
    server_url: serverUrl,
    require_approval: 'never' as const,
  },
];

try {
  trace('Demo started', `model=${model}`);
  trace('Registered MCP server tool', `server_label=swapi, server_url=${serverUrl}`);
  trace('Sending prompt to OpenAI Responses API', `prompt=${JSON.stringify(prompt)}`);

  const resp = await openai.responses.create({
    model,
    tools,
    // simplest form - a single prompt string
    input: prompt,
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

  trace('OpenAI response received', `response_id=${resp.id}`);
  traceResponseItems((resp as { output?: unknown }).output);
  trace('Printing final answer to console');

  console.log(resp.output_text);
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  console.error('Failed to run test client.');
  console.error(`MCP server URL: ${serverUrl}`);
  console.error(`Reason: ${details}`);
  console.error('Tip: if this URL is localhost, use a tunnel URL when the model runtime cannot access your local machine.');
  process.exitCode = 1;
}
