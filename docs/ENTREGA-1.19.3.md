# Machado Gestão 1.19.3

Mantém a navegação da base 1.19 e o acesso automático do aplicativo. O APK usa versionCode 24 e a mesma assinatura de produção, permitindo instalar sobre a 1.19.2.

## Comissões

Em **Profissionais → Editar → Configurar comissões**, defina os percentuais de serviços e produtos do barbeiro.

Em cada serviço e produto, escolha uma regra:

- **Usar o percentual do perfil de cada barbeiro:** considera a comissão de serviços ou produtos do profissional.
- **Mesmo percentual para todos:** o percentual informado no item vale para qualquer profissional.
- **Personalizar por profissional:** permite exceções por barbeiro. Campo individual em branco usa o padrão do item; zero significa sem comissão.

As regras individuais existentes continuam preservadas no modo de personalização. Para que um serviço já cadastrado passe a acompanhar o perfil, escolha a primeira opção nele. Os itens de atendimentos/comandas já registrados mantêm o percentual gravado; a alteração vale para novos itens. Os valores continuam discriminados no Caixa.

## Agenda

- Grade das 06h às 23h, com marcações a cada 40 minutos: 06h, 06h40, 07h20 etc. O encerramento às 23h limita a duração do último atendimento. A duração cadastrada do serviço continua sendo respeitada.
- O botão **Novo agendamento**, o **+** e os espaços livres abrem as opções **Novo agendamento**, **Criar encaixe** e **Bloquear agenda**.
- Encaixes permitem horário e duração próprios, dentro do expediente, sem sobrepor outro atendimento ou ultrapassar um bloqueio.
- Bloqueios por horários personalizados, dia inteiro, sete dias ou um mês, com início e fim editáveis.
- Recorrência nos dias escolhidos da semana, em horários definidos ou no dia inteiro. Pode durar dois meses, um ano, até uma data escolhida ou sempre, até ser removida.
- O botão **Bloqueios** permite consultar e excluir períodos e recorrências. Excluir uma recorrência remove toda a série. Bloqueios de férias podem coexistir com fechamentos semanais.
- O banco verifica os conflitos tanto para o aplicativo quanto para o site. Um bloqueio que atingiria um atendimento existente é recusado; não apaga o atendimento.

## Site

O endereço principal e o link antigo `/agendar` exibem a entrada com **WhatsApp** e **Agendamento**. O botão Agendamento abre `/agendar/horarios`.

A seleção de serviço, profissional e horário avança pelo toque, sem Continuar. A confirmação final permanece no formulário de nome, telefone e aceite. Logo, cards e informações foram compactados, preservando o alinhamento no celular e no computador.

## Verificação e instalação

Instale `Machado-Gestao-v1.19.3.apk` sobre a versão atual. Não é necessário desinstalar uma versão com a mesma assinatura de produção. O APK contém acesso administrativo automático e permanece fora do GitHub.

Executados: build/TypeScript, lint, testes de banco com rollback, fluxo navegador → API → Neon, conferência de comissões, encaixes, recorrência finita e permanente, conflitos de horário, navegação, formulários em quatro resoluções e verificação no Android. A migração 007 preserva os registros financeiros e é reaplicável por `npm run db:scheduling`. Backups incluem as regras recorrentes.

Para conferir o fluxo completo, com uma conta temporária de QA configurada localmente: `npm run test:scheduling`. O teste remove seus próprios cadastros ao terminar. Credenciais e chave de assinatura ficam em arquivos privados, fora do código-fonte entregue.

A homologação final continua sendo um dia de uso real na barbearia.
