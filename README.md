# Blue Canvas

Internal, on-premise collaborative web prototyping platform.

The repository uses npm workspaces, TypeScript, and Node.js 24 LTS. Product
implementation lives on feature branches; approved design and execution plans
live under `docs/superpowers/`.

## Prerequisites

- Node.js 24 LTS with npm 11.19.0
- Docker with Docker Compose
- `nvm` for the setup commands below

## Setup

Run these commands from the repository root:

```bash
nvm install
nvm use
npm install --global npm@11.19.0
test "$(npm --version)" = "11.19.0"
npm ci
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run check
```

Stop the development database without deleting its data:

```bash
docker compose down
```

The values in `.env.example` are local development defaults. Production
deployments must provide unique secrets through the deployment environment and
must not reuse or expose these credentials.

## Repository Commands

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run check
npm run db:generate
npm run db:migrate
npm run test:integration
```

`npm run check` is deterministic and does not require Docker. Start MariaDB with
`docker compose up -d --wait mariadb` before `npm run test:integration`; that
command deploys checked-in migrations and exercises the Prisma repositories.

## Application Server

The Fastify API is rooted at `/api/v1`. Configure all variables documented in
`.env.example`, deploy migrations, build, and start the server:

```bash
npm run db:migrate
npm run build
npm run start -w @blue-canvas/server
```

The initial administrator is created with `POST /api/v1/auth/bootstrap-admin`.
That endpoint works only while the user table is empty and requires
`SETUP_SECRET`. Invitations and personal access tokens return their raw token
once; only SHA-256 digests are stored. Uploaded image assets are limited to 25
MiB and stored beneath the absolute `ASSET_STORAGE_ROOT` configured at startup.

Use `npm install` only when changing dependencies so npm updates
`package-lock.json`. Use `npm ci` for clean, reproducible installs and in CI.

## Workspaces

Applications live under `apps/`: `web`, `server`, `mcp-server`, and `mcp-stdio`.
Shared packages live under `packages/`: `contracts`, `document`, `commands`,
`renderer`, `exporters`, `ui`, and `testing`.
