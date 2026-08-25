# Aplicação web

`apps/web` hospeda o cliente React 19 servido em desenvolvimento por Vite 8 e
publicado em produção como assets estáticos. Não há SSR nem serviço
intermediário: todo o comportamento executa no navegador contra a API Fastify em
`/api/v1`.

## Identidade visual e temas

O pacote `@blue-canvas/ui` publica os tokens SEDA. A paleta usa Samsung Blue
`#1428A0` como cor principal e neutros derivados do preto e branco. Cada tema
(claro e escuro) define o mesmo conjunto de slots semânticos (`surface`, `text`,
`brand`, `focusRing`, `canvas`, entre outros) exposto como variáveis CSS
`--bc-color-*` aplicadas no elemento `<html>`.

O `ThemeProvider` inicia a partir da preferência do sistema
(`prefers-color-scheme`) e armazena a preferência manual em `localStorage`
(`blue-canvas.theme`). O botão de tema alterna entre `system`, `light` e `dark`.
Falhas de acesso ao `localStorage` (janela privada, política corporativa) não
lançam exceções — a UI opera com o valor em memória.

## Idiomas do produto

O produto suporta pt-BR, en-US e ko-KR. Os dicionários estão em
`packages/ui/src/i18n/messages.ts` e o resolver `formatMessage` aceita chaves
compostas (`workspace.export`) e substituições. A detecção considera a
preferência salva em `localStorage` (`blue-canvas.locale`) e, na ausência dela,
usa `navigator.languages`. Todos os dicionários compartilham exatamente as
mesmas chaves — o teste `i18n.test.ts` reprova acréscimos em um único idioma.

## Roteamento

`apps/web/src/router/router.ts` implementa um roteador baseado em
`location.hash` com rotas para `home`, `library`, `sign-in`,
`invitation?token=...`, `projects/:id`, `projects/:id/share` e
`projects/:id/export`. Não há dependência de biblioteca externa.
`serializeRoute` produz `href`s estáveis para navegação com âncoras.

## Sessão e API

`apps/web/src/api/client.ts` define `ApiClient`, que envia o cookie
`blue_canvas_session` com `credentials: "include"` e propaga o CSRF token pelo
cabeçalho `x-blue-canvas-csrf`, rotacionando quando o servidor devolve um novo
valor. Envelopes de erro são convertidos em `ApiError` tipados.

`SessionProvider` busca `/api/v1/sessions/current`, armazena o CSRF token e
oferece `signIn`, `signOut` e `acceptInvitation`. `401` é tratado como sessão
anônima — a UI mostra a tela de login em vez de propagar erro.

## Workspace e canvas

O workspace divide a tela em três painéis: páginas + camadas à esquerda, o
canvas DOM ao centro e o inspetor à direita com botões de prévia,
compartilhamento e exportação. Em telas menores que 900 px o layout empilha as
colunas.

O canvas renderiza `DesignDocument` como DOM semântico (`div`, `span`, `button`,
`img`, `input`, `a`, `form`) usando `styleToCss` e `layoutToCss`. A seleção é
gerenciada por estado local: clique aplica seleção sem propagar até o pai;
`Tab`/`Shift+Tab` percorrem a árvore linearizada; `Escape` limpa a seleção. Nós
selecionados recebem `data-selected="true"` para o outline azul definido em
`global.css`.

O inspetor edita o nome do nó, o conteúdo de nós de texto e mostra propriedades
principais de estilo e layout. Alterações produzem novos snapshots imutáveis do
documento (`transformNode`), preparando o terreno para publicar comandos ao
servidor quando o cliente Yjs for adicionado.

## Dependências principais

- `react` e `react-dom` 19.
- `vite` 8 + `@vitejs/plugin-react` 6.
- `@testing-library/react` 16 sobre `happy-dom` 20 para testes de componentes.
- `@blue-canvas/contracts` fornece os esquemas Zod usados na fronteira HTTP.
- `@blue-canvas/document`, `@blue-canvas/commands` e `@blue-canvas/ui` são
  workspaces internos consumidos por imports normais.

## Scripts

```bash
npm run dev -w @blue-canvas/web       # servidor Vite em 127.0.0.1:5173
npm run build -w @blue-canvas/web     # tsc --build && vite build
npm run preview -w @blue-canvas/web   # preview do bundle em 127.0.0.1:4173
```

O `vite.config.ts` faz proxy de `/api` para `VITE_API_UPSTREAM`, que assume
`http://127.0.0.1:8080` por padrão. Em produção, sirva `apps/web/dist/client`
atrás do mesmo reverse proxy que expõe a API.

## Limitações atuais

- Sem integração com o cliente Hocuspocus/Yjs. O documento de trabalho ainda usa
  um fixture local em `apps/web/src/fixtures/demo.ts`.
- Sem persistência das edições no servidor. Os manipuladores do inspetor
  atualizam apenas o estado em memória.
- Sem Playwright, screenshots de referência ou testes visuais automatizados.
- Sem transformações estilo Moveable/Selecto no canvas. A seleção é por clique e
  teclado; arrastar para mover ainda não está implementado.
- Sem download real de exportações — o diálogo consome
  `POST /api/v1/projects/:id/exports`, mas o servidor ainda não expõe esse
  endpoint (Task 9 do plano).
