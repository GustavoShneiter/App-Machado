# Várias agendas no Gestão web

Em Agenda, “Selecionar profissionais” permite marcar uma ou várias contas
ativas da unidade. “Selecionar todos” inclui toda a equipe, sem limite fixo de
quatro. Pelo menos um profissional permanece selecionado.

Ao selecionar mais de um, a tela abre a grade com colunas identificadas por
profissional, compartilhando o mesmo dia e eixo de horários. Cabeçalhos e o eixo
permanecem visíveis durante a rolagem; equipes maiores usam rolagem horizontal.
A visualização em lista continua disponível e identifica cada atendimento.

Horários ocupados, bloqueios e encaixes são calculados por profissional. Reservas
simultâneas de profissionais diferentes não disputam a mesma coluna. Encaixes
do mesmo profissional mantêm a divisão em faixas. A busca pode ocultar um cartão,
mas não libera o horário que ele ocupa.

Clicar num horário livre informa ao formulário o profissional daquela coluna.
A seleção altera somente a visualização e não modifica agendamentos, caixa ou
permissões. A disponibilidade continua sendo validada pelo servidor. A novidade
é da versão web administrativa; o acesso profissional continua na própria agenda.

Verificação: build e lint, seleção válida/de profissionais excluídos, faixas de
sobreposição, colunas separadas e ocupação independente. A conferência no Gestão
publicado cobriu uma, duas e três agendas, lista, grade e abertura de agendamento
com o profissional correto, sem salvar reservas de teste.
