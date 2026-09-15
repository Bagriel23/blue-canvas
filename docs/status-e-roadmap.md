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
- Workspace conectado ao documento semântico persistido via
  `GET /api/v1/projects/:id/document`, com loading/error/retry, título do
  projeto, comandos `update-node` otimistas, fila HTTP serializada, idempotência
  e rebase local em conflitos de revisão.
- Prévia navegável baseada no documento: ações de clique/submit/change executam
  navegação entre páginas, histórico voltar, reset, variáveis condicionais e
  abertura/fechamento de overlays; nós invisíveis permanecem ocultos e links
  externos passam por validação de esquema.
- Times e compartilhamento básico de projetos: a API persiste times e membros em
  memória ou MariaDB/Prisma, com papéis owner/admin/member; a aplicação web
  lista e cria times, consulta membros, cria convites de projeto com papel e
  permite remover acessos pelo diálogo de compartilhamento.
- Biblioteca de kits e templates com manifestos versionados, ciclo draft →
  published → deprecated, revisão administrativa, duplicação com bump de patch e
  diagnóstico de compatibilidade. Três kits (SEDA Enterprise, Wireframe, Neutral
  Product) e seis templates (dashboard, CRUD, formulário, auth, settings,
  mobile) já são publicados na inicialização. Detalhes em
  [Kits e templates](kits-e-templates.md).
- Templates pessoais persistentes: owners e editores de projetos podem salvar um
  snapshot do canvas; o owner pode listar seus templates e criar um novo projeto
  a partir deles. O snapshot usa a mesma representação semântica do documento e
  funciona tanto no repositório em memória quanto em MariaDB/Prisma.
- Serviço MCP em `apps/mcp-server` com transporte JSON-RPC/HTTP, resources para
  projetos/kits/templates, tools `list_projects`, `get_project`,
  `create_project` e `apply_commands`, ponte stdio em `apps/mcp-stdio` e skill
  portável `apps/mcp-server/SKILL.md`. Toda operação delega o PAT do usuário e o
  serviço não acessa banco ou storage diretamente. Detalhes em
  [MCP e skill](mcp-e-skill.md).
- Perfil `app` do Docker Compose com serviços `api`, `web` e `mcp` além do
  MariaDB, scripts `scripts/backup.sh` e `scripts/restore.sh` para snapshots
  MySQL+assets, scripts PowerShell (`scripts/windows/*.ps1`) para
  Windows/Laragon e o runbook em [Operação](operacao.md).
- Testes unitários, propriedades, contrato, export build, componente (happy-dom
  \+ Testing Library) e integração em MariaDB 10.6/MySQL 8.0.

## Em desenvolvimento

### Ainda pendente

Reverse-proxy padrão do Compose, testes Playwright/visuais, E2E com dois
usuários simultâneos, cenários de carga e cobertura CI para o smoke test
Windows.

## Limitações atuais importantes

- Os manifestos administrativos de kits e templates e os templates pessoais de
  projetos são persistidos em MariaDB/Prisma; o modo de memória permanece
  disponível para testes e desenvolvimento sem banco.
- O workspace web ainda não integra o cliente Hocuspocus/Yjs; a colaboração
  simultânea e a presença permanecem na próxima etapa.
- O endpoint HTTP de exportação e o empacotamento ZIP ainda estão pendentes; a
  biblioteca determinística em `packages/exporters` e o diálogo web existem.
- Não há download/listagem de assets na API.
- Não há transformações estilo Moveable/Selecto no canvas — a seleção é por
  clique e navegação por teclado.
- Não há Playwright, screenshots de referência ou testes visuais automatizados.
- O MCP funcional não inclui ainda integração com um agente de IA; o PAT é
  delegado ao upstream e os guardrails ficam na skill portável.
- Não há recursos offline persistentes.
- A API ainda não tem OpenAPI, rate limiting ou automação operacional de
  produção.

## Critério para marcar uma etapa como concluída

Uma capacidade só deve migrar para “Implementado” quando código, testes e
integração correspondente existirem no branch. Decisões da especificação não são
evidência de implementação.
