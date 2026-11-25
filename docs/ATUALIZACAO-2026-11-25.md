# Atualização de 25/11/2026

Gestão 1.21.19 (52), Profissional 1.3.19 (27). Backend Contabo.

## Planos

Renovar abre uma nova venda com cliente e plano preenchidos, permitindo trocar o plano. O saldo anterior é preservado. Usar sessão pede profissional, data e horário; utiliza um atendimento coincidente ou cria um encaixe e registra a comanda. A operação é idempotente para o mesmo atendimento. A conclusão automática do atendimento continua aplicando uma sessão disponível, e os novos usos calculam a comissão pelo valor da venda dividido pela quantidade total de sessões. Valores históricos não são recalculados.

Gabriel Antônio de Melo Gonçalves já possuía corte concluído em 23/11 vinculado ao plano e venda ativa de R$ 68 com uma das duas sessões restantes. Esses dados foram preservados, sem nova venda ou baixa duplicada.

## Comandas e caixa

Comandas pagas podem ser reabertas. Recebimentos são estornados com lançamento compensatório no caixa atualmente aberto; o histórico não é apagado. A operação exige revisão quando há comissão já repassada. Profissionais só podem reabrir suas próprias comandas. Não foi encontrada rotina de fechamento automático de caixa; o fechamento continua sendo uma ação administrativa manual.

Agenda e comandas usam verde neon para pendentes e verde escuro para pagas. A agenda conjunta utiliza rolagem horizontal e acompanha a página verticalmente. Teste WebKit com três profissionais passou. Fotos dos produtos foram reduzidas. Metas contam 1–15 e 16–último dia, preservando os valores configurados.

## Planilha

O servidor guarda os dados publicados ao fechar manualmente o caixa. Recebimentos, vendas de planos e repasses precisam estar vinculados a caixas fechados para entrar na publicação. O conector Google continua consultando o servidor por agendamento, portanto o fechamento não exige manter o celular aberto. O atraso depende da próxima execução do Google.

As bases antigas embutidas nas fórmulas de novembro e dezembro foram substituídas por zero e o controle da integração foi reconciliado. Dezembro foi verificado com total zero e sem erros de fórmula. Novembro foi recomposto no servidor a partir dos caixas fechados, com início em 1/11. Nenhum registro operacional do app foi zerado. O backup PostgreSQL anterior fica em `/opt/machado-app/backups/before-plans-2026-11-25.dump`; a planilha mantém o histórico normal de versões do Google.

“Ajustes do app” concilia o preço fixo do modelo com o valor efetivamente cobrado e gorjetas. Remover a coluna causaria divergência nos totais.

A execução Google estava bloqueada por divisões por zero em dezembro (T38 e X38), propagadas para V42, U44 e X44. Foram aplicadas as guardas `IF(S39=0;0;S38/S39)` e `IF(S39=0;0;W39/S39)` para o mês sem movimento. O editor ativo foi localizado pelo projeto “Machado — Integração do Caixa” e executado com a autorização existente. A execução concluiu e as conexões de 2026 e 2027 reconheceram sincronização em 25/11 às 19:20, sem erro e sem células manuais pendentes. Dezembro ficou zerado; novembro passou a refletir a publicação reconstruída dos caixas fechados. As versões anteriores continuam recuperáveis no histórico da planilha.

## Verificação

Build, lint, teste unitário do conector, limites das quinzenas e teste WebKit passaram. Testes SQL com rollback verificaram uso único, cobrança zero, base de comissão por sessão, ausência de mensagens retroativas e reabertura. APKs assinados com o certificado já utilizado. Sem teste em aparelho físico nesta etapa.

## Correção das comandas de plano

Após a conferência das três telas, a causa era o item do serviço ser gravado como R$ 0 para impedir nova cobrança. O valor da sessão ficava apenas na comissão; por isso a linha do corte aparecia zerada e as comissões antigas podiam continuar com base de R$ 40. Agora o item mostra o valor proporcional da sessão, enquanto Caixa e relatórios excluem a sessão coberta do valor adicional a receber e da receita de serviço (o pacote já foi contabilizado na venda). O cálculo é estável pelo valor da venda dividido pelo número total de sessões do pacote.

Os 12 usos já registrados na unidade foram corrigidos para R$ 34 por sessão; comissões pendentes associadas passaram a usar R$ 34 como base. Nenhuma comissão já paga seria reescrita. O recebimento administrativo, profissional e o fechamento de comanda coberta ignoram o valor informativo da sessão para não cobrar duas vezes. Descontos também consideram apenas itens realmente cobrados.

O indicador de plano foi movido para o canto superior direito do bloco na agenda, no mesmo padrão visual do ícone da comanda. Testes cobriram posição do ícone, valor por sessão, zero adicional a receber, relatórios sem duplicidade e fechamento de comando coberto. Gestão 1.21.20 (53) e Profissional 1.3.20 (28); certificados de assinatura conferidos.

## Reserva de cortes com plano

As sete comandas futuras elegíveis da unidade foram corrigidas para R$ 34 por sessão (plano de R$ 68 por dois cortes). A reserva apenas exibe e calcula o valor proporcional; o saldo do plano só é consumido quando o atendimento é concluído. Se não houver mais uma sessão ativa no momento do atendimento, o sistema usa o preço normal do serviço. Novos agendamentos de clientes com sessão ativa passam a gravar o valor proporcional e recalcular a comissão na mesma base. A tela de comandas destaca R$ 34 como valor do atendimento e R$ 0 a receber enquanto o pacote estiver disponível.

Os atendimentos concluídos anteriores permanecem no histórico. Teste SQL transacional executado no banco de produção e revertido no fim: ao finalizar pelo mesmo fluxo do app, a comanda manteve R$ 34, vinculou exatamente uma sessão, não gerou valor adicional a receber, preservou a comissão proporcional e uma segunda confirmação não consumiu novo saldo. O teste também cobriu ausência de mensagem retroativa e reabertura. Build, lint e testes de relatórios verificados nesta versão.

Gestão 1.21.21 (54) e Profissional 1.3.21 (29).
