import { buildApp } from "./app.js";
import { parseConfig } from "./config.js";
import { createPrismaClient, PrismaRepository } from "./prisma-repository.js";
import { ArgonPasswordHasher } from "./security.js";
import { LocalAssetStorage } from "./storage.js";

async function start(): Promise<void> {
  const config = parseConfig(process.env);
  const client = createPrismaClient(config.database);
  const app = buildApp({
    repository: new PrismaRepository(client),
    passwordHasher: new ArgonPasswordHasher(),
    storage: await LocalAssetStorage.create(config.assetStorageRoot),
    setupSecret: config.setupSecret,
    production: config.production,
  });
  app.addHook("onClose", async () => {
    await client.$disconnect();
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await app.listen({ host: config.host, port: config.port });
}

start().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Server startup failed",
  );
  process.exitCode = 1;
});
