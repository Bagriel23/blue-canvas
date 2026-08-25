export interface BeforeUnloadEventLike {
  preventDefault(): void;
  returnValue: string;
}

export interface BeforeUnloadTarget {
  addEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadEventLike) => void,
  ): void;
  removeEventListener(
    type: "beforeunload",
    listener: (event: BeforeUnloadEventLike) => void,
  ): void;
}

export interface PendingChangesGuard {
  markPending(): void;
  markSynced(): void;
  hasPendingChanges(): boolean;
  dispose(): void;
}

export function createPendingChangesGuard(
  target: BeforeUnloadTarget,
): PendingChangesGuard {
  let pending = false;
  let listening = false;

  const warn = (event: BeforeUnloadEventLike): void => {
    if (!pending) return;
    event.preventDefault();
    event.returnValue = "";
  };

  const stopListening = (): void => {
    if (!listening) return;
    target.removeEventListener("beforeunload", warn);
    listening = false;
  };

  return {
    markPending() {
      pending = true;
      if (listening) return;
      target.addEventListener("beforeunload", warn);
      listening = true;
    },
    markSynced() {
      pending = false;
      stopListening();
    },
    hasPendingChanges() {
      return pending;
    },
    dispose() {
      pending = false;
      stopListening();
    },
  };
}
