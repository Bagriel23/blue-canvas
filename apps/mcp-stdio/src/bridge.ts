export interface BridgeConfig {
  mcpUrl: string;
  bearerToken: string;
  fetch?: typeof globalThis.fetch;
  sessionId?: string | undefined;
}

export interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class BridgeSession {
  private sessionId: string | undefined;

  constructor(private readonly config: BridgeConfig) {
    this.sessionId = config.sessionId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  async forward(request: JsonRpcEnvelope): Promise<JsonRpcEnvelope | null> {
    const fetcher = this.config.fetch ?? globalThis.fetch.bind(globalThis);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${this.config.bearerToken}`,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const response = await fetcher(this.config.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) this.sessionId = sessionHeader;
    if (response.status === 204) return null;
    const text = await response.text();
    if (text.length === 0) return null;
    return JSON.parse(text) as JsonRpcEnvelope;
  }
}

export function parseIncoming(line: string): JsonRpcEnvelope {
  const trimmed = line.trim();
  if (trimmed.length === 0) throw new Error("Empty line");
  const value = JSON.parse(trimmed) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { jsonrpc?: unknown }).jsonrpc !== "2.0"
  ) {
    throw new Error("Not a JSON-RPC 2.0 envelope");
  }
  return value as JsonRpcEnvelope;
}

export function serialize(response: JsonRpcEnvelope): string {
  return `${JSON.stringify(response)}\n`;
}
