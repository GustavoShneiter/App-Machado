# API do agente externo

Esta integração deve ser implementada como Supabase Edge Function. Ela não expõe banco, painel, caixa, relatórios, comissões, credenciais de usuários nem a `service_role`.

## Autenticação

Envie um token exclusivo no cabeçalho:

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

O token é validado no servidor por hash, e cada requisição deve ser limitada por integração (sugestão: 30 requisições por minuto). Grave toda chamada em `audit_logs`, sem armazenar telefone completo ou token em texto puro no log.

## Operações permitidas

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/agent/services` | Lista serviços ativos. |
| `GET` | `/agent/professionals` | Lista profissionais ativos. |
| `GET` | `/agent/customers?phone=...` | Localiza cliente pelo telefone. |
| `PUT` | `/agent/customers` | Cria ou atualiza nome e telefone. |
| `POST` | `/agent/appointments` | Cria um agendamento. |

As rotas de disponibilidade, consulta individual, reagendamento e cancelamento ficam previstas no contrato, mas não são expostas pela Edge Function inicial até que a validação de janelas de trabalho e bloqueios de agenda esteja conectada ao schema. Isso evita publicar uma disponibilidade incompleta como se fosse definitiva.

## Exemplo: criar agendamento

```json
POST /agent/appointments
{
  "customer": { "name": "Rafael Lima", "phone": "11988442277" },
  "service_id": "uuid",
  "professional_id": "uuid",
  "starts_at": "2026-09-17T14:00:00-03:00",
  "notes": "Cliente veio pelo Instagram"
}
```

Resposta `201`:

```json
{ "id": "uuid", "status": "scheduled", "starts_at": "2026-09-17T14:00:00-03:00" }
```

Erros: `400` para payload inválido; `401` token ausente/inválido; `409` horário ocupado; `429` limite atingido; `500` erro não esperado. A criação precisa chamar uma função transacional que detecta sobreposição para o mesmo profissional e grava o log de auditoria.
