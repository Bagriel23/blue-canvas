import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const workspaceDirectories = [
  "apps/web",
  "apps/server",
  "apps/mcp-server",
  "apps/mcp-stdio",
  "packages/contracts",
  "packages/document",
  "packages/commands",
  "packages/renderer",
  "packages/exporters",
  "packages/collaboration",
  "packages/ui",
  "packages/testing",
];

const browserDirectories = new Set(["apps/web"]);

function fromRoot(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: workspaceDirectories.map((root) => ({
      extends: true,
      root,
      test: {
        include: ["src/**/*.test.{ts,tsx}"],
        name: root,
        passWithNoTests: true,
        ...(browserDirectories.has(root)
          ? {
              environment: "happy-dom" as const,
              setupFiles: [fromRoot(`./${root}/src/testing/setup.ts`)],
            }
          : {}),
      },
    })),
  },
});
