# Intervalo da agenda por unidade

Em **Horário de funcionamento**, a seção **Intervalo da agenda** fica abaixo dos dias da semana. O valor inicial é **15 minutos**. O Gestão ou uma conta profissional com permissão para editar horários pode escolher um número inteiro de **5 a 120 minutos** e salvar.

O banco guarda um valor por unidade. A grade do Gestão e do app Profissional usa o valor recebido no respectivo snapshot. A página pública e o agente usam a mesma regra no banco para gerar disponibilidade e validar novas reservas. Alterar o intervalo não modifica a hora, a duração nem o preço de agendamentos existentes. Reservas ainda exigem que o serviço caiba no horário de funcionamento e não conflite com outra reserva ou bloqueio do mesmo profissional.

O cartão de um atendimento na grade segue sua duração real, pode abranger vários intervalos de início e permanece recortado na coluna do profissional. Um atendimento de 45 minutos, por exemplo, continua aparecendo por 45 minutos mesmo com novos horários oferecidos a cada 15.

## Verificação

- `npm run build` e `npm run lint`.
- `scripts/test-business-hours.mjs --existing` no servidor, com as alterações de teste revertidas por transação: permissão, valor inválido, intervalo de 20 minutos, disponibilidade pública, isolamento entre unidades e domingo fechado.
- Interface publicada: seção mostra 15 minutos; Gestão e agendamento público mostram 08:00, 08:15, 08:30; cartões de atendimentos reais permanecem dentro da coluna e altura correspondentes.
- APKs Gestão 1.21.14 e Profissional 1.3.14: assinatura e conteúdo verificados. Ainda não testados em aparelho Android físico.
