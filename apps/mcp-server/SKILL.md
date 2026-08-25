---
name: blue-canvas
description:
  Read Blue Canvas projects, kits, and templates and apply validated command
  batches — on-premise, PAT-authenticated, no external network calls.
---

# Blue Canvas

Blue Canvas is an on-premise collaborative UI editor. This skill exposes the
Blue Canvas Model Context Protocol (MCP) server so an agent can list a user's
projects, inspect the library of kits and templates, create new projects, and
apply command batches against the same versioned API used by the web
application. All requests use a delegated personal access token (PAT) issued by
the Blue Canvas application server; no ambient credentials are stored.

## When to use this skill

- The user asks for the shape of one of their Blue Canvas projects, kits, or
  templates.
- The user wants a new project scaffolded in Blue Canvas.
- The user has already agreed on a change to a project and wants it applied
  through the command engine (no free-form file edits, no shell commands).

If none of the above apply, do not call any tools from this skill.

## Prerequisites

- The user has a Blue Canvas account with an active PAT that carries the scopes
  needed for the intended operation (`projects:read` for reads, `projects:write`
  for command batches and project creation).
- A Blue Canvas MCP server is running locally. The recommended layout is:
  `apps/mcp-server` on `http://127.0.0.1:5011` connected to the Blue Canvas
  application at `BLUE_CANVAS_API_URL`. Use `apps/mcp-stdio` when the client
  only speaks stdio; it forwards to the HTTP server.

## Configuration

Set the following environment variables before launching either binary:

- `BLUE_CANVAS_MCP_URL` — the HTTP endpoint of the MCP server (e.g.
  `http://127.0.0.1:5011/mcp`).
- `BLUE_CANVAS_PAT` — a PAT the user issued with the scopes required for the
  intended tools.

The stdio bridge forwards each newline-delimited JSON-RPC request to the HTTP
server using bearer auth and persists the returned `Mcp-Session-Id`.

## Contract

- Protocol version: `2025-06-18`.
- Transport: JSON-RPC 2.0 over HTTP POST at `/mcp`. Notifications receive
  `204 No Content`. Sessions are tracked with the `Mcp-Session-Id` header.

Resources:

- `blue-canvas://projects` — the projects visible to the delegated user.
- `blue-canvas://kits` — kits available in the library (published plus the
  user's drafts).
- `blue-canvas://templates` — templates with compatibility diagnostics.

Tools:

- `list_projects` — read-only listing.
- `get_project` — retrieve a project by id.
- `create_project` — creates a project owned by the delegated user.
- `apply_commands` — apply a validated command batch to a project. Requires the
  caller's current `baseRevision` and an `idempotencyKey` of at least eight
  characters; retries with the same key are safe.

## Guardrails

- Never store or forward the PAT to third parties. Read it from
  `BLUE_CANVAS_PAT` and pass it only to the Blue Canvas MCP server.
- Never invent tool arguments. Ask the user for missing values (project id,
  command payload, base revision).
- Respect scope errors. If the upstream API rejects a request with `403` or
  `401`, tell the user which scope the PAT needs, do not retry with a different
  action.
- Do not open network connections outside the configured MCP URL.
