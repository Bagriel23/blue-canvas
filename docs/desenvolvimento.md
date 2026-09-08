# Desenvolvimento local

## Requisitos

- Node.js 24.x, conforme `.nvmrc` e `package.json`.
- npm 11.19.0. O repositório não usa pnpm nem Yarn.
- Docker com Docker Compose, ou MariaDB/MySQL fornecido pelo Laragon.

## Instalação reproduzível

Execute na raiz do repositório:

```bash
nvm install
nvm use
npm install --global npm@11.19.0
test "$(npm --version)" = "11.19.0"
npm ci
cp .env.example .env
set -a
source .env
set +a
```

`npm ci` respeita o `package-lock.json` raiz. Para adicionar ou atualizar uma
dependência, use npm e registre a alteração do lockfile.

Os três comandos finais exportam os valores para o shell atual. Repita-os em um
novo terminal antes de migrar ou iniciar a API, ou use o mecanismo de variáveis
do process manager.

## Banco no Linux com Docker

```bash
docker compose up -d --wait mariadb
npm run db:migrate
npm run test:integration
```

O Compose fixa MariaDB 10.6.28, publica o banco somente em `127.0.0.1:3306` e
mantém os dados no volume `mariadb106-data`. O nome evita reutilizar
acidentalmente um datadir de outra versão do MariaDB; um volume antigo chamado
`mariadb-data` não é migrado nem removido automaticamente. A CI também executa a
integração em MySQL 8.0.46.

```bash
docker compose down
```

O comando acima preserva o volume. `docker compose down -v` apaga os dados e
deve ser usado somente quando essa perda for intencional.

## Banco com Laragon

1. Inicie MariaDB ou MySQL pelo Laragon.
2. Crie o database e o usuário definidos no `.env`.
3. Garanta acesso TCP ao host e porta configurados.
4. Execute `npm run db:migrate` na raiz.
5. Execute `npm run test:integration` em um banco de teste descartável.

Exemplo SQL para ambiente local, adaptando senha e permissões à política da
empresa:

```sql
CREATE DATABASE blue_canvas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'blue_canvas'@'localhost' IDENTIFIED BY 'senha-local';
GRANT ALL PRIVILEGES ON blue_canvas.* TO 'blue_canvas'@'localhost';
FLUSH PRIVILEGES;
```

Não execute os testes de integração contra dados que precisem ser preservados: a
suíte limpa as tabelas da aplicação antes de cada teste.

## Banco com XAMPP

O XAMPP é suportado como provedor local de MySQL/MariaDB no Windows. O Apache do
XAMPP é opcional: o Blue Canvas continua usando Node/Fastify para a API e Vite
para o frontend. No XAMPP Control Panel, inicie o módulo **MySQL** e confirme a
porta exibida (normalmente `3306`).

### Criar database e usuário

Use o phpMyAdmin (`http://127.0.0.1/phpmyadmin`) ou o cliente `mysql` incluído
no XAMPP. Prefira um usuário dedicado com senha; a configuração do servidor
recusa senha vazia, mesmo que o XAMPP venha com `root` sem senha em instalações
locais.

```sql
CREATE DATABASE blue_canvas
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'blue_canvas'@'127.0.0.1' IDENTIFIED BY 'senha-local-forte';
CREATE USER 'blue_canvas'@'localhost' IDENTIFIED BY 'senha-local-forte';
GRANT ALL PRIVILEGES ON blue_canvas.* TO 'blue_canvas'@'127.0.0.1';
GRANT ALL PRIVILEGES ON blue_canvas.* TO 'blue_canvas'@'localhost';
FLUSH PRIVILEGES;
```

Se o usuário ou database já existir, não repita `CREATE`; ajuste a senha e as
permissões no painel do XAMPP. Não use a database de outro projeto para os
testes de integração.

### Configurar no PowerShell

Na raiz do repositório, configure as variáveis no mesmo terminal que executará
as migrações e a API:

```powershell
$env:NODE_ENV = "development"
$env:APP_HOST = "127.0.0.1"
$env:APP_PORT = "3000"
$env:SETUP_SECRET = "troque-por-um-segredo-local-com-16-caracteres"
$env:ASSET_STORAGE_ROOT = "C:\BlueCanvas\assets"
$env:DATABASE_HOST = "127.0.0.1"
$env:DATABASE_PORT = "3306"
$env:DATABASE_NAME = "blue_canvas"
$env:DATABASE_USER = "blue_canvas"
$env:DATABASE_PASSWORD = "senha-local-forte"

New-Item -ItemType Directory -Force $env:ASSET_STORAGE_ROOT | Out-Null
npm ci
npm run db:migrate
npm run build
npm run start -w @blue-canvas/server
```

Em outro PowerShell, na mesma raiz:

```powershell
$env:VITE_API_UPSTREAM = "http://127.0.0.1:3000"
npm run dev -w @blue-canvas/web
```

Abra `http://127.0.0.1:5173`. Se o XAMPP estiver configurado em outra porta,
altere `DATABASE_PORT` antes de executar `db:migrate`; a porta da API e a do
frontend não precisam mudar. Se a porta `3306` estiver ocupada, use a porta real
mostrada pelo XAMPP Control Panel.

## Compilar e iniciar a API

```bash
npm run check
npm run start -w @blue-canvas/server
```

O `start` executa `apps/server/dist/index.js`, portanto faça `npm run build` ou
`npm run check` depois de mudar o código.

Para o cliente web, em outro terminal:

```bash
npm run dev -w @blue-canvas/web
```

O Vite responde em `http://127.0.0.1:5173` e faz proxy de `/api` para o servidor
Fastify. Ajuste `VITE_API_UPSTREAM` se a API estiver em outra porta.

Com os defaults locais:

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:3000/api/v1/ready
```

`health` confirma que o processo responde. `ready` também verifica o adapter de
persistência.

## Fluxo diário

```bash
npm run format
npm run check
git diff --check
```

Testes que dependem do banco ficam fora de `npm run check` e devem ser
executados separadamente com MariaDB disponível.
