import { defineConfig } from "prisma/config";

const host = process.env.DATABASE_HOST ?? "127.0.0.1";
const port = process.env.DATABASE_PORT ?? "3306";
const database = process.env.DATABASE_NAME ?? "blue_canvas";
const user = encodeURIComponent(process.env.DATABASE_USER ?? "blue_canvas");
const password = encodeURIComponent(
  process.env.DATABASE_PASSWORD ?? "blue_canvas_dev",
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: `mysql://${user}:${password}@${host}:${port}/${database}`,
  },
});
