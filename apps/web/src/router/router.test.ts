import { describe, expect, it } from "vitest";

import { parseRoute, serializeRoute } from "./router.js";

describe("hash router", () => {
  it("routes empty hash to home", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/")).toEqual({ name: "home" });
    expect(parseRoute("#/home")).toEqual({ name: "home" });
  });

  it("parses named screens", () => {
    expect(parseRoute("#/sign-in")).toEqual({ name: "sign-in" });
    expect(parseRoute("#/library")).toEqual({ name: "library" });
  });

  it("parses invitation with optional token", () => {
    expect(parseRoute("#/invitation")).toEqual({ name: "invitation" });
    expect(parseRoute("#/invitation?token=abc")).toEqual({
      name: "invitation",
      token: "abc",
    });
  });

  it("parses project sub-routes", () => {
    expect(parseRoute("#/projects/proj-1")).toEqual({
      name: "workspace",
      projectId: "proj-1",
    });
    expect(parseRoute("#/projects/proj-1/share")).toEqual({
      name: "share",
      projectId: "proj-1",
    });
    expect(parseRoute("#/projects/proj-1/export")).toEqual({
      name: "export",
      projectId: "proj-1",
    });
  });

  it("returns not-found for unknown paths", () => {
    expect(parseRoute("#/nonsense")).toEqual({ name: "not-found" });
  });

  it("serializes routes back to their hash form", () => {
    expect(serializeRoute({ name: "home" })).toBe("#/home");
    expect(serializeRoute({ name: "workspace", projectId: "p1" })).toBe(
      "#/projects/p1",
    );
    expect(serializeRoute({ name: "invitation", token: "abc" })).toBe(
      "#/invitation?token=abc",
    );
  });
});
