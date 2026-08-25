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
- Hocuspocus/Yjs no mesmo servidor Fastify, com presença, convergência,
  reconexão, snapshots compactados, versões nomeadas e comentários.
- Revalidação de sessão/PAT e papel a cada atualização, limite de dez editores e
  clientes commenter/viewer estritamente read-only.
- Aplicação web React 19/Vite 8 com tokens SEDA claros/escuros (Samsung Blue
  `#1428A0`), locales pt-BR/en-US/ko-KR, roteador por hash, sessão HTTP com
  CSRF, workspace de três painéis, canvas DOM semântico com seleção por clique e
  teclado e diálogos de compartilhamento e exportação. Detalhes em
  [Aplicação web](aplicacao-web.md).
- Biblioteca de kits e templates com manifestos versionados, ciclo draft →
  published → deprecated, revisão administrativa, duplicação com bump de patch e
  diagnóstico de compatibilidade. Três kits (SEDA Enterprise, Wireframe, Neutral
  Product) e seis templates (dashboard, CRUD, formulário, auth, settings,
  mobile) já são publicados na inicialização. Detalhes em
  [Kits e templates](kits-e-templates.md).
- Serviço MCP em `apps/mcp-server` com transporte JSON-RPC/HTTP, resources para
  projetos/kits/templates, tools `list_projects`, `get_project`,
  `create_project` e `apply_commands`, ponte stdio em `apps/mcp-stdio` e skill
  portável `apps/mcp-server/SKILL.md`. Toda operação delega o PAT do usuário e o
  serviço não acessa banco ou storage diretamente. Detalhes em
  [MCP e skill](mcp-e-skill.md).
- Testes unitários, propriedades, contrato, export build, componente (happy-dom
  \+ Testing Library) e integração em MariaDB 10.6/MySQL 8.0.

## Em desenvolvimento

### Operação e aceite

Compose de aplicação completo, scripts PowerShell/Laragon, proxy/hardening,
backup/restore, testes Playwright e visuais, E2E com dois usuários, carga,
segurança integrada e smoke test Windows.

## Limitações atuais importantes

- A biblioteca de kits e templates ainda armazena registros em memória; os
  drafts criados por usuários somem quando o processo é reiniciado. A camada
  Prisma para library ainda não existe.
- A aplicação web ainda não consome Hocuspocus/Yjs: o workspace opera com um
  documento fixture local em `apps/web/src/fixtures/demo.ts` e as edições não
  são persistidas no servidor.
- Não há endpoint de exportação ou empacotamento ZIP no servidor; existe a
  biblioteca em `packages/exporters` e o diálogo web já constrói a requisição
  esperada.
- Não há download/listagem de assets na API.
- Não há transformações estilo Moveable/Selecto no canvas — a seleção é por
  clique e navegação por teclado.
- Não há Playwright, screenshots de referência ou testes visuais automatizados.
- Não há MCP funcional nem integração com agente de IA.
- Não há recursos offline persistentes.
- A API ainda não tem OpenAPI, rate limiting ou automação operacional de
  produção.

## Critério para marcar uma etapa como concluída

Uma capacidade só deve migrar para “Implementado” quando código, testes e
integração correspondente existirem no branch. Decisões da especificação não são
evidência de implementação.
