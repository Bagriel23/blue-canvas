import { buildMcpServer } from "./app.js";
import { createApiClient } from "./http-client.js";

const upstream = process.env["BLUE_CANVAS_API_URL"];
if (!upstream) {
  throw new Error(
    "BLUE_CANVAS_API_URL is required to start the Blue Canvas MCP server",
  );
}

const port = Number.parseInt(process.env["MCP_PORT"] ?? "5011", 10);
const host = process.env["MCP_HOST"] ?? "127.0.0.1";

const client = createApiClient({ baseUrl: upstream });
const server = buildMcpServer({ apiClient: client });

server.listen({ host, port }).catch((error: unknown) => {
  process.exitCode = 1;
  console.error("Failed to start Blue Canvas MCP server", error);
});
