import { describe, expect, it } from "vitest";

import { parseConfig } from "./config.js";

const validEnvironment = {
  NODE_ENV: "production",
  APP_HOST: "0.0.0.0",
  APP_PORT: "3100",
  SETUP_SECRET: "a unique deployment setup secret",
  ASSET_STORAGE_ROOT: "/srv/blue-canvas/assets",
  DATABASE_HOST: "database",
  DATABASE_PORT: "3306",
  DATABASE_NAME: "blue_canvas",
  DATABASE_USER: "blue_canvas",
  DATABASE_PASSWORD: "not-a-real-production-password",
};

describe("server configuration", () => {
  it("parses and types the environment contract", () => {
    expect(parseConfig(validEnvironment)).toMatchObject({
      nodeEnv: "production",
      host: "0.0.0.0",
      port: 3100,
      production: true,
      assetStorageRoot: "/srv/blue-canvas/assets",
      database: {
        host: "database",
        port: 3306,
        database: "blue_canvas",
        user: "blue_canvas",
      },
    });
  });

  it("rejects missing secrets and relative storage roots", () => {
    expect(() =>
      parseConfig({
        ...validEnvironment,
        SETUP_SECRET: "",
        ASSET_STORAGE_ROOT: "./assets",
      }),
    ).toThrow("Invalid server configuration");
  });
});
