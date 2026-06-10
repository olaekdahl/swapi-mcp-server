import { createServer } from "node:http";
import { createApp } from "../../index.js";

const run = async () => {
  const app = createApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Could not determine server address for smoke test.");
    }

    const url = `http://127.0.0.1:${address.port}/mcp`;
    const response = await fetch(url, {
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

    if (response.status !== 200 || !bodyText.includes("search_character")) {
      throw new Error(`Smoke test failed. status=${response.status} body=${bodyText}`);
    }

    console.log("Smoke test passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
