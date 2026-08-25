import { useCallback, useEffect, useState } from "react";

import { parseRoute, serializeRoute, type Route } from "./router.js";

export function useRouter(initialHash?: string): {
  route: Route;
  navigate: (route: Route) => void;
} {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(
      initialHash ??
        (typeof window !== "undefined" ? window.location.hash : ""),
    ),
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = serializeRoute(next);
    if (typeof window !== "undefined") {
      if (window.location.hash === hash) {
        setRoute(next);
        return;
      }
      window.location.hash = hash;
    } else {
      setRoute(next);
    }
  }, []);

  return { route, navigate };
}
