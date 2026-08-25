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
      },
    })),
  },
});
