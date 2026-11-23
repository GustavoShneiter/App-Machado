# Clientes existentes em agendamentos e encaixes

Gestão e Profissional usam o mesmo campo de busca por nome ou telefone. A lista
mostra nome e WhatsApp, ignora acentos e permite refinar a pesquisa. A seleção
preenche os dados e vincula o atendimento ao ID do cadastro da unidade. A ação
“Trocar cliente” libera a escolha de outro cadastro ou o preenchimento manual.

O Profissional recebe os nomes e telefones da base completa da sua unidade.
Observações continuam disponíveis somente para clientes das suas comandas,
como antes. Dados de outras unidades e resultados financeiros dos demais
profissionais continuam restritos.

A migração `024_existing_booking_customer.sql` preserva a escolha explícita do
cadastro, mesmo quando mais de um registro possui o mesmo telefone normalizado.
Clientes existentes sem WhatsApp podem ser agendados sem inventar um contato;
o agente mantém a verificação existente de elegibilidade de telefone. A reserva
não altera nome ou telefone do cadastro selecionado. Sem seleção, o fluxo de
cadastro manual e a busca anterior por telefone continuam funcionando.

O teste `scripts/test-booking-customers.mjs` verifica o diretório por unidade,
homônimos, telefones com formatos diferentes, ausência de telefone, seleção no
Gestão e no Profissional, isolamento e ausência de duplicação. Os clientes,
reservas e mensagens de teste são revertidos na própria transação.
