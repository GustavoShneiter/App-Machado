# Machado Gestão 1.20 — Agenda e recebimentos

Site: https://barbearia-machado-rose.vercel.app. APK e site continuam distribuições separadas e compartilham API Vercel e banco Neon.

## Agenda

O aplicativo abre diretamente na Agenda, com acesso automático mantido. O menu inferior e o botão flutuante foram removidos. Use o botão de menu no topo para acessar Caixa, Clientes, Serviços, Profissionais e demais áreas. “Novo agendamento” fica na própria Agenda.

Cada cartão mostra cliente, profissional, serviço, data, horário, valor e situação. O botão Filtros reúne data/período, profissional, cliente/telefone, serviço/código e situação. Os intervalos ficam agrupados; os horários de um profissional podem ser expandidos na consulta de um único dia. A disponibilidade usa os horários de funcionamento e as reservas do servidor.

Use “Confirmar que veio” para deixar o atendimento pronto para receber no Caixa, ou “Confirmar que não veio” para registrar falta e liberar o horário. A confirmação de presença não registra pagamento. No Caixa, receba pelo meio de pagamento efetivo; a divisão entre barbearia e profissional é calculada automaticamente. Não é necessário passar por Comandas nesse fluxo. Comandas continua disponível para serviços adicionais, produtos, descontos e pacotes.

Remover da Agenda cancela reservas pendentes e libera o horário. Registros já concluídos, pagamentos e comissões ficam preservados e apenas saem da tela da Agenda. Atendimentos concluídos ocultos continuam ocupando seu intervalo. A exclusão não remove o cadastro do cliente.

## Página pública

Disponibilidade, título, profissional, datas e horários estão centralizados no celular e no computador. Não há botão Atualizar na escolha do horário. Slots indisponíveis estão desabilitados. Cards dos profissionais têm imagem 4:5 e maior destaque; “Qualquer profissional disponível” é uma opção compacta abaixo. Quando não há foto cadastrada, o card exibe as iniciais, sem inventar imagens dos profissionais.

## Instalação e banco

O APK 1.20 tem versionCode 21, mesmo identificador e mesma chave de produção. Pode atualizar sobre 1.18/1.19 de produção. As regras de distribuição privada seguem [ENTREGA-1.19.md](ENTREGA-1.19.md): quem tem o APK possui acesso à gestão.

Execute `npm run db:agenda` antes de publicar esta versão sobre um banco existente. A atualização aplica `004_agenda.sql` e `005_service_commissions.sql` em uma transação. São idempotentes e não recalculam pagamentos históricos. Novos serviços priorizam o percentual configurado para a combinação serviço/profissional; na ausência dessa regra, conservam os padrões anteriores.

## Verificação

- Build TypeScript, renderização das rotas, cálculos financeiros e lint.
- Testes no Neon com fixtures revertidas: conflitos e sobreposições, presença, recebimento, percentual específico do serviço, ausência, liberação de horário, remoção e preservação financeira; acesso anônimo rejeitado.
- Navegador: reserva pública → Agenda → filtros → presença/falta → recebimento Pix no Caixa; remoção de atendimento pago preservando pagamento; proporção 4:5, centralização e navegação mobile.
- Android: atualização assinada, abertura automática na Agenda, reabertura, sessão expirada e recuperação da conexão; navegação pelo menu superior.

As rotinas diárias e homologação seguem [ENTREGA-1.18.md](ENTREGA-1.18.md). Use por um dia inteiro na barbearia para validar os aparelhos, a conexão e a rotina real.
