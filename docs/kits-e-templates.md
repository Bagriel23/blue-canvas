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

- Qualquer usuário autenticado pode criar um rascunho.
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

O `LibraryService` popula três kits e seis templates ao iniciar:

- Kits: **SEDA Enterprise** (Samsung Blue `#1428A0`), **Wireframe**
  (baixa-fidelidade) e **Neutral Product** (superfícies neutras).
- Templates: `operations-dashboard`, `records-crud`, `onboarding-form`,
  `sign-in`, `account-settings` e `mobile-inbox`, todos publicados em `1.0.0`
  referenciando um dos kits acima.

## Endpoints

Todas as rotas exigem sessão autenticada. `GET` responde a qualquer papel de
projeto; `POST /publish` e `POST /deprecate` exigem `user.isAdmin`; `POST` e
`POST /duplicate` são liberados a qualquer usuário.

| Método | Rota                                      | Descrição                                                                |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| `GET`  | `/api/v1/library/kits`                    | Lista kits publicados; rascunhos aparecem apenas para o autor ou admins. |
| `POST` | `/api/v1/library/kits`                    | Registra um novo rascunho de kit a partir do manifesto enviado.          |
| `POST` | `/api/v1/library/kits/:id/publish`        | Publica o rascunho (admin).                                              |
| `POST` | `/api/v1/library/kits/:id/duplicate`      | Clona o kit num novo rascunho.                                           |
| `POST` | `/api/v1/library/kits/:id/deprecate`      | Marca um kit publicado como deprecated (admin).                          |
| `GET`  | `/api/v1/library/templates`               | Lista templates com diagnóstico de compatibilidade.                      |
| `POST` | `/api/v1/library/templates`               | Registra um novo rascunho de template.                                   |
| `POST` | `/api/v1/library/templates/:id/publish`   | Publica o template (admin).                                              |
| `POST` | `/api/v1/library/templates/:id/duplicate` | Clona o template num novo rascunho.                                      |

## Limitações atuais

- O `LibraryService` mantém o inventário em memória — os rascunhos criados por
  usuários são perdidos ao reiniciar o servidor.
- Não há endpoint para excluir rascunhos ou renomear releases; use
  `POST /duplicate` seguido de `POST /publish` para promover um rascunho.
- A UI web só lê a biblioteca — a criação, publicação e duplicação ainda
  precisam ser feitas por chamadas diretas à API.
