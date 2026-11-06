# Entrega — Gestão 1.19.9 e Profissional 1.2.0

## Uso

1. Instale o APK da edição desejada ou abra o link na [central de acessos](CENTRAL-DE-ACESSOS.md).
2. Entre com e-mail e senha. As contas existentes continuam válidas. **Criar conta** é exclusivo para uma nova unidade, com dados e operação separados. Não use essa opção para entrar na Machado atual.
3. No cadastro de uma unidade, guarde os três códigos de recuperação. Eles aparecem uma única vez e cada um permite uma recuperação.
4. Na administração, abra **Menu → Profissionais → Editar** para definir login e metas. As metas também ficam acessíveis em **Relatórios → Metas**. O barbeiro não edita os valores.
5. Em **Relatórios**, escolha Geral ou um profissional e o período. O gráfico mostra participação no faturamento e evolução diária; a equipe lista serviços, clientes e comissões. O CSV respeita os filtros.
6. O profissional acompanha somente a própria comissão, metas e evolução no Meu Caixa. Toque nos detalhes ou no relatório para abrir as janelas. Pode ocultar metas no Menu sem apagar os valores definidos pela administração.
7. Para atualizar, puxe a tela para baixo quando estiver no topo. Não há botão fixo Atualizar no cabeçalho. Pelo teclado, o comando Atualizar dados aparece ao receber foco.

## Links no Menu

Gestão: **Versão web admin** para PC e **Versão web** com a interface do Android. Profissional: **Versão web**, com o login individual da equipe. No iPhone, adicione a edição web à Tela de Início pelo Safari.

Cada nova unidade tem um link público de agendamento próprio, disponível nas configurações, com ?unidade= no endereço. Configure nome e WhatsApp antes de divulgá-lo. A landing da Machado atual permanece no endereço principal.

## Verificações

- Código, tipos, renderização administrativa e cálculos financeiros.
- Dependências corrigidas: auditoria npm sem vulnerabilidades conhecidas em 06/11/2026. Zod 4.6.7, Functions 3.11.0 e Vite 6.4.5; correções transitivas escopadas em OIDC, glob e minimatch, com verificação de compatibilidade.
- Chromium e WebKit em celular, tablet e PC: relatórios, metas, janelas, acessibilidade dos controles e ausência de rolagem horizontal.
- Cadastro e login, códigos de recuperação exibidos uma vez, troca de senha e revogação, autorização individual, contas administrativas e profissionais separadas.
- Banco descartável com duas unidades: clientes com o mesmo telefone, catálogos, Caixa, recebimentos, comissões e backups isolados; referências cruzadas e tentativa de trocar unidade rejeitadas.
- Agendamento público no navegador até a Agenda; bloqueios pontuais e recorrentes; duas reservas simultâneas aceitam somente uma.
- Metas escritas pela administração e lidas pelo profissional; tentativa de editá-las pelo barbeiro rejeitada.
- Gesto no topo, em listas, campos e janelas; cancelamento e falha de conexão; duas atualizações no mesmo segundo renovam os valores visíveis.
- Migração ensaiada com comparação das colunas históricas e rollback, antes da aplicação. Backup privado anterior preservado.

Os relatórios financeiros usam comandas, pagamentos e comissões como fonte. Recebido segue a data do pagamento e pode diferir do faturamento do atendimento. Despesas gerais e vendas de pacotes sem profissional não são atribuídas artificialmente a um barbeiro.

## Distribuição

Pacotes Android separados, assinados com a chave da distribuição anterior, sem conta administrativa embutida. Os arquivos SHA256SUMS de cada release permitem conferir os downloads. As edições web e os APKs exigem internet.

O iPhone recebe a edição web instalável nesta entrega. O projeto nativo tem verificações de integração; a distribuição nativa assinada exige Apple Developer e Mac. WebKit automatizado não substitui a conferência em um iPhone físico.

Depois da instalação, faça um dia completo de operação na barbearia: agendamento, encaixe, bloqueio, comparecimento, recebimento, produtos, comissão e fechamento do Caixa, nos aparelhos que serão usados pela equipe.
