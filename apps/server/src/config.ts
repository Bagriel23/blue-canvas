import { isAbsolute } from "node:path";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_HOST: z.string().min(1).default("127.0.0.1"),
  APP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  SETUP_SECRET: z.string().min(16),
  ASSET_STORAGE_ROOT: z.string().min(1).refine(isAbsolute),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
});

export interface ServerConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  production: boolean;
  setupSecret: string;
  assetStorageRoot: string;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

export function parseConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map(
          (issue) => issue.path.join(".") || "environment",
        ),
      ),
    ];
    throw new Error(`Invalid server configuration: ${fields.join(", ")}`);
  }
  const value = result.data;
  return {
    nodeEnv: value.NODE_ENV,
    host: value.APP_HOST,
    port: value.APP_PORT,
    production: value.NODE_ENV === "production",
    setupSecret: value.SETUP_SECRET,
    assetStorageRoot: value.ASSET_STORAGE_ROOT,
    database: {
      host: value.DATABASE_HOST,
      port: value.DATABASE_PORT,
      database: value.DATABASE_NAME,
      user: value.DATABASE_USER,
      password: value.DATABASE_PASSWORD,
    },
  };
}
