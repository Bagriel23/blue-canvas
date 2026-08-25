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

  it("validates named version create and restore payloads", () => {
    expect(
      contracts.createNamedVersionRequestSchema.parse({ name: "Release 1" }),
    ).toEqual({
      name: "Release 1",
    });
    expect(
      contracts.restoreNamedVersionRequestSchema.parse({
        name: "Restore Release 1",
      }),
    ).toEqual({ name: "Restore Release 1" });
    expect(() =>
      contracts.createNamedVersionRequestSchema.parse({
        name: " ".repeat(121),
      }),
    ).toThrow();
  });

  it("normalizes comment anchors and rejects duplicate mentions", () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    expect(
      contracts.createCommentRequestSchema.parse({
        body: "  Review this  ",
        position: { x: 0.25, y: 1 },
        mentionUserIds: [userId],
      }),
    ).toEqual({
      body: "Review this",
      position: { x: 0.25, y: 1 },
      mentionUserIds: [userId],
    });
    expect(() =>
      contracts.createCommentRequestSchema.parse({
        body: "Review",
        mentionUserIds: [userId, userId],
      }),
    ).toThrow();
    expect(() =>
      contracts.createCommentRequestSchema.parse({
        body: "Review",
        position: { x: -0.1, y: 0 },
      }),
    ).toThrow();
  });

  it("requires at least one comment update and supports resolution", () => {
    expect(() => contracts.updateCommentRequestSchema.parse({})).toThrow();
    expect(
      contracts.resolveCommentRequestSchema.parse({ resolved: true }),
    ).toEqual({
      resolved: true,
    });
  });
});
