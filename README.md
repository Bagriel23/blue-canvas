# Blue Canvas

Plataforma web interna e on-premise para criar protótipos semânticos,
compartilhar projetos e exportar código determinístico. O produto é inspirado no
Pen e no Claude Design, mas foi desenhado para operar sem tokens de serviços
externos, telemetria, CDNs ou serviços de IA externos.

> Estado atual: o modelo de documento, o motor de comandos, os exportadores e a
> fundação da API estão implementados. Editor web, colaboração em tempo real,
> kits/templates e MCP ainda estão em desenvolvimento. Consulte
> [Status e roadmap](docs/status-e-roadmap.md).

## Início rápido

Requisitos: Node.js 24, npm 11.19.0 e Docker com Compose.

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
cp .env.example .env
set -a
source .env
set +a
docker compose up -d --wait mariadb
npm run db:migrate
npm run check
npm run start -w @blue-canvas/server
```

A API escuta em `http://127.0.0.1:3000/api/v1` com a configuração de
desenvolvimento. Ainda não há um servidor de frontend utilizável.

## Documentação

- [Arquitetura e mapa do monorepo](docs/arquitetura.md)
- [Desenvolvimento local, npm, Docker e Laragon](docs/desenvolvimento.md)
- [Configuração e variáveis de ambiente](docs/configuracao.md)
- [API, autenticação, autorização e segurança](docs/api-e-seguranca.md)
- [Documento semântico e motor de comandos](docs/documento-e-comandos.md)
- [Exportadores HTML, React e Preact](docs/exportadores.md)
- [Testes e qualidade](docs/testes-e-qualidade.md)
- [Implantação e operação](docs/implantacao-e-operacao.md)
- [Status e roadmap](docs/status-e-roadmap.md)
- [Especificação de produto aprovada](docs/superpowers/specs/2026-08-24-blue-canvas-design.md)
- [Plano de implementação aprovado](docs/superpowers/plans/2026-08-24-blue-canvas-v1.md)

## Comandos principais

| Comando                                | Finalidade                                 |
| -------------------------------------- | ------------------------------------------ |
| `npm run check`                        | Formatação, lint, tipos, build e testes    |
| `npm test`                             | Smoke tests e testes Vitest                |
| `npm run test:integration`             | Migrações e integração MariaDB/MySQL       |
| `npm run test:export-fixtures`         | Compila fixtures React e Preact exportadas |
| `npm run db:generate`                  | Gera o Prisma Client                       |
| `npm run db:migrate`                   | Aplica as migrations versionadas           |
| `npm run build`                        | Gera Prisma e compila todos os workspaces  |
| `npm run start -w @blue-canvas/server` | Inicia a API compilada                     |

Use `npm install` apenas ao alterar dependências. Use `npm ci` para instalações
limpas e reproduzíveis.
