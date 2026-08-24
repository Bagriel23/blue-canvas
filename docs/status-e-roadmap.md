# Status e roadmap

Este documento descreve o estado observado no código. O plano completo está em
[Blue Canvas V1 Implementation Plan](superpowers/plans/2026-08-24-blue-canvas-v1.md).

## Implementado

- Monorepo npm reproduzível com Node 24, npm 11.19.0, TypeScript strict, Vitest,
  ESLint, Prettier, CI e MariaDB por Compose.
- Documento semântico v1, JSON Schema, validação de referências e serialização
  determinística.
- Motor de comandos atômico com revisão, idempotência, undo/redo e limites de
  complexidade.
- Exportação por projeto, página ou seleção para HTML/CSS/JS, React/Vite e
  Preact/Vite, com assets locais, manifest e validações de segurança.
- API Fastify com bootstrap, convites, sessões, CSRF, projetos, membros, PATs,
  auditoria e upload de assets.
- Persistência Prisma compatível com MariaDB/MySQL e storage local endereçado
  por conteúdo.
- Testes unitários, propriedades, contrato, export build e integração em MariaDB
  10.6/MySQL 8.0.

## Em desenvolvimento

### Colaboração em tempo real

Persistência do documento e versões, Yjs/Hocuspocus, presença, edição
concorrente, reconexão, autorização por operação, comentários, menções e
restauração de versão.

### Aplicação web

React/Vite, login/home/library, workspace de três painéis, canvas DOM,
inspector, preview, compartilhamento e exportação. A identidade visual prevista
usa Samsung Blue `#1428A0`, neutros, tema inicial do sistema e preferência
manual persistida em `localStorage`. Locales de produto e do contrato HTTP:
pt-BR, inglês (`en-US`) e coreano (`ko-KR`).

### Kits e templates

Kits versionados, drafts privados, aprovação administrativa, releases imutáveis
e templates que fixam a versão do kit.

### MCP e skill

Servidor MCP Streamable HTTP, bridge stdio e skill portável para ClineSR e
outros agentes. Esses workspaces são apenas scaffolds e não devem ser
configurados em clientes ainda.

### Operação e aceite

Compose de aplicação completo, scripts PowerShell/Laragon, proxy/hardening,
backup/restore, testes Playwright e visuais, E2E com dois usuários, carga,
segurança integrada e smoke test Windows.

## Limitações atuais importantes

- Não há UI web executável.
- Não há persistência nem endpoints para o conteúdo semântico do projeto.
- Não há colaboração, comentários ou versões.
- Não há endpoint de exportação ou empacotamento ZIP; existe a biblioteca.
- Não há download/listagem de assets na API.
- Não há MCP funcional nem integração com agente de IA.
- Não há recursos offline persistentes.
- A API ainda não tem OpenAPI, rate limiting ou automação operacional de
  produção.

## Critério para marcar uma etapa como concluída

Uma capacidade só deve migrar para “Implementado” quando código, testes e
integração correspondente existirem no branch. Decisões da especificação não são
evidência de implementação.
