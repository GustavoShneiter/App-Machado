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

A execução Google estava com um erro anterior de fórmula em dezembro. As exportações posteriores às correções não apresentaram erros. A confirmação de uma nova execução bem-sucedida ainda depende do editor Google, que retornou 404 neste navegador. Não considerar a sincronização ao vivo validada até verificar o próximo reconhecimento do conector.

## Verificação

Build, lint, teste unitário do conector, limites das quinzenas e teste WebKit passaram. Testes SQL com rollback verificaram uso único, cobrança zero, base de comissão por sessão, ausência de mensagens retroativas e reabertura. APKs assinados com o certificado já utilizado. Sem teste em aparelho físico nesta etapa.
