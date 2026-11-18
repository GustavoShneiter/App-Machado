# Gestão 1.21.3 / Profissional 1.3.3

## Apresentação

- Profissional: foto e bloco nome/assinatura centralizados; as duas linhas ficam dentro da altura da foto.
- Personalização do Caixa: metas em linhas com valor ou situação destacados ao lado, mantendo a definição dos valores pela gestão.
- Menu profissional: Versão web alinhada como as demais opções.
- Gestão: seleção de profissionais centralizada e distribuída em linhas na Agenda; olho, Recebido hoje, valor e data centralizados no Caixa, com data abaixo do valor.
- Pacotes: ações com tamanhos iguais e abas Pacotes/Vendidos centralizadas.
- Agente de WhatsApp dentro do grupo principal de Menu, com ícone e seta iguais ao padrão das opções.

## Consulta do cliente pelo agente

Contrato 2.2 acrescenta customer_context. Consulta por telefone recebido do WhatsApp, limitada à unidade da integração: nome da barbearia, identificação do cliente, nascimento, observações e até cinco próximos agendamentos. Não altera cadastros e não expõe o caixa. Campos não preenchidos não são inventados; telefone com cadastros equivalentes ambíguos exige conferência humana.

A habilitação da permissão para a integração existente do Machado usa `scripts/enable-agent-customer-context.mjs --apply`, após publicação. Não rotaciona token nem altera controles/textos de mensagens. O bridge é tratado pelo projeto do agente, com coordenação do contrato em `API_AGENTE.md`.

## Validação

Fluxos visuais em 360px/390px/1440px, Chrome e WebKit móvel, com dados fictícios e respostas simuladas nas duas edições compiladas; capturas revisadas. Banco temporário descartável: cliente conhecido/desconhecido/ambíguo, campos do cadastro, telefone com DDI, permissão, pausa e isolamento por unidade, além dos testes existentes do agente. Nenhum cadastro de teste foi inserido na operação real. Compilação/análise de código e assinatura dos APKs verificadas. Defender local sem ameaças detectadas nos APKs completos; nenhum arquivo enviado para análise externa.

Não representa teste autenticado dos APKs em aparelho físico. Hashes e versões: `releases/android/manifest-1.21.3.json`.

Publicação verificada: /api/health respondeu Gestão 1.21.3 e Profissional 1.3.3; downloads públicos correspondem aos hashes e passaram pela verificação local. Permissão customer_context habilitada na integração ativa do Machado, preservando a revisão e o conteúdo da configuração de mensagens.
