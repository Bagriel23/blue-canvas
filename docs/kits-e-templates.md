# Kits e templates

Kits e templates são bundles semânticos versionados que aparecem na `Biblioteca`
do aplicativo web. Estão implementados no pacote `@blue-canvas/library`,
servidos pela API Fastify e consumidos pelo cliente React.

## Manifestos

Um **kit** contém tokens (cor, dimensão, número, texto, boolean, família e peso
de fonte), entradas tipográficas, ativos e componentes semânticos. Todo kit
carrega um `slug` kebab-case, uma versão semver `major.minor.patch` e um
identificador UUID. Os schemas Zod recusam chaves reservadas (`__proto__`,
`constructor`, `prototype`) e cores fora do domínio válido.

Um **template** aponta para uma referência de kit (`kitSlug` + `kitVersion`) e
embarca um `DesignDocument` v1 válido. O template só pode ser criado ou
publicado enquanto houver um kit publicado com o mesmo `kitSlug` cuja versão
seja compatível — mesmo major e igual ou maior que a requerida.

## Ciclo de vida

Cada registro passa por três estados: `draft`, `published` e `deprecated`.

- Somente administradores podem criar ou duplicar rascunhos pela API. O autor do
  rascunho e os administradores conseguem visualizá-lo durante a revisão.
- Somente administradores promovem rascunhos a `published`; a promoção bloqueia
  rascunhos já publicados (`AlreadyPublishedError`) e recusa operadores sem
  privilégio (`NotAdminError`).
- `deprecated` marca kits publicados que não devem mais ser referenciados; o
  registro permanece imutável para não quebrar templates existentes.
- Duplicar um kit ou template gera um novo rascunho com um bump de `patch` na
  versão; o histórico permanece intacto.

## Compatibilidade de templates

`ensureKitCompatible` valida uma referência procurando kits publicados com o
`kitSlug` correspondente. Rascunhos são considerados quando não existe kit
publicado com o mesmo slug (útil enquanto uma versão nova de kit está em
revisão). Se nenhum kit satisfizer a versão, o template é marcado como
`incompatible` na listagem — a UI web exibe a razão retornada pelo servidor.

## Entrega padrão

Na primeira inicialização, o `LibraryService` grava (via `upsert` idempotente)
três kits e seis templates de referência. Os registros ficam persistidos no
MariaDB/Prisma e são hidratados em memória nas inicializações seguintes:

- Kits: **SEDA Enterprise** (Samsung Blue `#1428A0`), **Wireframe**
  (baixa-fidelidade) e **Neutral Product** (superfícies neutras).
- Templates: `operations-dashboard`, `records-crud`, `onboarding-form`,
  `sign-in`, `account-settings` e `mobile-inbox`, todos publicados em `1.0.0`
  referenciando um dos kits acima.

## Endpoints

Todas as rotas exigem autenticação. `GET` responde a qualquer usuário
autenticado; toda mutação (`POST` de criação, publicação, duplicação,
depreciação, `PATCH` ou `DELETE`) exige `user.isAdmin` e, quando a autenticação
usa PAT, o escopo `admin`.

| Método   | Rota                                      | Descrição                                                                |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/api/v1/library/kits`                    | Lista kits publicados; rascunhos aparecem apenas para o autor ou admins. |
| `POST`   | `/api/v1/library/kits`                    | Registra um novo rascunho de kit (admin).                                |
| `PATCH`  | `/api/v1/library/kits/:id`                | Atualiza o manifesto de um rascunho (admin).                             |
| `DELETE` | `/api/v1/library/kits/:id`                | Exclui um rascunho (admin).                                              |
| `POST`   | `/api/v1/library/kits/:id/publish`        | Publica o rascunho (admin).                                              |
| `POST`   | `/api/v1/library/kits/:id/duplicate`      | Clona o kit num novo rascunho (admin).                                   |
| `POST`   | `/api/v1/library/kits/:id/deprecate`      | Marca um kit publicado como deprecated (admin).                          |
| `GET`    | `/api/v1/library/templates`               | Lista templates com diagnóstico de compatibilidade.                      |
| `POST`   | `/api/v1/library/templates`               | Registra um novo rascunho de template (admin).                           |
| `PATCH`  | `/api/v1/library/templates/:id`           | Atualiza o manifesto de um rascunho (admin).                             |
| `DELETE` | `/api/v1/library/templates/:id`           | Exclui um rascunho (admin).                                              |
| `POST`   | `/api/v1/library/templates/:id/publish`   | Publica o template (admin).                                              |
| `POST`   | `/api/v1/library/templates/:id/duplicate` | Clona o template num novo rascunho (admin).                              |

## Templates pessoais de projetos

Além dos manifestos administrativos acima, o produto mantém templates pessoais
na tabela MariaDB `project_templates`. Eles armazenam nome, descrição, projeto
de origem e snapshot `DesignDocument` do workspace.

| Método | Rota                             | Descrição                                         |
| ------ | -------------------------------- | ------------------------------------------------- |
| `POST` | `/api/v1/projects/:id/templates` | Salva o snapshot atual (owner/editor).            |
| `GET`  | `/api/v1/templates`              | Lista templates criados pelo usuário autenticado. |
| `POST` | `/api/v1/templates/:id/projects` | Cria um projeto a partir do snapshot do owner.    |

A cópia recebe novo id e nome de projeto, preservando páginas, nós e interações
do documento original. A implementação usa `InMemoryRepository` nos testes e
`PrismaRepository` com MariaDB/MySQL em produção, sem dependência de Docker. O
salvamento revalida a função `owner/editor` dentro da transação e bloqueia as
linhas do projeto e da associação do ator (`SELECT ... FOR UPDATE` no MariaDB),
evitando alterações concorrentes de arquivamento ou ACL entre a checagem e a
criação do template.

## Limitações atuais

- O `LibraryService` administrativo persiste seus manifestos em MariaDB/Prisma
  (ou no repositório em memória em testes), incluindo os seeds e as operações de
  criação, edição e exclusão de drafts.
- A UI ainda não oferece edição ou exclusão de templates pessoais de projetos.
- Releases publicados continuam imutáveis; drafts administrativos podem ser
  editados por `PATCH` e excluídos por `DELETE` usando as rotas do manifest.
- A UI web lê kits/templates administrativos; criação, publicação e duplicação
  desses manifestos ainda precisam ser feitas por chamadas diretas à API.
