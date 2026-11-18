---
name: Machado Gestão e Machado Profissional
description: Sistema operacional claro, com informação por contexto e ações em verde.
colors:
  green: "#155442"
  deep: "#103f33"
  mint: "#e7f4ee"
  canvas: "#f7f8fa"
  surface: "#ffffff"
  raised: "#edf1ee"
  ink: "#1c2925"
  muted: "#65716c"
  line: "#e4e9e6"
  line-strong: "#cbd6cf"
  blue: "#315ca8"
  blue-bg: "#ecf2ff"
  lilac: "#655298"
  lilac-bg: "#f0edfa"
  amber: "#8b5814"
  amber-bg: "#fff3df"
  rose: "#a75869"
  rose-bg: "#fbeef1"
  danger: "#a43249"
  focus: "#38826a"
  progress-track: "#e1ece5"
typography:
  balance: {fontFamily: "Manrope, sans-serif", fontSize: "38px", fontWeight: 750, lineHeight: 1.4, letterSpacing: "-0.035em"}
  headline: {fontFamily: "Manrope, sans-serif", fontSize: "28px", fontWeight: 750, lineHeight: 1.2, letterSpacing: "-0.025em"}
  title: {fontFamily: "Manrope, sans-serif", fontSize: "19px", fontWeight: 750, lineHeight: 1.35, letterSpacing: "-0.025em"}
  body: {fontFamily: "Manrope, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.5}
  control: {fontFamily: "Manrope, sans-serif", fontSize: "14px", fontWeight: 750}
  input: {fontFamily: "Manrope, sans-serif", fontSize: "16px", fontWeight: 400}
  label: {fontFamily: "Manrope, sans-serif", fontSize: "12px", fontWeight: 650}
rounded:
  badge: "6px"
  context-option: "9px"
  compact: "10px"
  control: "12px"
  surface: "16px"
  nav-selection: "20px"
  chip: "24px"
  sheet: "24px"
  circle: "50%"
spacing:
  micro: "4px"
  small: "8px"
  gap: "12px"
  group: "16px"
  panel: "20px"
  section: "24px"
  workspace: "32px"
  columns: "40px"
components:
  button-primary: {backgroundColor: "{colors.green}", textColor: "{colors.surface}", rounded: "{rounded.control}", padding: "12px 18px", height: "48px", typography: "{typography.control}"}
  button-primary-hover: {backgroundColor: "{colors.deep}"}
  button-secondary: {backgroundColor: "{colors.mint}", textColor: "{colors.green}", rounded: "{rounded.control}", padding: "12px 18px", height: "48px", typography: "{typography.control}"}
  button-outline: {backgroundColor: "{colors.surface}", textColor: "{colors.green}", rounded: "{rounded.control}", padding: "10px 14px", height: "44px"}
  input-field: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", padding: "12px 14px", height: "50px", typography: "{typography.input}"}
  navigation-bottom: {backgroundColor: "{colors.surface}", textColor: "{colors.muted}", height: "76px"}
  filter-chip-selected: {backgroundColor: "{colors.green}", textColor: "{colors.surface}", rounded: "{rounded.chip}", padding: "8px 14px", height: "40px", typography: "{typography.label}"}
  status-tag-completed: {backgroundColor: "{colors.mint}", textColor: "{colors.green}", rounded: "{rounded.badge}", padding: "4px 7px"}
  card-balance: {backgroundColor: "{colors.green}", textColor: "{colors.surface}", rounded: "{rounded.surface}", padding: "20px 22px"}
  goal-compact: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.surface}", padding: "16px 18px"}
  context-tabs: {backgroundColor: "#ebefed", textColor: "{colors.muted}", rounded: "{rounded.control}", padding: "4px"}
  transaction-row: {textColor: "{colors.ink}", padding: "18px 0", height: "85px"}
---

# Design System: Machado Gestão e Machado Profissional

## Overview

**Creative North Star: "Rotina por camadas"**

A direção aprovada organiza a rotina do balcão em superfícies claras, valores legíveis e ações em verde. Cada tela apresenta seu contexto principal; listas, abas locais e grupos tonais expõem os detalhes conforme a tarefa, sem repetir o mesmo painel em todas as funções.

Gestão e Profissional compartilham a linguagem visual, preservando as permissões e o significado dos dados de cada edição. A densidade se adapta ao espaço: navegação inferior no celular, área ampla de trabalho no PC e detalhes em janelas ou painéis inferiores.

**Key Characteristics:**
- Fundo claro, superfícies brancas e verde reservado às ações e aos destaques operacionais.
- Manrope local, números tabulares e hierarquia por tamanho e peso.
- Listas por função, abas de contexto e detalhes progressivos.
- Início no centro da navegação inferior, com rótulos persistentes.

Registro extraído da implementação em 18/11/2026, principalmente de `src/approved-design.css`, `src/ApprovedHome.tsx`, `src/ApprovedCashView.tsx`, `src/reports/AdminReports.tsx`, `src/professional/ProfessionalCash.tsx`, `src/professional/ProfessionalGoals.tsx` e `src/professional/ProfessionalApp.tsx`. Substitui as regras anteriores de carvão e Space Grotesk para os shells Gestão/Profissional; a página pública de agendamento mantém seu escopo próprio.

Autoridade visual: propostas `exploracao-03-2026-11-17` e `financeiro-04-2026-11-17`, aprovadas em 17/11, com implementação autorizada em 18/11 e ajuste posterior de Início para a posição central. O financeiro 04 substitui o Caixa da proposta 03. Os avisos antigos de “não aprovado” e “aguardar OK” nas cópias congeladas são históricos; não revogam a autorização posterior. As referências congeladas permanecem intactas.

Evidência local: `.private/screenshots/redesign-2026-11-18` contém capturas de cenários com fixtures. Esta documentação não certifica execução em Android/iPhone reais, publicação, geração de APK nem estado de produção. As versões previstas são Gestão 1.21.0 e Profissional 1.3.0.

## Colors

### Primary

Verde floresta (`green`) conduz ações, seleção, entradas e os saldos de destaque. Verde profundo (`deep`) aparece no hover primário e no suporte da marca. Menta (`mint`) sustenta ações secundárias, ícones e seleções de navegação.

### Secondary

Azul (`blue`/`blue-bg`), lilás (`lilac`/`lilac-bg`), âmbar (`amber`/`amber-bg`) e rosa (`rose`/`rose-bg`) identificam ações ou estados locais. Âmbar acompanha atenção/presença; rosa e `danger` acompanham erro, ausência ou ação destrutiva. Cor sempre vem com rótulo, sinal ou contexto textual.

### Neutral

`canvas` é o fundo da aplicação; `surface` reúne linhas e formulários; `raised` distingue busca e campos de acesso. `ink` é o texto principal, `muted` é informação secundária, `line` separa linhas e `line-strong` delimita campos. `focus` identifica o foco de teclado; `progress-track` sustenta metas e evolução.

**The Context Color Rule.** A cor apoia o tipo de ação ou o estado; não substitui o nome, a data, a situação nem o sinal do valor.

## Typography

**Display Font:** Manrope, com fallback sans-serif.
**Body Font:** Manrope, com fallback sans-serif.

A origem aprovada é a fonte variável local `/fonts/Manrope.ttf`, com faixa 200–800; o arquivo original e a licença `/fonts/OFL-Manrope.txt` permanecem preservados. A interface entrega três instâncias estáticas derivadas dessa fonte: `/fonts/Manrope-400.ttf`, `/fonts/Manrope-650.ttf` e `/fonts/Manrope-750.ttf`, declaradas nos pesos 400, 650 e 750 com `font-display: swap`. A mudança evita a regressão observada no WebKit de Windows, que mantinha a fonte variável no peso 200 apesar das regras de peso; não é uma certificação em iPhone real.

O shell usa números tabulares. `font-weight` seleciona a instância estática mais próxima; pedidos intermediários ou de peso 800 resolvem para as faces disponíveis. As regras explícitas de `font-variation-settings` por papel continuam no código, mas são inertes nas fontes estáticas. Os tokens registram os papéis estáveis: texto e entrada 400, contexto 650 e títulos/negritos/ação primária 750.

### Hierarchy

- **Balance:** destaque financeiro; a base do Caixa e do saldo profissional usa o token `balance`. O saldo do Início usa 36px e o valor ativo de Relatórios usa 35px, mantendo a mesma família e o mesmo peso.
- **Headline:** título de página, conforme `headline`. Em até 380px, os títulos principais passam a 26px.
- **Title:** cabeçalhos de seção, conforme `title`; listas e seções financeiras também usam 17–18px conforme a composição.
- **Body:** conteúdo e controles gerais, conforme `body`; campos editáveis usam `input` para preservar leitura no Safari.
- **Label:** contexto de filtros e ações compactas, conforme `label`. Metadados de linha usam 11–12px; etiquetas compactas e rótulos da navegação móvel usam 10px.

**The One Family Rule.** Novas telas dos dois shells usam Manrope local; não herdam Space Grotesk, DM Sans ou a tipografia da página pública.

## Layout

O documento rola verticalmente; shells de altura variável não contêm o gesto com `overscroll-behavior: contain`. A contenção é reservada à janela que efetivamente rola. Atualização por gesto começa no topo e respeita formulários e camadas abertas.

No PC, a Gestão usa barra lateral branca de 232px e conteúdo com margem correspondente. O espaço de página tem largura máxima de 1256px e padding de 28px 32px 48px. Início divide duas colunas com intervalo de 32px; Caixa usa duas colunas com 40px; Relatórios usa proporção 1.15fr/1fr com 40px. Profissional mantém espaço centralizado de até 1256px, com navegação inferior de até 760px no PC. O cabeçalho superior de identidade não é um menu de navegação.

Em até 900px, a barra lateral desaparece, as composições principais passam a uma coluna e a página limita a leitura a 700px com padding de 24px 24px 36px. Em até 380px, os recuos laterais ficam em 20px. As áreas principais reservam espaço inferior para a navegação e a área segura. Não introduzir rolagem horizontal da página.

Navegação móvel com cinco destinos e Início no terceiro lugar: Gestão **Agenda / Caixa / Início / Clientes / Menu**; Profissional **Agenda / Caixa / Início / Relatórios / Menu**. A navegação móvel tem base de 76px, acrescida da área segura inferior. Ícones são de 22px, links de pelo menos 60px de altura, com rótulos sempre visíveis. Em PC, a barra do Profissional tem 78px; a Gestão usa sua lateral.

**The Context First Rule.** Cada função escolhe sua organização de dados: Agenda por dia/profissional, Caixa por Hoje/Extrato/Repasses e Relatórios por métrica/período. Não transformar essas telas em cópias do Início.

## Elevation & Depth

O sistema usa camadas tonais e divisores, sem sombra nos painéis, listas, saldos ou navegação. As exceções implementadas são o botão flutuante de agendar e a janela modal, que precisam se separar do conteúdo.

### Shadow Vocabulary

- **Ação flutuante:** `0 5px 16px #103f3324`.
- **Janela modal:** `0 12px 40px #103f3326`, com fundo de bloqueio `#102b235e`, sem desfoque.

Entrada de painel: 200ms ease-out, de 18px abaixo e opacidade .92 até a posição final. A ação primária transiciona cor/opacidade em 140ms. A barra de metas anima a escala horizontal em 950ms com `cubic-bezier(.22,1,.36,1)`; respeita movimento reduzido. `prefers-reduced-motion: reduce` remove animações e transições do shell.

**The Tonal Depth Rule.** Use fundo, branco, menta e divisores para agrupar conteúdo; preserve sombras apenas nas camadas flutuantes existentes.

## Shapes

Superfícies agrupadas usam `rounded.surface`; campos e botões usam `rounded.control`. Etiquetas têm cantos menores; chips usam forma de cápsula; avatares e ações financeiras circulares usam `rounded.circle`. Não cercar cada número com um cartão: preserve linhas dentro do mesmo grupo.

Janelas no PC têm cantos de 16px, largura de até 580px, cabeçalho fixo interno e rolagem própria. No celular alinham à base, com largura de até 700px e cantos superiores de 24px; respeitam a altura visual e as áreas seguras.

## Components

### Buttons

Primário sólido, secundário menta e outline branco. Os tokens registram a altura-base; na implementação são alturas mínimas, permitindo quebra de texto. Ações principais têm mínimo de 48px, outline e botões de ícone 44px. Hover primário usa `deep`, pressionado reduz opacidade a .74 e desabilitado a .45. O foco visível usa contorno de 3px com afastamento de 3px. Ícones de linha vêm de SVG, acompanhados de rótulo ou nome acessível.

### Chips

Filtros financeiros são brancos quando inativos e verdes com texto branco quando selecionados; a seleção é exposta por `aria-pressed`. Caixa usa mínimo de 40px e comissões profissionais 42px. Seletores de profissional da Agenda usam foto/iniciais, mínimo de 44px e seleção menta com borda discreta. Etiquetas de estado são informativas, com cor e texto; não são botões de filtro.

### Cards / Containers

Grupos brancos compartilham cantos de 16px e não têm sombra ou borda externa. Linhas financeiras usam padding vertical de 18px, mínimo de 85px e divisor; a última linha remove o divisor. Descrição flexível à esquerda, metadados abaixo e valor sem quebra à direita. Ícone tonal identifica o contexto sem repetir decoração em cada métrica.

O saldo do Início combina rótulo, valor, ocultar/mostrar e acesso ao Caixa. No Profissional, “Comissões a receber” descreve o total pendente de todos os períodos; filtros de período governam os resultados e as comissões, sem renomear esse saldo como faturamento.

### Inputs / Fields

Campos brancos, borda de 1px em `line-strong`, cantos de controle, altura mínima de 50px e texto de 16px. Rótulo acima, intervalo de 8px e espaço inferior de 20px. Busca pode usar fundo `raised` sem borda interna; seu grupo recebe contorno de foco de 2px em verde. Erros têm texto e fundo rosa claro, sem depender só de cor.

### Navigation

Cinco destinos na ordem indicada em Layout; ícone acima do rótulo no celular. Selecionado em verde, com cápsula menta atrás do ícone. Gestão no PC usa seleção menta na lateral. Não adicionar hambúrguer ou menu de três pontos no topo; recursos complementares ficam em Menu. Preservar cabeçalhos de identidade e ações contextuais.

### Context Tabs and Reports

Hoje/Extrato/Repasses formam um grupo tonal com opção selecionada branca. Faturamento/Recebido/Resultado usam abas com sublinhado verde e seleção acessível. Relatórios mostram uma métrica por vez, período explícito, filtro por profissional e valores rastreáveis. Até 14 dias, o faturamento usa barras selecionáveis; períodos maiores usam a evolução existente. Resultado explica faturamento, comissões e despesas em linhas. Não impor rosca ou gráfico ornamental em toda tela.

### Professional Disclosure

Meu resultado inicia recolhido; abre indicadores e evolução semanal. Minhas comissões mostra até três itens, agrupados por dia, com uma ação para abrir o extrato completo quando necessário. Metas da semana usa um grupo branco compacto com padding de 16px 18px: período, primeira meta configurada e sua barra de progresso. A prioridade é comissão, serviços e clientes, omitindo metas sem valor definido. A ação “Ver progresso” abre o diálogo existente com todas as metas e os detalhes; não repete as metas secundárias na tela principal. Sem metas, o grupo oferece as opções de visualização. Administração define os valores e o profissional controla apenas sua visualização; permissões e dados permanecem iguais.

## Do's and Don'ts

### Do:

- **Do** manter Início no centro e os cinco destinos próprios de cada edição.
- **Do** usar Manrope local, números tabulares, reais com duas casas e períodos explícitos.
- **Do** agrupar registros em listas e escolher abas, gráficos e grupos tonais conforme a função.
- **Do** preservar foco visível, estados de carregamento/erro/vazio e movimento reduzido.
- **Do** preservar permissões por unidade/profissional e distinguir faturamento, recebimento, comissão, despesa e dinheiro na gaveta.

### Don't:

- **Don't** restaurar o carvão/Space Grotesk como identidade dos shells ou criar outra direção visual.
- **Don't** adicionar menus de navegação no topo ou transformar cada métrica em um cartão isolado.
- **Don't** usar valores dos protótipos como dados reais nem atribuir ao profissional a visão administrativa.
- **Don't** apresentar capturas com fixtures como validação em dispositivo real ou publicação em produção.

Não canonizado: os textos de 10px em etiquetas/metadados compactos e as exceções de toque de 32–42px observadas no código são limitações herdadas a revisar, não novos padrões mínimos. Este registro não corrige esses pontos nem encerra a revisão visual/material ainda em andamento.
