# Operação integrada — 18/09/2026

## Uso diário

1. Abra o Caixa e informe apenas o dinheiro físico inicial.
2. O cliente agenda pelo link público. A Agenda mostra cliente, profissional, serviço, horário e situação; uma comanda é aberta automaticamente.
3. Confirme a chegada e depois a conclusão do atendimento na Agenda. Para serviços com preço a consultar, informe o valor na Comanda antes de concluir.
4. Na Comanda, registre o pagamento realmente recebido e a forma de pagamento. O valor entra no Caixa uma única vez.
5. A conclusão gera 40% de comissão para profissionais, exceto Machado (zero de comissão). Em Caixa, registre o repasse quando efetivamente pago.
6. Lance despesas, reforços e retiradas com motivo. No fechamento, informe o dinheiro contado. Pix e cartões não entram no saldo de dinheiro físico.
7. Relatórios filtram datas e profissionais. Realizado usa a data do atendimento; recebido usa a data do pagamento. CSV exporta os atendimentos filtrados.

## Sincronização e persistência

Agenda, Clientes, Comandas, Caixa, Produtos e Relatórios usam `office_snapshot`, protegido por conta administrativa ativa. Alterações usam `office_action`, com validações e transações. A atualização ocorre após cada operação, ao retomar a aba, por eventos do banco quando disponíveis e a cada 10 segundos com a página visível. O catálogo público atualiza também por consulta periódica.

Não são usados dados de demonstração ou armazenamento local nessas telas. Exclusão de profissional desativa o perfil, preservando histórico e permitindo reativação.

## Validação executada

- TypeScript, lint e teste de renderização das dez telas, com e sem registros.
- Testes de cálculo de comissão, filtros, cancelados, Pix vs dinheiro e exportação CSV.
- `supabase/tests/connected_operations.sql` executado no PostgreSQL do projeto, com todas as fixtures revertidas: reserva pública, identificação na agenda, conflito de horário, criação de comanda, conclusão e repasse idempotentes, Machado sem comissão, recebimento, estoque, despesa e bloqueio de acesso anônimo.
- Verificação visual de Agenda, Comandas, Caixa e Relatórios; teste de filtro por profissional; layout mobile.

## Limites atuais

Recebimentos são integrais, uma forma de pagamento por comanda. Não há pagamento parcial, estorno, lançamento de venda de produto em comanda nem conciliação automática com bancos. Estoque permite cadastro e ajustes com motivo. Serviços realizados anteriormente não são marcados como pagos automaticamente: precisam de confirmação administrativa de recebimento.

Migrações aplicadas: `202609180010_connected_operations.sql` e `202609180011_completion_price_guard.sql`.
