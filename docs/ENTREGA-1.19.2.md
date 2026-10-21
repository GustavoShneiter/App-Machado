# Machado Gestão 1.19.2

Mantém a navegação da base 1.19 ajustada: cinco seções, indicador verde animado e profissionais centralizados na Agenda. O APK usa versionCode 23 e a mesma assinatura de produção para instalar sobre a versão anterior.

## Alterações

- Comissão configurada em cada serviço e produto, com um padrão do item e exceções por profissional. Campo em branco usa o padrão; zero significa sem comissão. Os percentuais gerais do perfil deixam de participar dos cálculos. As regras existentes foram transferidas para os itens, sem recalcular atendimentos anteriores.
- Serviços gravam as regras individuais corretamente. Produtos permitem regras individuais e calculam a comissão de todas as unidades vendidas. Ao adicionar um produto à comanda, selecione o profissional responsável pela venda.
- O Caixa mostra os percentuais e valores por item, repasse do profissional e parte da barbearia.
- Exclusões de cliente, profissional, serviço, produto, agendamento e comanda são definitivas, mediante confirmação. Também apagam os atendimentos, pagamentos, repasses e movimentos vinculados; excluir um serviço pode apagar pacotes que o incluem e suas vendas. Os totais financeiros refletem essas exclusões. A atualização não exclui os registros existentes automaticamente.
- Formulários abrem acima do cabeçalho e da barra inferior, com rolagem própria, cabeçalho acessível e campos ajustados à largura. O espaço acompanha o teclado do Android. A validação aparece dentro do formulário.

## Instalação e acesso

Instale `Machado-Gestao-v1.19.2.apk` sobre a versão de produção anterior. O acesso automático do aplicativo continua ativo. O site público permanece em https://barbearia-machado-rose.vercel.app e o painel em `/admin`.

O APK contém acesso administrativo automático e deve ser distribuído apenas à equipe autorizada. Credenciais, chave de assinatura e arquivos privados não entram no GitHub nem no pacote de código-fonte.

## Verificações

- `npm run build` e `npm run lint`.
- `npm run test:database`: agendamento, conflito de horário, comanda, recebimento, repasse, comissão por item/profissional, múltiplas unidades e exclusões com referências. Fixtures revertidas.
- `npm run test:api`: autenticação, permissões e backup.
- `node scripts/preview-check.mjs`, seguido de `npm run test:navigation` e `npm run test:dialogs`: cinco seções, profissionais centralizados e formulários em quatro tamanhos de tela.
- `node --env-file=.env.local scripts/test-final-flow.mjs`: configuração gravada e reaberta na interface, valores no Caixa e exclusão definitiva de um cliente de teste. Cadastros temporários removidos ao final.
- Backup exportado, restaurado em tabelas temporárias e arquivo privado conferido por SHA-256, incluindo as regras de comissão dos produtos.
- APK assinado instalado como atualização no emulador Android: acesso automático, navegação e formulários com teclado.

Para bancos existentes, `npm run db:final` aplica a migração 006 de forma idempotente e verifica a preservação dos registros financeiros. Acrescente `-- --check` para testar e reverter tudo.

Antes de começar a operação definitiva, falta a homologação durante um dia de uso real na barbearia, incluindo um recebimento e um repasse reais.
