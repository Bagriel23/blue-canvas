# Arquitetura

## Visão geral

Blue Canvas é um monorepo TypeScript com npm workspaces. O desenho separa o
modelo de prototipagem, as mutações e a geração de código das camadas de HTTP,
banco de dados e interface. Essa separação permite que, futuramente, editor web
e MCP usem o mesmo contrato sem duplicar regras.

```text
Editor React (pendente)       MCP HTTP/stdio (pendente)
            |                           |
            +-------- API /api/v1 ------+
                           |
                 Fastify + domínio
                    |            |
              Prisma/MariaDB   Assets locais

                 packages/document
                  /             \
       packages/commands   packages/exporters
```

A API é a autoridade para identidade, ACL, projetos, auditoria, persistência e
assets. O MCP planejado deverá chamar a API com credenciais delegadas, sem
acesso direto ao MariaDB ou ao diretório de assets.

## Aplicações

| Workspace         | Responsabilidade                                                    | Estado          |
| ----------------- | ------------------------------------------------------------------- | --------------- |
| `apps/server`     | API Fastify, domínio, portas de repositório, Prisma e storage local | Implementado    |
| `apps/web`        | Editor React/Vite e shell do produto                                | Apenas scaffold |
| `apps/mcp-server` | Servidor MCP HTTP separado                                          | Apenas scaffold |
| `apps/mcp-stdio`  | Ponte MCP para clientes locais como ClineSR                         | Apenas scaffold |

## Pacotes

| Workspace            | Responsabilidade                                   | Estado          |
| -------------------- | -------------------------------------------------- | --------------- |
| `packages/contracts` | Schemas Zod e tipos das entradas HTTP              | Implementado    |
| `packages/document`  | Documento semântico v1, validação e JSON Schema    | Implementado    |
| `packages/commands`  | Batches atômicos, revisão, idempotência, undo/redo | Implementado    |
| `packages/exporters` | Geração determinística para HTML, React e Preact   | Implementado    |
| `packages/renderer`  | Renderização compartilhada                         | Apenas scaffold |
| `packages/ui`        | Tokens e componentes visuais SEDA                  | Apenas scaffold |
| `packages/testing`   | Fixtures e utilitários comuns                      | Apenas scaffold |

## Limites arquiteturais

- O formato semântico não contém JavaScript arbitrário.
- Toda mutação do documento passa por comandos validados e atômicos.
- Exportação é feita por geradores estruturados, não por resposta de LLM.
- O servidor usa portas de domínio. `PrismaRepository` e `LocalAssetStorage` são
  adaptadores substituíveis.
- A API usa o provider Prisma `mysql`. O Compose fixa MariaDB 10.6.28 como alvo
  conservador compatível com Laragon; a CI também valida MySQL 8.0.46.
- Integrações externas e provedor de IA permanecem desativados no v1.

## Persistência atual

As migrations criam usuários, sessões, convites, projetos, membros, personal
access tokens, auditoria, assets e locks de sistema. Conteúdo do documento,
versões, comentários e estado Yjs pertencem à etapa de colaboração e ainda não
estão persistidos.

Para decisões de produto e requisitos não implementados, consulte a
[especificação aprovada](superpowers/specs/2026-08-24-blue-canvas-design.md) e o
[plano aprovado](superpowers/plans/2026-08-24-blue-canvas-v1.md).
