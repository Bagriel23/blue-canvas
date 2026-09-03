# Configuração

Copie `.env.example` para `.env` no desenvolvimento. O Node não carrega esse
arquivo sozinho: exporte as variáveis no processo, use o mecanismo do ambiente
de execução ou inicie com uma ferramenta aprovada pela empresa.

## Variáveis da aplicação

| Variável             | Obrigatória | Default no exemplo        | Uso                                                |
| -------------------- | ----------- | ------------------------- | -------------------------------------------------- |
| `NODE_ENV`           | Não         | `development`             | `development`, `test` ou `production`              |
| `APP_HOST`           | Não         | `127.0.0.1`               | Interface de rede da API                           |
| `APP_PORT`           | Não         | `3000`                    | Porta HTTP da API                                  |
| `SETUP_SECRET`       | Sim         | Valor de desenvolvimento  | Segredo do bootstrap inicial, mínimo 16 caracteres |
| `ASSET_STORAGE_ROOT` | Sim         | `/tmp/blue-canvas-assets` | Diretório absoluto do storage local                |

Em produção, `APP_HOST` pode precisar ser `0.0.0.0` atrás de um reverse proxy.
Mantenha TLS no proxy: cookies de produção recebem a flag `Secure`.

## Conexão da aplicação com o banco

| Variável            | Default no exemplo |
| ------------------- | ------------------ |
| `DATABASE_HOST`     | `127.0.0.1`        |
| `DATABASE_PORT`     | `3306`             |
| `DATABASE_NAME`     | `blue_canvas`      |
| `DATABASE_USER`     | `blue_canvas`      |
| `DATABASE_PASSWORD` | `blue_canvas_dev`  |

O nome do database aceita somente letras, números e underscore. O Prisma monta a
URL MySQL internamente e codifica usuário e senha.

O alvo local versionado é MariaDB 10.6.28. A matriz de CI aplica migrations e
testes de repositório em MariaDB 10.6.28 e MySQL 8.0.46.

## Variáveis do Docker Compose

| Variável                | Uso                                        |
| ----------------------- | ------------------------------------------ |
| `MARIADB_PORT`          | Porta local, vinculada a `127.0.0.1`       |
| `MARIADB_DATABASE`      | Database criado pelo container             |
| `MARIADB_USER`          | Usuário da aplicação criado pelo container |
| `MARIADB_PASSWORD`      | Senha do usuário da aplicação              |
| `MARIADB_ROOT_PASSWORD` | Senha administrativa do container          |

As famílias `DATABASE_*` e `MARIADB_*` devem apontar para as mesmas credenciais
quando o Compose é usado.

## Regras para produção

- Gere segredos exclusivos e injete-os pelo gerenciador autorizado.
- Não versionar `.env`, tokens, cookies, links de convite ou backups.
- Use um diretório absoluto dedicado para `ASSET_STORAGE_ROOT`, fora da pasta
  pública do servidor HTTP, com permissões privadas (`700`). O restore exige
  também o marcador `.blue-canvas-assets-root` nesse diretório:
  `printf 'blue-canvas-assets-v1\n' > "$ASSET_STORAGE_ROOT/.blue-canvas-assets-root"`
  seguido de `chmod 600` no marcador. O script recusa raiz, `HOME`, worktree,
  componentes simbólicos e diretórios cuja identidade (device/inode) mudou.
- Conceda ao processo apenas leitura/escrita nesse diretório e o mínimo de
  permissões no banco.
- Altere `SETUP_SECRET` depois do bootstrap. O endpoint também se bloqueia
  quando já existe um usuário.
- Faça backup conjunto do MariaDB e do diretório de assets.

No Windows, substitua o default Linux de `ASSET_STORAGE_ROOT` por um caminho
absoluto local, por exemplo `C:\\BlueCanvas\\assets`, e injete-o pelo serviço ou
process manager. Os comandos `source .env` da documentação são específicos de
Bash.
