# Horário de funcionamento por unidade

O padrão aplicado às unidades existentes e aos novos cadastros é segunda a
sábado, das 08:00 às 22:00. Domingo fica fechado. O Gestão e o Profissional
consultam a mesma configuração, em **Menu → Horário de funcionamento**.

O Gestão edita os dias e horários e concede ou revoga a edição individualmente
nas contas profissionais ativas da própria unidade. O padrão é sem permissão.
Uma conta profissional autorizada altera o funcionamento da unidade, mas não
concede acesso a outras contas. Contas sem permissão consultam a configuração.
Permissões, horários e revisões são validados no servidor e auditados; uma
revisão desatualizada exige recarregar antes de salvar.

As reservas públicas, os encaixes, as agendas dos dois apps e a disponibilidade
do agente usam os horários locais em America/Sao_Paulo. O atendimento inteiro
precisa caber no expediente. A grade mantém o intervalo existente de 40 minutos,
contado a partir da abertura configurada. Serviços adicionais continuam
permitindo a sobreposição autorizada, respeitando o expediente.

Agendamentos anteriores não são removidos nem remarcados. Os que já estavam
fora do novo expediente continuam visíveis. A confirmação de um atendimento
antigo sem mudança de horário não é bloqueada pela nova regra. Alterações no
expediente não modificam caixa, comissões ou planilhas.

Migração: `023_business_hours_permissions.sql`, aplicada uma única vez com
credencial de manutenção que possua as funções existentes. O script
`migrate-business-hours.mjs` verifica o checksum e aceita `--apply`; sem esse
argumento reverte a simulação. O teste `test-business-hours.mjs --existing`
confere a configuração, concessão, revogação, bloqueios e isolamento após a
migração, revertendo todos os registros e alterações usados no teste.
