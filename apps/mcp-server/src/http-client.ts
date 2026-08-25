import type { ApiClient, ApiJson, DelegatedIdentity } from "./handlers.js";
import { UpstreamApiError } from "./handlers.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(options: {
  baseUrl: string;
  fetch?: FetchLike;
}): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    async request(
      method,
      path,
      request,
    ): Promise<{ status: number; body: ApiJson }> {
      const identity: DelegatedIdentity = request.identity;
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${identity.bearerToken}`,
      };
      if (request.idempotencyKey) {
        headers["idempotency-key"] = request.idempotencyKey;
      }
      const init: RequestInit = { method, headers };
      if (request.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(request.body);
      }
      const response = await fetcher(`${baseUrl}${path}`, init);
      const raw = await response.text();
      let body: ApiJson = null;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw) as ApiJson;
        } catch {
          body = raw as unknown as ApiJson;
        }
      }
      if (!response.ok) {
        const failure = extractFailure(response.status, body);
        throw new UpstreamApiError(failure);
      }
      return { status: response.status, body };
    },
  };
}

function extractFailure(status: number, body: unknown) {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object" &&
    (body as { error: Record<string, unknown> }).error !== null
  ) {
    const error = (body as { error: Record<string, unknown> }).error;
    const failure: {
      code: string;
      message: string;
      status: number;
      details?: unknown;
    } = {
      code:
        typeof error["code"] === "string" ? error["code"] : "upstream_error",
      message:
        typeof error["message"] === "string"
          ? error["message"]
          : "Upstream error",
      status,
    };
    if ("details" in error) failure.details = error["details"];
    return failure;
  }
  return {
    code: "upstream_error",
    message: `Upstream API failed (${status})`,
    status,
  };
}
