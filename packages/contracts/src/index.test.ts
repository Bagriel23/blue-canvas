import { describe, expect, it } from "vitest";

import * as contracts from "./index.js";

describe("server contracts", () => {
  it("supports exactly the approved product locales", () => {
    expect(contracts.localeSchema.options).toEqual(["en-US", "pt-BR", "ko-KR"]);
    expect(() => contracts.localeSchema.parse("es")).toThrow();
  });

  it("normalizes user email addresses at the API boundary", () => {
    expect(
      contracts.loginRequestSchema.parse({
        email: "  ADMIN@Example.COM ",
        password: "a sufficiently long password",
      }),
    ).toEqual({
      email: "admin@example.com",
      password: "a sufficiently long password",
    });
  });

  it("rejects unsupported personal access token scopes", () => {
    expect(() =>
      contracts.createPersonalAccessTokenRequestSchema.parse({
        name: "automation",
        scopes: ["server:root"],
      }),
    ).toThrow();
  });

  it("defines a consistent error envelope", () => {
    expect(
      contracts.errorEnvelopeSchema.parse({
        error: {
          code: "forbidden",
          message: "Forbidden",
          traceId: "trace-1",
        },
      }),
    ).toEqual({
      error: {
        code: "forbidden",
        message: "Forbidden",
        traceId: "trace-1",
      },
    });
  });
});
