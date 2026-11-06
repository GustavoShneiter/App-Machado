# Machado Gestão e Machado Profissional

<!-- impeccable:product-schema 1 -->

## Platform

web

React/TypeScript com versões web para PC e iPhone e empacotamento Android por Capacitor. A versão de iPhone é instalada pelo Safari. Backend na Vercel, Better Auth, Neon Postgres e armazenamento de fotos separado.

## Users

O proprietário e administradores de cada unidade Machado gerenciam agenda, clientes, serviços, produtos, comissões, Caixa e relatórios. Barbeiros usam o Machado Profissional para a própria agenda, encaixes, bloqueios, comissões e metas. Clientes finais usam a página pública para agendar.

## Product Purpose

Organizar a operação diária e permitir que o profissional entenda o que tem a receber e sua evolução semanal. O atendimento confirmado segue para recebimento e distribuição da comissão conforme a regra cadastrada.

## Operating Context

Uso frequente pelo celular durante o atendimento; administração também no PC. Agenda das 06h às 23h, com intervalos de 40 minutos. Valores em reais e datas no fuso America/Sao_Paulo. Operações dependem de internet.

## Capabilities and Constraints

- Cada nova conta administrativa cria uma nova unidade Machado, com equipe, clientes e Caixa isolados. A unidade atual mantém sua operação e histórico.
- Administração define as metas. O profissional acompanha ou oculta a visualização, sem alterar os valores.
- Barbeiros veem apenas seus próprios resultados e comissões; visão geral e filtro por profissional são administrativos.
- Mesmo site profissional para toda a equipe; o login determina os dados. Mesmos endereços administrativos para as unidades, respeitando a conta conectada.
- Login normal por e-mail e senha em Android e web. Cadastro administrativo disponível para novas unidades.
- Links de acesso web devem ser encontráveis no Menu de cada edição.
- Atualização por gesto de puxar a tela no topo; dispensar botões persistentes de atualizar.

## Brand Commitments

Manter nome Machado, identidade escura e verde musgo forte, marcas e fotos existentes. Linguagem direta em português brasileiro. Evitar informações encaixotadas ou decorativas no Caixa profissional.

## Evidence on Hand

Código operacional existente, fonte Space Grotesk local, marca em public/, dados reais no banco. A referência fornecida em 06/11/2026 é um aplicativo financeiro com resumo, rosca com legenda/valores e lista de transações; usar sua organização, preservando as cores Machado. Não inventar desempenho, valores ou crescimento.

## Product Principles

1. Cada unidade e cada profissional acessam somente os dados permitidos.
2. Os números e gráficos derivam dos registros, com períodos e unidades explícitos.
3. Mostrar o essencial primeiro e detalhes com uma ação clara.
4. Preservar o fluxo da operação atual durante as atualizações.
