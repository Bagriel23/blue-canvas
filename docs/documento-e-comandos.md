# Documento semântico e comandos

## Documento v1

`@blue-canvas/document` define `DesignDocument` com `schemaVersion: 1`:

- identidade e nome do documento;
- mapa de tokens e variáveis;
- componentes reutilizáveis;
- páginas com artboards responsivos;
- árvore tipada de nós por artboard ou componente.

Nós suportados: `stack`, `grid`, `text`, `image`, `icon`, `link`, `button`,
`input`, `form`, `repeater`, `conditional`, `overlay` e `component-instance`.

O schema valida UUIDs, dimensões, breakpoints, nomes reservados, IDs duplicados,
referências a tokens/variáveis/componentes, destinos de interações e ciclos de
componentes. O JSON Schema publicado fica em
`packages/document/schema/design-document.schema.json` e é regenerado no build
do pacote.

APIs públicas principais:

```ts
import {
  createDesignDocument,
  createNodeId,
  deterministicSerialize,
  parseDesignDocument,
} from "@blue-canvas/document";
```

Use `parseDesignDocument` em toda entrada não confiável. A serialização
determinística estabiliza a ordem das chaves para hashes, testes e exportação.

## Valores e interações

Tokens aceitam cor, dimensão, número, string, booleano, família e peso de fonte.
Variáveis aceitam string, número, booleano e null. Estilos podem referenciar
tokens.

Interações são declarativas e cobrem navegação, estado local, overlays,
variáveis e filtro de coleção. Código JavaScript arbitrário não faz parte do
documento.

## Motor de comandos

`@blue-canvas/commands` é puro e independente do Fastify/Prisma. Cada batch
contém:

```ts
interface DesignCommandBatch {
  id: string;
  actorId: string;
  baseRevision: number;
  commands: DesignCommand[];
}
```

Comandos implementados:

- `add-node`, `update-node`, `remove-node` e `move-node`;
- `set-token` e `set-variable`;
- `rename-page`.

```ts
import {
  applyCommandBatch,
  createCommandState,
  redo,
  undo,
} from "@blue-canvas/commands";

const state = createCommandState(document);
const next = applyCommandBatch(state, {
  id: crypto.randomUUID(),
  actorId: userId,
  baseRevision: state.revision,
  commands: [{ type: "rename-page", pageId, name: "Início" }],
});
```

A aplicação é atômica: todos os comandos passam ou nenhum é aplicado. O motor
rejeita conflito de revisão, referências inválidas, alterações da raiz e patches
incompatíveis com o tipo do nó. Reutilizar um ID com conteúdo idêntico é
idempotente; reutilizá-lo com conteúdo diferente gera `IDEMPOTENCY_CONFLICT`.

Undo e redo criam nova revisão e preservam snapshots imutáveis. O preflight
limita um batch a 5.000 nós e profundidade 128 antes da validação recursiva.

O motor ainda não está exposto pela API nem conectado ao editor. Persistência,
sincronização Yjs e versões nomeadas pertencem à próxima etapa.
