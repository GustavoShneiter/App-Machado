# Gestão 1.21.2 / Profissional 1.3.2

## Atendimento e recebimento pelo profissional

- Agenda → agendamento → **Ver atendimento e pagamento**, ou Caixa → **Pagamentos dos clientes**.
- A tela de comanda da Gestão é reutilizada com acesso limitado aos próprios atendimentos.
- Após concluir o atendimento, o profissional pode adicionar um serviço e editar o serviço realizado/valor antes do pagamento. As regras de comissão são calculadas no servidor.
- O recebimento usa a mesma comanda, pagamento e movimentação do caixa da Gestão. É necessário que a gestão tenha aberto o caixa. Tentativas simultâneas e repetidas não recebem duas vezes.
- O total confirmado deve coincidir com o total atual do servidor. Serviços com repasse já pago ou sessão de plano utilizada precisam ser ajustados pela gestão. Comandas com itens de outros profissionais ficam com a gestão.
- Receber do cliente não marca comissão como repassada. Recebidas/A receber em Minhas comissões continuam representando repasses.
- Ajustar o serviço realizado na comanda não remarca nem estende o horário reservado na Agenda.

## Verificação

- Banco temporário descartável: edição, comissão, isolamento, plano, bloqueio de repasse pago, caixa fechado, concorrência e leitura do mesmo pagamento na Gestão. Nenhum cliente ou pagamento de teste inserido em produção.
- Interfaces compiladas das duas edições: fluxo de edição e recebimento com respostas simuladas, Chrome móvel/desktop e WebKit móvel. Sem afirmar teste autenticado em aparelho real.
- Compilação e análise de código passaram. APKs finais assinados, identificadores e versões verificados; Microsoft Defender local não detectou ameaças nos arquivos completos.
- Bundles permanecem legíveis, sem minificação. Nenhum arquivo foi enviado a serviços externos de análise.
- Sem migração de banco, mudanças no agendamento público ou ativação de mensagens do agente.

Os arquivos e seus hashes estão em `releases/android/manifest-1.21.2.json`.
