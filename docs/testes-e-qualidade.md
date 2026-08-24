# Testes e qualidade

## Pipeline local

```bash
npm run check
```

O comando executa, nesta ordem:

1. `prettier --check .`;
2. ESLint com presets strict e stylistic do typescript-eslint;
3. typecheck TypeScript com project references;
4. geração do Prisma Client e build de todos os workspaces;
5. smoke tests Node e testes Vitest.

O TypeScript compartilhado usa modo strict. Código gerado do Prisma, `dist`,
`coverage` e `node_modules` ficam fora do lint.

## Suítes

- `tests/foundation.test.mjs`: workspaces, versões, Compose e CI.
- `packages/document/src/*.test.ts`: schema, referências, serialização e JSON
  Schema.
- `packages/commands/src/*.test.ts`: comandos, invariantes, idempotência,
  histórico, preflight e propriedades com fast-check.
- `packages/exporters/src/*.test.ts`: goldens, segurança, runtime, build real e
  conformidade entre targets.
- `apps/server/src/*.test.ts`: API em memória, segurança, configuração e
  storage.
- `apps/server/test/*.integration.test.ts`: adapter Prisma contra MariaDB/MySQL
  real.

## Banco real

```bash
docker compose up -d --wait mariadb
npm run test:integration
```

`test:integration` compila os contratos, gera o Prisma Client, aplica migrations
e roda de forma não paralela. A suíte remove dados das tabelas antes de cada
caso: use uma instância descartável.

## CI

`.github/workflows/ci.yml` executa no Node definido em `.nvmrc`, instala npm
11.19.0 e roda `npm ci`. O job principal executa `npm run check` sem banco. Uma
matriz separada aplica as migrations e roda `npm run test:integration` em
MariaDB 10.6.28 e MySQL 8.0.46. Actions e imagens estão fixadas por SHA.

## Antes de abrir revisão

```bash
npm run check
docker compose up -d --wait mariadb
npm run test:integration
git diff --check
```

Testes Playwright, visuais, colaboração com dois usuários, carga e smoke tests
Windows ainda são parte do roadmap. Ausência dessas suítes não deve ser
interpretada como validação do produto completo.
