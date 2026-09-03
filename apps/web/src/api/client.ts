import { errorEnvelopeSchema } from "@blue-canvas/contracts";

export const CSRF_HEADER = "x-csrf-token";

export type Fetcher = typeof globalThis.fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: Fetcher;
  csrfToken?: string | null;
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly traceId: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiResult<T> {
  status: number;
  data: T;
  csrfToken: string | null;
}

export class ApiClient {
  private baseUrl: string;
  private fetcher: Fetcher;
  private csrfToken: string | null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.csrfToken = options.csrfToken ?? null;
  }

  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  getCsrfToken(): string | null {
    return this.csrfToken;
  }

  async request<T = unknown>(request: ApiRequest): Promise<ApiResult<T>> {
    const method = request.method ?? "GET";
    const url = this.resolveUrl(request.path);
    const headers: Record<string, string> = {
      accept: "application/json",
      ...request.headers,
    };
    let body: BodyInit | undefined;
    if (request.body !== undefined) {
      if (typeof FormData !== "undefined" && request.body instanceof FormData) {
        body = request.body;
      } else {
        headers["content-type"] ??= "application/json";
        body = JSON.stringify(request.body);
      }
    }
    if (method !== "GET" && this.csrfToken) {
      headers[CSRF_HEADER] ??= this.csrfToken;
    }
    const init: RequestInit = {
      method,
      headers,
      credentials: "include",
    };
    if (body !== undefined) init.body = body;
    if (request.signal) init.signal = request.signal;
    const response = await this.fetcher(url, init);
    const nextCsrf = response.headers.get(CSRF_HEADER);
    if (nextCsrf) this.csrfToken = nextCsrf;

    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const envelope = errorEnvelopeSchema.safeParse(payload);
      if (envelope.success) {
        throw new ApiError(
          envelope.data.error.code,
          envelope.data.error.message,
          response.status,
          envelope.data.error.traceId,
          envelope.data.error.details,
        );
      }
      throw new ApiError(
        "http_error",
        `Request failed with status ${response.status}`,
        response.status,
        response.headers.get("x-trace-id") ?? "unknown",
        payload,
      );
    }
    return {
      status: response.status,
      data: payload as T,
      csrfToken: this.csrfToken,
    };
  }

  private resolveUrl(path: string): string {
    if (!path.startsWith("/")) throw new Error("Path must start with /");
    if (!this.baseUrl) return path;
    return this.baseUrl.replace(/\/$/, "") + path;
  }
}
