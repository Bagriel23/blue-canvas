# MCP service e skill

Blue Canvas expõe seu conteúdo para agentes através de um servidor Model Context
Protocol (MCP) hospedado em `apps/mcp-server`. Uma ponte stdio em
`apps/mcp-stdio` encaminha clientes que só falam stdio para o mesmo endpoint
HTTP. Toda operação delega a identidade do usuário: o agente carrega um PAT
emitido pelo servidor da aplicação, o serviço MCP não guarda credenciais e não
acessa banco de dados nem storage diretamente.

## Componentes

- `apps/mcp-server` — servidor Fastify que expõe `POST /mcp` (JSON-RPC 2.0),
  `GET /health` e, para clientes que precisam manter sessão, propaga o header
  `Mcp-Session-Id`. Implementa o subconjunto do MCP Streamable HTTP suficiente
  para os métodos `initialize`, `ping`, `resources/list`, `resources/read`,
  `tools/list`, `tools/call` e as notificações relacionadas.
- `apps/mcp-stdio` — utilitário Node que lê linhas JSON-RPC do stdin, encaminha
  para `BLUE_CANVAS_MCP_URL` usando `BLUE_CANVAS_PAT` como bearer, guarda o
  `Mcp-Session-Id` retornado e imprime a resposta no stdout. Ideal para clientes
  MCP locais (ex.: Cline stdio) sem alterar o servidor.
- `apps/mcp-server/SKILL.md` — skill portável para agentes que descreve escopo
  de uso, ferramentas disponíveis e guardrails obrigatórios.

## Contrato

O MCP anuncia a versão `2025-06-18`. Todas as chamadas exigem um bearer PAT em
`Authorization: Bearer <token>` ou `Mcp-Bearer-Token: Bearer <token>`. Sem
identidade, o servidor devolve `error.code -32001` (não autorizado). Erros
propagados pela API são embalados como `error.code -32010` com o detalhe
`{ code, status, details }`.

Resources:

| URI                       | Descrição                                               |
| ------------------------- | ------------------------------------------------------- |
| `blue-canvas://projects`  | Lista de projetos visíveis para o PAT.                  |
| `blue-canvas://kits`      | Kits da biblioteca (publicados + rascunhos do usuário). |
| `blue-canvas://templates` | Templates com diagnóstico de compatibilidade.           |

Tools:

| Nome             | Escopos          | Descrição                                                          |
| ---------------- | ---------------- | ------------------------------------------------------------------ |
| `list_projects`  | `projects:read`  | Lista projetos do usuário.                                         |
| `get_project`    | `projects:read`  | Retorna um projeto pelo id.                                        |
| `create_project` | `projects:write` | Cria um projeto com o usuário como owner.                          |
| `apply_commands` | `projects:write` | Aplica um batch validado; exige `baseRevision` e `idempotencyKey`. |

## Como rodar

```bash
BLUE_CANVAS_API_URL=http://127.0.0.1:3000 \
MCP_HOST=127.0.0.1 MCP_PORT=5011 \
npm run start -w @blue-canvas/mcp-server

BLUE_CANVAS_MCP_URL=http://127.0.0.1:5011/mcp \
BLUE_CANVAS_PAT=pat_xxxxx \
node apps/mcp-stdio/dist/index.js
```

Não use a ponte stdio em cenários não confiáveis: qualquer processo que ganhar
acesso ao PAT herda todas as permissões do usuário.

## Limitações atuais

- O servidor implementa apenas o transporte JSON-RPC/HTTP; streaming SSE do
  Streamable HTTP oficial ainda não é suportado. Notificações do servidor para o
  cliente serão adicionadas quando um caso de uso demandar.
- Não há autenticação OAuth ou fluxo de discovery — o PAT deve ser fornecido
  pelo usuário e nunca compartilhado com terceiros.
- Escopos são validados pela API upstream, não pelo MCP; ferramentas cujo PAT
  não carrega o escopo esperado retornam `403` embalado como erro upstream.
- Não há suporte a `prompts/*` e `logging/*` do MCP.
