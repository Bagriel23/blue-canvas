# Implantação e operação

## Estado operacional

O repositório entrega atualmente a API compilada, o endpoint WebSocket de
colaboração e migrations. O Compose é voltado ao banco de desenvolvimento, não é
uma topologia de produção. Reverse proxy, serviço Windows, backup/restore
automatizado, frontend e MCP ainda não foram entregues.

## Sequência de implantação da API

1. Instale Node.js 24 e npm 11.19.0.
2. Disponibilize MariaDB/MySQL e um usuário com permissões no database.
3. Crie um diretório privado e absoluto para assets.
4. Injete todas as variáveis descritas em [Configuração](configuracao.md).
5. Execute `npm ci --include=dev` e `npm run build` no artefato aprovado.
6. Execute `npm run db:migrate` antes de iniciar a nova versão.
7. Opcionalmente, remova ferramentas de build com `npm prune --omit=dev`.
8. Inicie com `npm run start -w @blue-canvas/server` pelo process manager.
9. Verifique `/api/v1/health` e `/api/v1/ready`.

As migrations usam `prisma migrate deploy`; não geram migration em produção. O
processo trata `SIGINT` e `SIGTERM`, fecha o Fastify e desconecta o Prisma. O
uso de `--include=dev` é necessário mesmo com `NODE_ENV=production`, pois
TypeScript e Prisma CLI são ferramentas de build/migration em `devDependencies`.

## Reverse proxy

- Termine TLS no proxy e encaminhe para a interface privada da API.
- Preserve `Host` e defina limites coerentes de corpo e timeout.
- Habilite upgrade WebSocket em `/api/v1/collaboration` e preserve cookies.
- Não publique `ASSET_STORAGE_ROOT` como diretório estático.
- Restrinja a API à rede corporativa e mantenha o banco fora da rede pública.
- Monitore `health`, `ready`, status HTTP e logs estruturados.

O código ainda não configura `trustProxy`, CORS, rate limiting ou headers de
hardening. Avalie e implemente esses controles antes de expor a API além de um
proxy corporativo restrito.

## Bootstrap e acesso

Depois da primeira implantação, chame `/api/v1/auth/bootstrap-admin` com o
`SETUP_SECRET`. Apenas um bootstrap concorrente é aceito. Contas seguintes são
criadas por convites manuais de uso único.

Links de convite e PATs são segredos. Entregue-os por canal corporativo aprovado
e não os registre em tickets, logs ou shell history compartilhado.

## Backup e restauração

Um backup consistente precisa incluir:

- dump do database MariaDB/MySQL;
- cópia de `ASSET_STORAGE_ROOT` preservando conteúdo e permissões;
- versão da aplicação e migrations usadas.

Automação de backup/restore ainda está pendente. Até ela existir, defina um
runbook corporativo, teste restaurações em ambiente isolado e mantenha retenção
compatível com a política interna. Restaurar somente o banco ou somente assets
pode deixar metadados sem arquivo ou arquivos órfãos.

## Atualização e rollback

Faça backup antes da migration. O projeto ainda não fornece migrations de
rollback automáticas. Para reverter, restaure banco e assets do mesmo ponto e
execute a versão correspondente da aplicação.

Para Windows/Laragon, faltam scripts PowerShell de start, stop, migrate, health,
backup e restore. O fluxo manual de desenvolvimento está descrito em
[Desenvolvimento local](desenvolvimento.md).
