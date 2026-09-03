# Operação de produção

Este documento descreve o runbook para operar Blue Canvas fora do ambiente de
desenvolvimento local. Todas as instruções assumem que o processo é iniciado a
partir da raiz do repositório e que o `.env` (ou um mecanismo equivalente do
process manager) já exporta as variáveis descritas em
[Configuração](configuracao.md).

## Linux com Docker Compose

O `compose.yaml` inclui um perfil `app` com todos os serviços aplicáveis:

- `mariadb` — banco padrão, já iniciado por `docker compose up mariadb`.
- `api` — servidor Fastify (`@blue-canvas/server`) escutando em
  `127.0.0.1:${APP_PORT:-3000}`.
- `mcp` — servidor MCP (`@blue-canvas/mcp-server`) em
  `127.0.0.1:${MCP_PORT:-5011}` apontando para a API.
- `web` — Vite preview servindo `apps/web/dist/client` em
  `127.0.0.1:${WEB_PORT:-4173}`.

Compilar e subir a stack:

```bash
npm ci
npm run build
export $(grep -v '^#' .env | xargs)
docker compose --profile app up -d --wait
```

Os healthchecks garantem que o Compose só considera cada serviço pronto após
`/api/v1/health` responder. `docker compose --profile app down` desliga sem
apagar dados; `docker compose down -v` remove o volume MariaDB e deve ser usado
apenas se a perda dos dados for intencional.

O Compose não inclui reverse-proxy nem TLS. Coloque um proxy externo (nginx,
Caddy ou o hardware do datacenter) responsável por TLS, cabeçalhos de segurança
e roteamento para as portas locais expostas.

## Windows com Laragon

Os scripts em `scripts/windows/` cobrem o ciclo padrão sobre PowerShell 5.1+:

| Script                      | Descrição                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `start.ps1`                 | `npm ci`, inicia a API e o MCP como processos filhos e grava PIDs em `.pid.api` e `.pid.mcp`.                 |
| `stop.ps1`                  | Encerra os processos cujos PIDs foram gravados por `start.ps1`.                                               |
| `migrate.ps1`               | Executa `npm run db:migrate` após garantir o `npm ci`.                                                        |
| `backup.ps1`                | Gera `database.sql.gz` + `assets.tar.gz` + `SHA256SUMS` em `backups/<timestamp>/`.                            |
| `restore.ps1 -Source <dir>` | Valida checksums, reinstala o backup e restaura os assets. `-Force` autoriza sobrescrever um banco não vazio. |
| `smoke.ps1`                 | Chama `/api/v1/health` e `/api/v1/ready` no servidor local.                                                   |

Todos importam `_common.ps1`, que valida `APP_HOST`, `APP_PORT`,
`ASSET_STORAGE_ROOT`, `SETUP_SECRET` e todas as variáveis `DATABASE_*` antes de
iniciar.

## Backup e restore

Os scripts `scripts/backup.sh` e `scripts/restore.sh` funcionam no Linux e nos
containers do Compose. O backup produz três arquivos por execução:

- `database.sql.gz` — dump completo
  (`mysqldump --single-transaction --routines --triggers`).
- `assets.tar.gz` — conteúdo bruto do `ASSET_STORAGE_ROOT`.
- `SHA256SUMS` — checksums para verificação antes do restore.

`restore.sh` compara os checksums, recusa restaurar sobre um banco não vazio
salvo com `BLUE_CANVAS_FORCE_RESTORE=1`, valida o diretório dedicado e seu
marcador `.blue-canvas-assets-root`, limpa somente os filhos desse diretório
preservando o marcador e restaura o tarball dos assets. Automatize com cron/
Task Scheduler tomando cuidado para armazenar os backups fora da máquina de
produção.

## Observabilidade e sanitização

- Todos os processos usam pino com `redact` para cookies, senhas e tokens; o id
  do request aparece como `traceId` em toda a linha.
- O reverse proxy deve encaminhar `X-Request-Id` para o servidor de aplicação; o
  Fastify o reaproveita como trace id da requisição.
- Nenhum serviço faz chamadas externas por padrão — sem AI provider, CDN,
  telemetria ou tokens de terceiros. Auditorias devem confirmar que o firewall
  do host bloqueia egress fora dos IPs internos (banco, storage e clientes).
- A prévia sandboxed do canvas roda em `bc-preview` do bundle Vite, isolada da
  camada de dados; nenhuma execução de JavaScript arbitrária é permitida.

## Aceite

Antes de liberar um build:

1. `npm run check` na raiz (formato, lint, typecheck, build, testes unitários).
2. `npm run test:integration` com MariaDB 10.6 e MySQL 8.0.
3. `docker compose --profile app up --wait` seguido de `scripts/backup.sh` e
   `scripts/restore.sh` em uma cópia limpa.
4. Nos hosts Windows, `scripts/windows/smoke.ps1` após `start.ps1` +
   `migrate.ps1`.
5. Se houver playbook Playwright/visual/carga, executá-lo. Ainda não existem
   playbooks automatizados para esses cenários no repositório.
