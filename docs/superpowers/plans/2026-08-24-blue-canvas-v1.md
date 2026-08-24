# Blue Canvas V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`. Every behavioral task follows TDD.

**Goal:** Deliver an on-premise collaborative semantic UI editor with
deterministic HTML, React, and Preact exports plus a separate MCP service.

**Architecture:** npm-workspace modular monorepo. Pure TypeScript domain
packages define the document and commands. React renders the editor, Fastify
owns application data and collaboration, and MCP delegates through the API.

**Tech Stack:** npm workspaces, Node 24, TypeScript, React, Vite, Fastify,
Prisma, MariaDB, Yjs, Hocuspocus, MCP TypeScript SDK, Zod, Vitest, fast-check,
Testing Library, Playwright, and Docker Compose.

---

### Task 1: Repository foundation

- Create npm workspaces, strict shared TypeScript configuration, linting,
  formatting, Vitest projects, CI scripts, and Docker development files.
- Verify `npm ci`, typecheck, lint, test, and build from the repository root.
- Commit the reproducible scaffold without feature behavior.

### Task 2: Semantic document and commands

- Write failing tests for schema parsing, stable IDs, semantic nodes,
  breakpoints, tokens, declarative interactions, atomic command application,
  revision conflicts, idempotency, undo, and redo.
- Implement pure document and command packages plus JSON Schema publication.
- Add property tests for command sequences and deterministic serialization.

### Task 3: Deterministic exporters

- Write fixtures and failing golden tests for static, React, and Preact output.
- Implement structured generators, shared naming, asset collection, diagnostics,
  formatting, ZIP manifests, and deterministic file ordering.
- Install and build every generated fixture in CI.

### Task 4: Application server foundation

- Write API tests for health, error envelopes, invitation auth, sessions, CSRF,
  projects, membership ACLs, personal tokens, and audit events.
- Implement Fastify modules with repository ports and Prisma/MariaDB adapters.
- Add local content-addressed asset storage and path/upload security tests.

### Task 5: Real-time collaboration

- Write integration tests with two authenticated clients, presence, concurrent
  edits, reconnect, permission rejection, persistence, and named restoration.
- Attach Hocuspocus/Yjs to the server and persist current state plus versions.
- Add comments, mentions, resolution, and in-memory offline warning behavior.

### Task 6: React product shell and editor

- Write component tests for system theme/local override, three locales, home,
  library, workspace panels, selection, inspector, preview, sharing, and export.
- Implement SEDA light/dark tokens, accessible compact studio UI, semantic DOM
  canvas, Moveable/Selecto interactions, and responsive behavior.
- Verify desktop/mobile screenshots and non-overlap with Playwright.

### Task 7: Kits and templates

- Test kit/template manifests, pinned versions, private drafts, admin review,
  immutable publication, duplication, and compatibility diagnostics.
- Ship SEDA Enterprise, Wireframe, and Neutral Product kits plus dashboard,
  CRUD, form, auth, settings, and responsive mobile templates.

### Task 8: Separate MCP service and portable skill

- Write contract tests for resources, tools, delegated identity, scopes,
  idempotency, errors, revocation, and application-server outages.
- Implement Streamable HTTP MCP service and stdio bridge without database or
  storage imports.
- Ship a vendor-neutral `SKILL.md` documenting safe project workflows.

### Task 9: Deployment and acceptance

- Add Docker Compose for Linux and PowerShell scripts for Windows/Laragon.
- Test migrations, health/readiness, backup/restore, structured logs, trace IDs,
  no-external-network defaults, and sanitized sandboxed previews.
- Run full CI, export builds, two-user E2E, security suite, load scenarios, and
  Windows smoke-test documentation before release.

