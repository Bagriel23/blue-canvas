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
continuam sujeitos ao papel do usuário no projeto.

Tokens brutos de sessão, convite, CSRF e PAT não são persistidos. O servidor
armazena hashes SHA-256. Senhas usam Argon2id. Convites e PATs são exibidos em
texto puro apenas na criação.

## Rotas públicas

| Método | Rota                       | Finalidade                                       |
| ------ | -------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                  | Liveness do processo                             |
| `GET`  | `/ready`                   | Readiness, incluindo repositório                 |
| `POST` | `/auth/bootstrap-admin`    | Cria o primeiro administrador com `SETUP_SECRET` |
| `POST` | `/auth/login`              | Cria sessão e retorna CSRF                       |
| `POST` | `/auth/invitations/accept` | Consome convite e cria conta/sessão              |

O bootstrap só funciona se não existir usuário. Senhas aceitas têm de 12 a 1.024
caracteres. Locales aceitos atualmente: `en-US`, `pt-BR` e `es`.

## Rotas autenticadas

Todas as rotas abaixo são relativas a `/api/v1`.

| Método   | Rota                                   | Regra principal                                     | Escopo PAT               |
| -------- | -------------------------------------- | --------------------------------------------------- | ------------------------ |
| `GET`    | `/auth/me`                             | Sessão ou PAT válido                                | Nenhum escopo específico |
| `POST`   | `/auth/logout`                         | Somente sessão e CSRF                               | Não permitido            |
| `POST`   | `/invitations`                         | Administrador                                       | `admin`                  |
| `POST`   | `/projects`                            | Usuário autenticado                                 | `projects:write`         |
| `GET`    | `/projects`                            | Usuário autenticado                                 | `projects:read`          |
| `GET`    | `/projects/:projectId`                 | Membro do projeto                                   | `projects:read`          |
| `PATCH`  | `/projects/:projectId`                 | Owner/editor para nome; somente owner para arquivar | `projects:write`         |
| `POST`   | `/projects/:projectId/archive`         | Somente owner                                       | `projects:write`         |
| `POST`   | `/projects/:projectId/members`         | Somente owner                                       | `projects:write`         |
| `POST`   | `/projects/:projectId/invitations`     | Somente owner                                       | `projects:write`         |
| `PATCH`  | `/projects/:projectId/members/:userId` | Somente owner                                       | `projects:write`         |
| `DELETE` | `/projects/:projectId/members/:userId` | Somente owner; owner não pode ser removido          | `projects:write`         |
| `POST`   | `/personal-access-tokens`              | Somente sessão e CSRF                               | Não permitido            |
| `GET`    | `/personal-access-tokens`              | Somente sessão                                      | Não permitido            |
| `DELETE` | `/personal-access-tokens/:tokenId`     | Somente sessão e CSRF                               | Não permitido            |
| `GET`    | `/audit-events`                        | Administrador                                       | `admin`                  |
| `GET`    | `/projects/:projectId/audit-events`    | Somente owner                                       | `projects:read`          |
| `POST`   | `/projects/:projectId/assets`          | Owner/editor                                        | `assets:write`           |

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

Permissões de edição semântica e comentários serão adicionadas com a camada de
colaboração. Elas não existem na API atual.

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
de setup, token de convite e `Set-Cookie`.

Uploads usam `multipart/form-data`, campo `file`, limite de 25 MiB e aceitam
GIF, JPEG, PNG e WebP quando extensão, MIME e assinatura coincidem. O storage é
endereçado por SHA-256, faz escrita atômica e rejeita raízes, diretórios e
arquivos simbólicos. SVG não é aceito pelo endpoint de upload atual.
