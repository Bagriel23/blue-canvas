# API e segurança

A API Fastify usa o prefixo `/api/v1`. Não há OpenAPI gerado nesta etapa; os
schemas de entrada vivem em `packages/contracts`.

## Autenticação

Há dois modos:

- Sessão por cookie `blue_canvas_session`, `HttpOnly`, `SameSite=Strict`, com
  duração de sete dias. Em produção o cookie também é `Secure`.
- Personal access token no header `Authorization: Bearer <token>`.

Requisições mutáveis autenticadas por cookie precisam enviar o token retornado
no login em `X-CSRF-Token`. PATs não usam CSRF, mas precisam do escopo exigido e
continuam sujeitos ao papel do usuário no projeto. O endpoint somente leitura
`/auth/me` aceita ambos os modos: para uma sessão ele renova o `csrfToken`; para
um PAT retorna a mesma identidade com `csrfToken: null`, sem emitir ou persistir
segredo de CSRF.

Tokens brutos de sessão, convite, CSRF e PAT não são persistidos. O servidor
armazena hashes SHA-256. Senhas usam Argon2id. Convites e PATs são exibidos em
texto puro apenas na criação. Links manuais de convite carregam o token no
fragmento `#token=...`, que não faz parte da URL enviada ao servidor.

## Rotas públicas

| Método | Rota                       | Finalidade                                       |
| ------ | -------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                  | Liveness do processo                             |
| `GET`  | `/ready`                   | Readiness, incluindo repositório                 |
| `POST` | `/auth/bootstrap-admin`    | Cria o primeiro administrador com `SETUP_SECRET` |
| `POST` | `/auth/login`              | Cria sessão e retorna CSRF                       |
| `POST` | `/auth/invitations/accept` | Consome convite e cria conta/sessão              |

O bootstrap só funciona se não existir usuário. Senhas aceitas têm de 12 a 1.024
caracteres. Locales aceitos atualmente: `en-US`, `pt-BR` e `ko-KR`.

## Rotas autenticadas

Todas as rotas abaixo são relativas a `/api/v1`.

| Método   | Rota                                        | Regra principal                                     | Escopo PAT               |
| -------- | ------------------------------------------- | --------------------------------------------------- | ------------------------ |
| `GET`    | `/auth/me`                                  | Sessão ou PAT válido                                | Nenhum escopo específico |
| `POST`   | `/auth/logout`                              | Somente sessão e CSRF                               | Não permitido            |
| `POST`   | `/invitations`                              | Administrador                                       | `admin`                  |
| `POST`   | `/projects`                                 | Usuário autenticado                                 | `projects:write`         |
| `GET`    | `/projects`                                 | Usuário autenticado                                 | `projects:read`          |
| `GET`    | `/projects/:projectId`                      | Membro do projeto                                   | `projects:read`          |
| `PATCH`  | `/projects/:projectId`                      | Owner/editor para nome; somente owner para arquivar | `projects:write`         |
| `POST`   | `/projects/:projectId/archive`              | Somente owner                                       | `projects:write`         |
| `POST`   | `/projects/:projectId/members`              | Somente owner                                       | `projects:write`         |
| `POST`   | `/projects/:projectId/invitations`          | Somente owner                                       | `projects:write`         |
| `PATCH`  | `/projects/:projectId/members/:userId`      | Somente owner                                       | `projects:write`         |
| `DELETE` | `/projects/:projectId/members/:userId`      | Somente owner; owner não pode ser removido          | `projects:write`         |
| `POST`   | `/personal-access-tokens`                   | Somente sessão e CSRF                               | Não permitido            |
| `GET`    | `/personal-access-tokens`                   | Somente sessão                                      | Não permitido            |
| `DELETE` | `/personal-access-tokens/:tokenId`          | Somente sessão e CSRF                               | Não permitido            |
| `GET`    | `/audit-events`                             | Administrador                                       | `admin`                  |
| `GET`    | `/projects/:projectId/audit-events`         | Somente owner                                       | `projects:read`          |
| `POST`   | `/projects/:projectId/assets`               | Owner/editor                                        | `assets:write`           |
| `GET`    | `/projects/:projectId/versions`             | Qualquer membro; projeto ativo                      | `projects:read`          |
| `POST`   | `/projects/:projectId/versions`             | Owner/editor                                        | `projects:write`         |
| `GET`    | `/projects/:projectId/versions/:id`         | Qualquer membro; projeto ativo                      | `projects:read`          |
| `POST`   | `/projects/:projectId/versions/:id/restore` | Owner/editor; cria nova versão                      | `projects:write`         |
| `GET`    | `/projects/:projectId/comments`             | Qualquer membro; projeto ativo                      | `projects:read`          |
| `POST`   | `/projects/:projectId/comments`             | Owner/editor/commenter                              | `projects:write`         |
| `GET`    | `/projects/:projectId/comments/:id`         | Qualquer membro; projeto ativo                      | `projects:read`          |
| `PATCH`  | `/projects/:projectId/comments/:id`         | Autor owner/editor/commenter                        | `projects:write`         |
| `POST`   | `/projects/:projectId/comments/:id/resolve` | Owner/editor/commenter                              | `projects:write`         |

Escopos PAT disponíveis: `projects:read`, `projects:write`, `assets:read`,
`assets:write` e `admin`. O escopo `assets:read` está reservado: ainda não há
endpoint de leitura/download de assets.

## Papéis de projeto

| Ação atual                           | Owner | Editor | Commenter | Viewer |
| ------------------------------------ | ----- | ------ | --------- | ------ |
| Ler projeto                          | Sim   | Sim    | Sim       | Sim    |
| Renomear projeto                     | Sim   | Sim    | Não       | Não    |
| Arquivar/desarquivar                 | Sim   | Não    | Não       | Não    |
| Gerenciar membros/convites/auditoria | Sim   | Não    | Não       | Não    |
| Enviar assets                        | Sim   | Sim    | Não       | Não    |
| Editar documento em tempo real       | Sim   | Sim    | Não       | Não    |
| Presença e leitura colaborativa      | Sim   | Sim    | Sim       | Sim    |
| Criar/resolver comentários           | Sim   | Sim    | Sim       | Não    |
| Criar/restaurar versão               | Sim   | Sim    | Não       | Não    |

Projetos arquivados não aceitam conexões de colaboração, comentários nem
versões. O autor é o único usuário que pode editar o texto e as menções de um
comentário; owner, editor e commenter podem resolver ou reabrir comentários.
Detalhes do protocolo WebSocket estão em [Colaboração](colaboracao.md).

## Exemplos mínimos

Criação inicial, somente uma vez:

```bash
curl -i http://127.0.0.1:3000/api/v1/auth/bootstrap-admin \
  -H 'content-type: application/json' \
  -d "{\"email\":\"admin@example.com\",\"displayName\":\"Admin\",\"password\":\"troque-esta-senha-forte\",\"locale\":\"pt-BR\",\"setupSecret\":\"${SETUP_SECRET}\"}"
```

O comando pressupõe que `SETUP_SECRET` foi exportado no shell conforme o início
rápido. Não deixe o valor bruto no histórico do terminal em ambientes
compartilhados.

Login salva o cookie e devolve `csrfToken` no JSON:

```bash
curl -c cookies.txt http://127.0.0.1:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"troque-esta-senha-forte"}'
```

Use o valor retornado em uma mutação:

```bash
curl -b cookies.txt http://127.0.0.1:3000/api/v1/projects \
  -H 'content-type: application/json' \
  -H 'x-csrf-token: VALOR_RETORNADO_NO_LOGIN' \
  -d '{"name":"Meu projeto"}'
```

## Erros e rastreabilidade

Erros seguem o envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [],
    "traceId": "identificador-da-requisicao"
  }
}
```

O servidor aceita `X-Request-Id` apenas no formato permitido e sempre devolve
`x-request-id`. Logs Pino removem headers de autorização/cookie, senhas, segredo
de setup, token de convite e `Set-Cookie`. Cada mutação auditada e seu evento de
auditoria são gravados na mesma transação do banco.

Uploads usam `multipart/form-data`, campo `file`, limite de 25 MiB e aceitam
GIF, JPEG, PNG e WebP estáticos quando extensão, MIME e conteúdo decodificado
coincidem. Largura e altura são limitadas a 8.192 pixels, o raster a 16.777.216
pixels e a decodificação tem timeout. O storage é endereçado por SHA-256, faz
escrita atômica e usa um estado persistido `pending` até a publicação do arquivo
e a finalização auditada como `ready`. Readiness reconcilia publicações
pendentes antigas. O adapter rejeita raízes, diretórios e arquivos simbólicos.
SVG e imagens animadas não são aceitos pelo endpoint de upload atual.
