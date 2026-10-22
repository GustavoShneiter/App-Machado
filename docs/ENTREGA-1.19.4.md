# Machado Gestão 1.19.4

Mantém a navegação da base 1.19, com os cinco itens inferiores e o destaque verde animado. Android versionCode 25, com a mesma assinatura de produção da 1.19.3.

## Agenda

- Profissionais menores, centralizados, com seleção identificada em verde.
- Removidos os controles de data, Novo agendamento e Bloqueios acima dos profissionais.
- Toque em **Semana selecionada** para abrir o calendário, escolher mês, ano e dia, ou voltar para hoje. As setas laterais continuam mudando a semana.
- O **+**, disponível também no PC, abre Novo agendamento, Criar encaixe, Bloquear agenda e Ver bloqueios. Os espaços livres continuam abrindo as opções de criação.
- Preservadas a grade das 06h às 23h, as marcações a cada 40 minutos, as comissões, as recorrências e a proteção contra conflitos de horário.

## Janelas e navegação

As janelas usam largura máxima de 500px, cabeçalho e texto menores, campos compactos e bordas padronizadas. Mantêm rolagem interna, foco do teclado, fechamento acessível e camada acima da navegação. No Safari, os campos permanecem com 16px para evitar o zoom automático durante a digitação.

Revisados os cadastros e a edição de clientes, serviços, produtos, profissionais e pacotes; histórico do cliente; estoque; Agenda e bloqueios; Comandas e recebimento; lançamento e fechamento do Caixa. O painel do PC usa menu lateral com contraste corrigido e largura de conteúdo controlada.

## PC e iPhone

Painel administrativo: https://barbearia-machado-rose.vercel.app/admin

No PC, abra o link no navegador e use sua conta administrativa.

No iPhone, abra o mesmo link no Safari e escolha **Compartilhar → Adicionar à Tela de Início**. Quando aparecer, ative **Abrir como App da Web** e toque em **Adicionar**. O atalho abre Machado Gestão diretamente no painel, com ícone próprio. As instruções também aparecem no acesso e no Menu.

Esta entrega para iPhone é a versão web, com acesso autenticado e internet necessária. Não inclui um aplicativo nativo assinado para App Store/TestFlight. Essa distribuição precisa de compilação em ambiente Apple e assinatura da conta Apple Developer.

O Android continua com o acesso automático já configurado. Instale `Machado-Gestao-v1.19.4.apk` sobre a versão atual de produção; não é necessário desinstalar. O APK administrativo e as credenciais permanecem fora do GitHub.

## Verificações

- Build/TypeScript, lint e renderização das rotas com registros e vazias.
- Agenda com 2, 5 e 9 profissionais, navegação animada e movimento reduzido.
- Formulários em 390×844, 360×640, 390×360 e 1280×900.
- Revisão ampliada em PC, Android pequeno e WebKit com perfil de iPhone: calendário, ano bissexto, troca de semana e janelas administrativas.
- Fluxo navegador → API → Neon: agendamento, encaixe, bloqueio recorrente e agendamento público.
- Instalação assinada e navegação no emulador Android, incluindo teclado e rolagem nos formulários.

O teste WebKit verifica compatibilidade do navegador; a instalação pelo Safari ainda deve ser conferida em um iPhone físico. Depois, a homologação operacional é um dia de uso real na barbearia.
