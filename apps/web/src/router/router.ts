export type Route =
  | { name: "sign-in" }
  | { name: "invitation"; token?: string }
  | { name: "home" }
  | { name: "library" }
  | { name: "workspace"; projectId: string }
  | { name: "share"; projectId: string }
  | { name: "export"; projectId: string }
  | { name: "not-found" };

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (clean === "" || clean === "home") return { name: "home" };
  if (clean === "sign-in") return { name: "sign-in" };
  if (clean === "library") return { name: "library" };
  if (clean.startsWith("invitation")) {
    const [, token] = clean.split("?token=");
    return token ? { name: "invitation", token } : { name: "invitation" };
  }
  const segments = clean.split("/").filter(Boolean);
  if (segments[0] === "projects" && segments[1]) {
    const projectId = segments[1];
    if (segments.length === 2) return { name: "workspace", projectId };
    if (segments[2] === "share") return { name: "share", projectId };
    if (segments[2] === "export") return { name: "export", projectId };
  }
  return { name: "not-found" };
}

export function serializeRoute(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/home";
    case "sign-in":
      return "#/sign-in";
    case "library":
      return "#/library";
    case "invitation":
      return route.token
        ? `#/invitation?token=${encodeURIComponent(route.token)}`
        : "#/invitation";
    case "workspace":
      return `#/projects/${encodeURIComponent(route.projectId)}`;
    case "share":
      return `#/projects/${encodeURIComponent(route.projectId)}/share`;
    case "export":
      return `#/projects/${encodeURIComponent(route.projectId)}/export`;
    case "not-found":
      return "#/";
  }
}
