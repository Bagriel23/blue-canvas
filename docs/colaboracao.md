# Colaboração em tempo real

O servidor Fastify hospeda o Hocuspocus 4.6 e o Yjs 13 no mesmo processo da API.
O endpoint é `ws://HOST/api/v1/collaboration` ou
`wss://HOST/api/v1/collaboration` atrás de TLS. O nome do documento no protocolo
Hocuspocus é o UUID do projeto. Credenciais nunca são colocadas na query string.

## Autenticação e autorização

Clientes de navegador enviam automaticamente o cookie HttpOnly
`blue_canvas_session` no handshake e usam o CSRF da sessão como `token` do
payload de autenticação Hocuspocus. Clientes de automação enviam o PAT bruto no
mesmo payload, sem cookie. PATs precisam de `projects:read` para conectar e de
`projects:write` para editar.

O servidor rejeita usuário inativo, sessão ou PAT expirado/revogado, não membro,
projeto arquivado e credenciais ambíguas. Owner e editor recebem acesso de
escrita. Commenter e viewer sincronizam conteúdo e presença em modo read-only. A
autorização é consultada novamente antes de cada atualização Yjs; remoção,
downgrade ou revogação passam a valer sem esperar uma reconexão. Cada projeto
aceita no máximo dez conexões com permissão de escrita simultâneas.

## Documento e persistência

`packages/collaboration` cria o estado inicial seguro. O mapa Yjs `blueCanvas`
contém a chave `document` com um `DesignDocument` v1 validado. Outros tipos Yjs
podem transportar estado colaborativo estrutural, mas toda atualização candidata
precisa preservar um documento semântico válido.

O banco mantém uma linha `project_documents` por projeto com o update completo
compactado, state vector, revisão e data. Não existe log incremental sem limite.
Updates individuais são limitados a 1 MiB e o estado compacto a 8 MiB. O
snapshot é validado antes de ser persistido.

## Presença, desconexão e offline

Awareness do Yjs transporta presença e não é persistido. Em uma desconexão
curta, a futura aplicação web pode usar `createPendingChangesGuard`: alterações
pendentes permanecem apenas na memória e ativam `beforeunload` até a
sincronização. O pacote não acessa IndexedDB nem `localStorage` para documentos.
Fechar ou recarregar a página antes da sincronização perde essas alterações.

## Versões nomeadas

As rotas `/api/v1/projects/:projectId/versions` criam e listam snapshots
imutáveis com nome, ator, horário e revisão. A restauração:

1. bloqueia novas conexões durante a operação;
2. persiste e encerra as conexões atuais;
3. restaura o snapshot escolhido com uma nova revisão;
4. cria outra versão nomeada apontando para a origem;
5. grava o evento de auditoria na mesma transação.

O histórico anterior nunca é apagado. Depois de uma restauração, o cliente deve
descartar seu `Y.Doc`, criar outro vazio e sincronizar novamente. Reutilizar um
documento local anterior poderia reaplicar alterações que não pertencem à versão
restaurada.

## Comentários e menções

Comentários pertencem a um projeto e podem ter `nodeId`, posição normalizada
`x/y` entre zero e um e até vinte menções. Uma âncora de nó precisa existir no
documento semântico persistido. Usuários mencionados precisam estar ativos e ser
membros do mesmo projeto.

Owner, editor e commenter podem criar, resolver e reabrir comentários. Apenas o
autor pode editar corpo e menções. Viewer pode somente ler. Criação, edição e
resolução usam transações com auditoria; buscas sempre incluem o projeto para
evitar referência cruzada.

## Exemplo de cliente

```ts
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const document = new Y.Doc();
const provider = new HocuspocusProvider({
  url: "wss://blue-canvas.interno/api/v1/collaboration",
  name: projectId,
  document,
  token: csrfToken,
});
```

O cookie de sessão é enviado pelo navegador. Não concatene CSRF, sessão ou PAT à
URL e não registre o payload de autenticação.
