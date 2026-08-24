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
```

Use `npm install` only when changing dependencies so npm updates
`package-lock.json`. Use `npm ci` for clean, reproducible installs and in CI.

## Workspaces

Applications live under `apps/`: `web`, `server`, `mcp-server`, and `mcp-stdio`.
Shared packages live under `packages/`: `contracts`, `document`, `commands`,
`renderer`, `exporters`, `ui`, and `testing`.
