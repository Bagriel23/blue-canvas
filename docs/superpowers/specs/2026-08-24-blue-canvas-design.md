# Blue Canvas Design

## Goal

Build an internal web prototyping platform inspired by pen.dev and Claude
Design. Users create semantic responsive interfaces, collaborate in real time,
publish reusable design kits/templates, and export deterministic projects for
HTML/CSS/JavaScript, React, and Preact.

## Product Decisions

- TypeScript across frontend, backend, MCP, schema, and exporters.
- React/Vite web application and Node.js/Fastify application server.
- MariaDB/MySQL persistence compatible with Laragon.
- Yjs/Hocuspocus real-time collaboration for up to ten editors per project.
- Separate MCP service. It calls the application API and never accesses the
  database or asset storage directly.
- Portable ClineSR skill delegates live context and edits to MCP tools.
- No external runtime dependencies, telemetry, CDN, or AI provider in v1.
- Local accounts use manual one-time invitation and recovery links.
- Project links require authenticated, explicitly invited members.
- UI languages: Brazilian Portuguese, English, and Korean.
- SEDA visual identity uses Samsung Blue `#1428A0`, black, white, and neutral
  grays. Theme starts from the operating-system preference and stores a manual
  override in `localStorage`.

## Architecture

Use npm workspaces. Applications are `web`, `server`, `mcp-server`, and a local
`mcp-stdio` bridge. Shared packages own contracts, document schema, command
engine, renderer, exporters, UI tokens, and test fixtures. Domain packages do
not import web frameworks, database clients, or MCP SDKs.

The application server is the sole authority for authentication, ACLs,
projects, comments, versions, exports, MariaDB, and asset storage. Hocuspocus
attaches to the application server. MCP uses delegated user credentials when
calling the versioned internal API.

## Semantic Document

A project contains pages, responsive artboards, and a typed node tree. Initial
nodes include flex/grid containers, text, image, icon, link, button, input,
form, repeater, conditional, overlay, and component instance. Interactions are
declarative: navigation, local state changes, overlay control, variable updates,
and local collection filtering. Arbitrary JavaScript is forbidden.

All changes use validated atomic command batches with stable IDs, a base
revision, actor identity, and idempotency key. UI and MCP execute the same
commands. Named-version restoration creates a new version and never erases
history.

## User Experience

The workspace uses a compact studio layout: pages/layers/assets on the left,
large DOM canvas in the center, and switchable inspector/chat on the right.
Roles are owner, editor, commenter, and viewer. Comments anchor to a node and
position. Project content is not persisted for offline use; short disconnects
retain pending changes only in memory and warn before tab close.

## Export and Library

Export project, page, or selection. Static export produces semantic HTML,
organized CSS, modular JavaScript, and local assets. React and Preact exports
produce Vite TypeScript projects. Structured generators, not LLM prompts,
produce and format code. Every export is validated and compiled before
download.

Kits contain versioned tokens, typography, assets, and semantic components.
Templates contain versioned document snapshots and pin their kit version.
Users create private drafts; administrators approve immutable global releases.

## Quality and Operations

Use strict TDD. Unit, property, integration, contract, Playwright, security,
visual, export-build, and load tests cover the system. Target 100 active users,
10 simultaneous editors, and 1,000-node documents. Production runs on Windows
with Node 24 LTS and Laragon MariaDB/MySQL. Linux development uses Docker
Compose. Windows scripts provide start, stop, health, migrate, backup, restore,
and smoke-test operations consumable by the existing process manager.

