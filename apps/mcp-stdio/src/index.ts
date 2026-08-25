import { createInterface } from "node:readline";

import { BridgeSession, parseIncoming, serialize } from "./bridge.js";

const url = process.env["BLUE_CANVAS_MCP_URL"];
const token = process.env["BLUE_CANVAS_PAT"];

if (!url || !token) {
  console.error(
    "BLUE_CANVAS_MCP_URL and BLUE_CANVAS_PAT are required for the stdio bridge.",
  );
  process.exit(2);
}

const session = new BridgeSession({ mcpUrl: url, bearerToken: token });
const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });

reader.on("line", (line) => {
  void handle(line);
});

async function handle(line: string): Promise<void> {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  try {
    const envelope = parseIncoming(trimmed);
    const response = await session.forward(envelope);
    if (response) process.stdout.write(serialize(response));
  } catch (raw) {
    process.stderr.write(`[blue-canvas-mcp-stdio] ${(raw as Error).message}\n`);
  }
}
