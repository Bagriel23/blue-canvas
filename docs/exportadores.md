# Exportadores

`@blue-canvas/exporters` gera arquivos a partir de um `DesignDocument` validado,
sem depender de IA ou rede.

## Alvos e escopos

Alvos disponíveis:

- `html`: HTML semântico, CSS organizado, runtime JavaScript e assets locais;
- `react`: projeto Vite + TypeScript + React;
- `preact`: projeto Vite + TypeScript + Preact.

Escopos disponíveis:

- `{ type: "project" }` para todas as páginas;
- `{ type: "page", pageId }` para uma página;
- `{ type: "selection", nodeIds }` para nós selecionados e ancestrais
  necessários.

## Uso

```ts
import { generateExport } from "@blue-canvas/exporters";

const result = await generateExport({
  document,
  target: "react",
  scope: { type: "project" },
  assets: {
    "asset-id": {
      fileName: "imagem.png",
      mimeType: "image/png",
      bytes: imageBytes,
    },
  },
});

if (result.diagnostics.some(({ severity }) => severity === "error")) {
  throw new Error("Exportação inválida");
}
```

`files` contém conteúdo textual ou bytes. `manifest` registra target, escopo,
media type, tamanho e SHA-256 de cada arquivo. O consumidor ainda precisa
empacotar esses arquivos em ZIP; não existe endpoint HTTP de exportação nesta
etapa.

## Garantias e validações

- Ordem de arquivos, nomes normalizados e manifest determinísticos.
- Nenhum CDN, asset HTTP ou import remoto em runtime.
- Detecção de nomes e caminhos inseguros, colisões e nomes reservados do
  Windows.
- Escape de HTML/CSS/JSON e bloqueio de navegação/CSS inseguro.
- Validação real de raster com Sharp.
- Sanitização restrita de SVG e bloqueio de referências externas.
- Diagnósticos de asset ausente, escopo inconsistente e referência fora do
  escopo.
- Limite codificado de 25 MiB por asset; SVG limitado a 1 MiB, profundidade 128
  e 100.000 nós; raster limitado a 8.192 por dimensão e 16 milhões de pixels.

Assets aceitos no exportador: JPEG, PNG, WebP e SVG seguro. Isso é diferente do
upload atual da API, que aceita GIF no storage e não aceita SVG.

## Verificação dos projetos gerados

Os projetos React e Preact possuem dependências npm e lockfiles próprios. Sua
primeira instalação precisa acessar um registry npm aprovado ou um cache
corporativo abastecido; o código gerado não carrega essas dependências de CDN em
runtime. A suíte instala cada fixture em diretório temporário, em modo offline
com o cache npm local, e executa seu build real.

```bash
npm run test:export-fixtures
```

Os golden files ficam em `packages/exporters/test/golden/`. Alterações neles
devem ser revisadas como mudança de contrato de saída.
