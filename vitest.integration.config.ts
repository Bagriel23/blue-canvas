import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/server/test/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
