# Importação de histórico operacional

A migração `022_imported_visit_details.sql` mantém as datas de validade dos
créditos de pacotes importados e apresenta todos os serviços do atendimento na
agenda. A mesma identificação é utilizada no painel, no app profissional e no
contexto e nos lembretes do agente.

Os dados de origem, os arquivos de preparação, os resultados e as imagens de
conferência ficam em `.private`, fora do Git. Os registros importados mantêm a
referência da comanda e dos serviços da origem nas observações e na auditoria.
Serviços contíguos do mesmo atendimento são apresentados juntos, por profissional.
Cancelamentos não voltam a ocupar horários. Sobreposições já existentes são
identificadas como encaixes; novas reservas normais continuam protegidas contra
conflitos.

O histórico financeiro é conciliado com o caixa original, mantendo os meios de
pagamento, descontos, pacotes e as comissões históricas. O caixa aberto atual e
as regras de comissão para novos atendimentos são preservados. Quando a origem
fornece somente a data de um recebimento, o lançamento usa a contabilização do
caixa de origem, sem inferir o horário em que o cliente pagou.

Uma alteração posterior da regra de comissão pode restaurar pendências da
origem, inclusive para o proprietário. Essa conciliação usa os itens originais
das comandas, preserva percentuais e valores históricos e não cria recebimentos
nem repasses pagos. As regras para novos atendimentos são configuradas
separadamente por serviço e produto. A verificação deve cobrir o Caixa do
Gestão, o caixa profissional e a geração de comissão ao concluir um atendimento,
revertendo as alterações usadas no teste. O ajuste não deve alterar outros
profissionais, recebimentos, o histórico da planilha ou as mensagens do agente.

As confirmações da importação são suprimidas antes do commit. Lembretes futuros
continuam seguindo os horários configurados. A importação não concede
consentimento para campanhas nem altera as configurações do agente.

Para planilhas que já possuem os valores históricos digitados, o histórico
importado integra a base de comparação da conexão: ele não é somado novamente.
O modo `completed` sincroniza atendimentos realizados antes do fechamento do
caixa, sem tratar reservas futuras como receita. Alterações manuais e meses
anteriores continuam preservados.

As transações operacionais desativam JIT apenas durante a própria transação.
Isso evita o custo de compilação de consultas de painel com RLS, mantendo a
autenticação, o isolamento entre unidades e o limite de tempo das consultas.

Validação: build, lint e carga de teste revertida, com conciliação de cada caixa
e comanda, proteção contra reserva duplicada, consumo de créditos antes e depois
da validade, conferência do painel e ausência de mensagens retroativas. A carga
real também é verificada pela API pública de disponibilidade e pelas telas.
