# API Agente Machado — contrato 2.1

Runtime atual: Vercel / Neon, Better Auth na administração. Substitui a integração histórica em Supabase.

POST /api/agent, Authorization Bearer com token por integração. Corpo {action,payload}; sucesso {data}; erro {error:{code,message,requestId}}. Token define unidade/permissões. AGENT_ENABLED é a trava global, false por padrão. Proprietário gera, rotaciona ou revoga na tela. Valor exibido uma vez; banco guarda hash.

Ações: capabilities, settings, catalog, availability, prepare_booking, pending_booking, confirm_booking, opt_out, enqueue_campaigns, enqueue_reminders, claim_notification, ack_notification, delivery_update, heartbeat. Nenhuma ferramenta financeira.

Capabilities: contract_version=2, contract_revision="2.1", notification_content="claim_snapshot", timezone="America/Sao_Paulo", draft_ttl_seconds=900. Catálogo usa price em centavos. Availability devolve seis opções em 14 dias. Rascunhos não seguram horário. Confirmar exige nova mensagem explícita e revalida vaga; repetições retornam a mesma reserva.

Settings: controles independentes; confirmation_delay_minutes 0..60; reminder_offsets_minutes até dois inteiros únicos 60..10080, descendentes; birthday_send_hour dentro da janela; reactivation_days 30..180; message_templates com confirmation/reminder_1/reminder_2/birthday/reactivation, cada qual {text,revision}. Servidor controla revisões.

Claim: id,claim_token,kind,event_key,customer,appointment,reminder_index,message_text,settings_revision,template_revision. Bridge envia exatamente message_text, sem IA/fallback. Ack: id/claim_token/status sent|failed|uncertain; sent exige provider_message_id e significa aceite. Timeout ambíguo fica uncertain. Delivery_update exige event_id/provider_message_id/status/occurred_at reais; monotonia e reconciliação de callback anterior ao ack.

Rotas administrativas, prefixo /api/agent: GET/POST /settings com expected_revision; GET /status; GET /activity com page/status; GET/POST /contact-consent com phone/marketing_opt_in/evidence; POST /credentials/rotate e /credentials/revoke exclusivo proprietário. Owner/admin nas demais; unidade da sessão verificada.

Heartbeat por minuto: component bridge, instance_name, connection_state open|connecting|close|unknown, assistant_state/notifications_state active|paused|disabled, last_success_at, last_error_code. Recebimento com hora do servidor, stale após 3 minutos. Nenhuma chave OpenAI/Evolution no app.

Operação, validação, instalação e pendências em ENTREGA-1.20.0.md. Homologação conjunta real do canal é obrigatória antes de ativar envios.
