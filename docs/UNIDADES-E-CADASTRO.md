# Contas por unidade da Machado

Cada cadastro administrativo cria uma **nova unidade**, com seu próprio responsável. Agenda, clientes, profissionais, produtos, comissões, Caixa e configurações ficam separados. A marca e os endereços dos aplicativos continuam compartilhados; o login determina a unidade.

## Cadastro e acesso

`POST /api/register` recebe `name`, `business_name`, `email` e `password`. O servidor normaliza nome/e-mail, valida o tamanho dos campos e usa o hash já configurado no Better Auth. O cadastro genérico `/api/auth/sign-up/email` permanece desabilitado nas duas edições.

A identidade, a unidade, o perfil proprietário, os horários iniciais e três hashes de recuperação são criados numa única transação. A resposta contém a conta, a unidade e os três códigos de recuperação em texto uma única vez; nenhum código em texto é enviado ao SQL ou armazenado no banco. A senha não aparece na resposta. Depois de guardar os códigos, o responsável entra pelo login normal.

No Android administrativo, a chave de sessão passa a `machado-native-session-v2`. O token da antiga distribuição com acesso compartilhado é removido desse aparelho para pedir o primeiro login individual. As sessões profissionais e os cookies das versões web não são alterados por essa limpeza.

## Isolamento no banco

`transaction(userId, work, options)` resolve o perfil e a unidade ativa com a conexão privada do servidor. Em seguida define `request.business_id`, define o ator e executa `SET LOCAL ROLE machado_runtime`. Esse role não pode fazer login, administrar roles, criar bancos nem ignorar RLS; recebe somente as permissões necessárias de leitura/escrita e execução, sem `TRUNCATE`.

As tabelas têm `tenant_id` com política forçada por unidade. As relações entre tabelas também incluem `tenant_id`, de modo que usar um UUID de outra unidade não cria um vínculo cruzado. Telefones de clientes e códigos de produtos podem ser repetidos em unidades diferentes. E-mails de acesso e UUIDs continuam únicos.

As funções operacionais `SECURITY DEFINER` pertencem ao role sem `BYPASSRLS`. A única exceção é `current_business_id()`: a função de bootstrap privilegiada, sem parâmetros e com `search_path` fixo, consulta apenas os metadados de perfil/unidade para validar o contexto sem recursão de políticas. Ela retorna `NULL` quando o ator e o contexto divergem. Funções pertencentes a extensões Postgres mantêm seu proprietário de extensão.

`options.internal: true` é reservado a caminhos escritos pelo servidor, como provisionamento e backups globais. Parâmetros enviados pelo cliente nunca são repassados como `options`. O provisionamento é `SECURITY INVOKER` e não pode ser executado por `machado_runtime` ou `PUBLIC`.

O role privado Neon possui `BYPASSRLS`; apenas habilitar ou forçar políticas com esse mesmo role não ofereceria isolamento. O uso do role operacional e o proprietário das funções são parte necessária da fronteira de acesso. Referência: [políticas de segurança por linha do PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Preservação da unidade original e publicação

A migração `011_unit_accounts.sql` atribui os registros atuais à unidade original Machado. O preenchimento usa um default constante, preservando IDs e timestamps sem disparar os gatilhos `updated_at`. A alteração do upsert de configurações acompanha a nova chave composta por unidade.

Durante a publicação, o servidor antigo ainda pode definir somente o ator. Na ausência de um contexto de unidade, a função infere a unidade do perfil ativo, ou a unidade original para catálogo anônimo. Um contexto não vazio divergente continua sendo negado. No código novo, slug desconhecido retorna 404 e nunca cai na unidade original.

Aplique a migração de forma atômica e publique o servidor novo antes de criar unidades reais. O servidor antigo não foi projetado para atender várias unidades.

### Runner de migração 011 + 012

`scripts/migrate-unit-accounts.mjs` usa **verificação com rollback por padrão**. Para revisar:

```powershell
node --env-file=.env.local scripts/migrate-unit-accounts.mjs --check
```

O runner obtém um lock de migração e usa `lock_timeout` de 3 segundos. Antes de alterar o schema, inventaria todas as colunas que já existem nas 33 tabelas afetadas, incluindo timestamps. Calcula contagens e SHA-256 dos valores projetados nessas mesmas colunas antes, depois de cada migração e ao final. Qualquer diferença aborta e reverte a transação. Colunas novas não entram indevidamente na comparação; se uma coluna já existia, ela é incluída mesmo que se chame `tenant_id` ou seja uma configuração de metas.

O histórico fica em `public.machado_schema_migrations`, acessível apenas à conexão privada do migrador. Os checksums dos dois arquivos usam texto normalizado para LF. Uma versão registrada com checksum divergente ou uma dependência ausente interrompe a execução; o runner não sobrescreve o histórico nem considera uma migração diferente como já aplicada. Registros com checksum igual são pulados. A segunda execução planejada deve ficar vazia, e a guarda contra drift é verificada sem alterar registros existentes.

Somente depois da revisão e da preparação da publicação, o responsável pode executar a aplicação explícita:

```powershell
node --env-file=.env.local scripts/migrate-unit-accounts.mjs --apply
```

Antes de executar qualquer migração pendente em `--apply`, o runner bloqueia as tabelas do snapshot e grava um **backup privado novo**, com todas as tabelas dos schemas `public`/`auth`, definições de funções, constraints e políticas. A cópia e seu arquivo SHA-256 ficam em `.private/backups/`. Os bytes são relidos e a integridade é verificada antes de prosseguir. Se a cópia falhar, a migração não é aplicada. Os checksums do histórico e a comparação de dados fazem parte da mesma transação das duas migrações; o commit é único. Se ambas já estão registradas corretamente, a execução é um no-op e não repete o SQL nem exige nova cópia.

Os relatórios `.private/unit-accounts-migration-check.json` e `...-apply.json` guardam contagens, colunas e digests, sem imprimir registros ou credenciais. O modo `--check` reverte também os registros de histórico criados durante o ensaio e verifica a restauração do estado inicial do schema/role.

## Verificações reproduzíveis

- `node --env-file=.env.local scripts/migrate-unit-accounts.mjs --check`: runner oficial das duas migrações, com histórico/checksum, idempotência, comparação completa e rollback. **Nenhuma opção equivale a aplicar por omissão.**
- `node --env-file=.env.local scripts/test-unit-isolation.mjs`: cria banco e role temporários, aplica o schema e verifica donos/profissionais de duas unidades, cadastro, upserts, telefone/código repetido, Caixa, catálogo, UUID estrangeiro, contexto divergente e limpeza isolada. Remove banco e role ao terminar.
- `node --env-file=.env.local scripts/rehearse-unit-migration.mjs`: ensaia a migração no banco original com timeout curto de lock, compara fingerprints de dados e timestamps e **sempre executa rollback**. Não tem opção de aplicação permanente.
- `node --env-file=.env.local scripts/prepare-unit-sandbox.mjs`: prepara um banco vazio com 001–012 para os testes HTTP/navegador. O nome, sem URL ou segredo, fica em `.private/nov06-sandbox.json`. `--remove` valida o alvo e remove esse banco; preserva o role operacional se ele já existir ou tiver dependências da produção.

Esses scripts não copiam dados reais para o sandbox. Credenciais e relatórios privados não pertencem ao repositório.
