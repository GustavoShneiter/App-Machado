# Planilha de caixa

A planilha de produção pertence a dionemachado0000@gmail.com.

[Abrir o fluxo de caixa](https://docs.google.com/spreadsheets/d/1kxn8fonORDOZVPbAA_fyytS6v8GtT8x58qmZ0Oy9OjE/edit).

## Operação

Menu → Relatórios → Planilha de caixa permite abrir, editar, baixar Excel, pausar a sincronização, vincular serviços e planos e retomar campos manuais.

A conexão foi preparada para 2026, com início em 19/11/2026. Uma fotografia dos dados do app no momento da conexão define o ponto de partida. A integração acrescenta as diferenças posteriores, preservando os valores já existentes na planilha.

O conector deve ser instalado no Apps Script vinculado à planilha, pela conta proprietária. Execute instalarMachado e autorize os acessos solicitados. O acionador de aproximadamente um minuto consulta o servidor da Contabo com credencial exclusiva da unidade. A execução depende das permissões e dos limites do Google.

O código privado do conector contém uma credencial. Guarde-o em local privado. O app oferece gerar um novo conector, revogando o anterior.

## Dados automáticos

- Quantidades e valores dos serviços em atendimentos concluídos.
- Produtos incluídos nas comandas concluídas.
- Descontos e gorjetas.
- Vendas de pacotes, contabilizadas na venda. Resgates de sessões são excluídos para evitar uma nova receita.
- Repasses efetivamente pagos aos profissionais.

As despesas continuam nos campos manuais da planilha. Os planos históricos Prata, Ouro e Diamante permanecem nos meses copiados. Quando forem cadastrados no app, os vínculos podem ser reconhecidos pelo nome ou escolhidos na configuração.

Novos serviços ganham colunas à direita do mês quando houver movimentação. AJUSTES DO APP concilia gorjetas e diferenças entre preços efetivamente cobrados e os preços fixos históricos. As fórmulas de totais da planilha utilizam a coluna de ajustes já existente no modelo.

## Prioridade manual

As células vinculadas usam a base histórica mais a contribuição do app. O conector atualiza somente sua base auxiliar. Substituir uma fórmula vinculada por um valor ou uma fórmula própria torna aquele campo manual. A sincronização registra os campos protegidos no app.

Retomar automático exige escolher explicitamente o campo na configuração. Para campos numéricos, a retomada mantém o valor atual e acrescenta as próximas diferenças. Fórmulas próprias e textos permanecem protegidos.

As páginas auxiliares _Machado Dados e _Machado Controle guardam os dados e os vínculos, respectivamente. Elas ficam ocultas para preservar a navegação diária.

Alterações manuais na planilha pertencem à planilha. Elas não alteram serviços, pagamentos ou registros históricos do banco do aplicativo.

## Verificação

O teste scripts/test-spreadsheet-sync.mjs executa o código real do conector em um adaptador de planilha para conferir histórico, repetição, preços, novos serviços, planos, prioridade manual, retomada, pausas e exclusões.

O teste de banco scripts/test-professional-payments.mjs também confere o esquema de integração, o ponto de partida e o isolamento por unidade em banco descartável.

A ativação real deve ser confirmada por uma execução bem-sucedida no Google e pelo horário de última sincronização apresentado no app.
