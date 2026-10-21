# Machado Gestão

Sistema de gestão e agendamento da Barbearia Machado, em Toledo/PR. Versão 1.20: site React/Vite e aplicativo Android Capacitor, com publicações separadas, compartilhando a API na Vercel, PostgreSQL Neon, Better Auth e Vercel Blob.

- Site: https://barbearia-machado-rose.vercel.app
- Agendamento: `/agendar`
- Painel: `/admin`
- Recuperação de acesso: `/recuperar-acesso`
- [Guia de entrega e operação](docs/ENTREGA-1.20.md)

## Desenvolvimento

Use Node.js 24 e `npm ci`. Configure `.env.local` a partir de `.env.example`, com credenciais do ambiente de desenvolvimento. Nenhuma credencial de banco ou Blob pode ter prefixo `VITE_`.

Execute `npm run dev:api` e `npm run dev` em terminais separados. O Vite encaminha `/api` para a API local na porta 3000.

## Validação

`npm run build` verifica TypeScript, renderização das telas e cálculos financeiros antes de gerar `dist`. `npm run lint` verifica o código. Os scripts `test:database`, `test:api`, `test:browser` e `backup:verify` documentam as verificações integradas; as contas temporárias e credenciais de QA ficam em `.private`, que é excluído do Git e da publicação. Os testes de operação devem ser executados em ambiente isolado ou com as fixtures revertidas.

## Banco e autenticação

`database/001_initial.sql` preserva o schema operacional migrado. `002_auth.sql` contém o schema gerado pelo Better Auth, e `003_readiness.sql` acrescenta catálogo público seguro, validações, recuperação por códigos e metadados de backup. Os helpers SQL `auth.uid()` e `auth.users` são locais ao PostgreSQL: mantêm as referências históricas e não dependem de serviços Supabase.

O navegador acessa apenas endpoints permitidos da API. A API valida a sessão Better Auth e o perfil ativo antes das operações administrativas. O identificador autenticado é aplicado na transação SQL. Não há conexão de banco nem credenciais privilegiadas no frontend. Cadastro público de administradores está desativado. A migração inicial não sobrescreve bancos já inicializados.

Os arquivos da antiga integração Supabase foram mantidos em `supabase/` como histórico e referência de testes. Eles não são executados no ambiente atual.

Para atualizar um banco existente para 1.20, execute `npm run db:agenda` antes de publicar. As migrações 004/005 acrescentam remoção segura da Agenda e priorizam a comissão por serviço/profissional. Preservam registros financeiros históricos. A Agenda é a tela inicial e a confirmação de presença segue diretamente para recebimento no Caixa.

## Backups

O cron `/api/backup-daily` é protegido por `CRON_SECRET` e gera uma cópia no Blob privado. O proprietário também pode exportar um backup pelo menu. Sessões ativas e códigos de recuperação não são incluídos nos arquivos de exportação. A verificação de restauração usa tabelas temporárias e não altera a operação.

## Android

Execute `npm run android:prepare-access`, `npm run android:sync` e depois `android/gradlew.bat assembleRelease`. A chave e o acesso automático ficam fora do Git; `android/keystore.properties` e `android/native-access.properties` configuram o Gradle. O APK da distribuição privada dá acesso direto à gestão e não deve ser publicado em repositórios ou canais abertos. Alterações do site precisam ser incorporadas em um novo APK para chegar aos aparelhos instalados.

Consulte `docs/ENTREGA-1.20.md` para instalação, acesso, operação, suporte e homologação.
