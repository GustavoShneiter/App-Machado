# Machado Gestão 1.20.0 — Agente WhatsApp

Contrato 2.1: API autenticada por integração/unidade, hash de credencial e revogação; configurações versionadas; fila persistida; rascunho idempotente de 15 minutos; confirmação transacional; dois lembretes; aniversário/retorno autorizados; heartbeat e evidências de entrega.

Menu → Agente WhatsApp. Mesmos controles no Android, /app e /admin. Configurações começam desligadas. A trava AGENT_ENABLED precisa ser true no servidor após homologação conjunta.

Confirmação: 0 a 60 minutos. Lembretes: dois prazos distintos de 60 a 10.080 minutos, em ordem decrescente, texto por slot. Aniversário dentro da janela de campanhas. Retorno de 30 a 180 dias. Textos com variáveis permitidas, prévia/restauração e rodapé SAIR em campanhas. Em Clientes → editar → Mensagens pelo WhatsApp, registrar autorização e evidência.

Atendimento e notificações têm controles independentes. Claims em andamento podem concluir com a configuração anterior. Alterações não repetem terminais/uncertain nem revivem eventos expirados. Reconciliação de uncertain exige conferir o provedor; não há reenvio cego.

## Publicação

1. npm run test:agent cria/apaga banco QA separado com todas as migrações.
2. npm run db:agent -- --check ensaia e desfaz, conferindo integridade do histórico.
3. npm run db:agent -- --apply guarda backup privado .private/pre-agent-backup.json antes de migrar. Não publicar o backup. Nenhum aviso retroativo é criado.
4. Publicar backend/frontend com integração desligada.
5. Proprietário gera token e configura privadamente no bridge.
6. Contabo/Evolution/QR, capabilities, heartbeat e testes conjuntos antes de ativar rotinas.

Reversão: desligar AGENT_ENABLED e controles, preservar fila/reservas e conferir uncertain. Esquema ampliado é compatível com o app anterior. Nunca apagar/recriar reservas para corrigir envio.

## Validação e pendências

PostgreSQL QA completo: isolamento, conflitos de configuração, snapshot, callback antes do ack, repetição, revisão/cancelamento, consentimento, rascunho/confirmação idempotentes, lembretes e ausência de pagamento/comissão liberada indevida. UI com respostas simuladas em 390/768/1440px: sete seções, salvar atraso e prévia, sem overflow/erros. Lint, build e regressão administrativa.

Falta homologar n8n/Evolution/Contabo reais, concorrência de rede entre canais e mapear delivered/read na versão instalada. Estados só aparecem após evidência real. Heartbeat fica sem sinal após 3 minutos. Testes simulados não comprovam conexão WhatsApp.

Token não é criado automaticamente. Novos clientes permanecem sem autorização de campanha até registro explícito.
