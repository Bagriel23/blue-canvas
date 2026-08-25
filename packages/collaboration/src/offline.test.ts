import { describe, expect, it, vi } from "vitest";

import { createPendingChangesGuard } from "./offline.js";

class FakeWindow {
  readonly listeners = new Map<string, (event: BeforeUnloadLike) => void>();

  addEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadLike) => void,
  ) {
    this.listeners.set(type, listener);
  }

  removeEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadLike) => void,
  ) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
}

interface BeforeUnloadLike {
  preventDefault(): void;
  returnValue: string;
}

describe("pending collaboration changes", () => {
  it("warns only while memory-only changes are pending", () => {
    const target = new FakeWindow();
    const guard = createPendingChangesGuard(target);

    guard.markPending();
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: "untouched" };
    target.listeners.get("beforeunload")?.(event);

    expect(guard.hasPendingChanges()).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");

    guard.markSynced();
    expect(guard.hasPendingChanges()).toBe(false);
    expect(target.listeners.has("beforeunload")).toBe(false);
  });

  it("never reads or writes persistent browser storage", () => {
    const persistentAccess = vi.fn(() => {
      throw new Error("persistent storage is forbidden");
    });
    const browser = Object.defineProperties(new FakeWindow(), {
      indexedDB: { get: persistentAccess },
      localStorage: { get: persistentAccess },
    });

    const guard = createPendingChangesGuard(browser);
    guard.markPending();
    guard.markSynced();
    guard.dispose();

    expect(persistentAccess).not.toHaveBeenCalled();
  });

  it("registers one listener and removes it on disposal", () => {
    const target = new FakeWindow();
    const guard = createPendingChangesGuard(target);
    guard.markPending();
    guard.markPending();

    expect(target.listeners.size).toBe(1);
    guard.dispose();
    expect(target.listeners.size).toBe(0);
  });
});
