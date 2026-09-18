# Barbearia Machado

Painel responsivo e página pública de agendamento para a Barbearia Machado. Esta primeira entrega prioriza o fluxo diário e funciona localmente com dados demonstrativos persistidos no navegador.

## Executar localmente

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite. A página pública está em `/agendar` e a política de privacidade em `/privacidade`.

## O que está funcional nesta versão

- Painel responsivo com navegação para dashboard, agenda, clientes, comandas, caixa, produtos, serviços, profissionais, comissões, relatórios e configurações.
- Cadastro de agendamento pelo painel com validação de campos e bloqueio de horário já ocupado no demonstrador local.
- Fluxo público de agendamento em quatro etapas, com escolha de serviço, profissional, horário e dados do cliente.
- Agendamentos feitos na página pública aparecem imediatamente na agenda e geram notificação interna enquanto a aplicação estiver aberta.
- Dados de demonstração para Machado, Gustavo Araújo (40% de comissão), serviços, clientes, estoque, caixa e a regra de aceitação de cinco cortes: R$ 150,00 bruto, R$ 60,00 de comissão e R$ 90,00 líquido.
- Manifesto, ícone e service worker básico para instalação como PWA.

## Conectar ao Supabase

1. Crie um projeto Supabase e copie `.env.example` para `.env.local`.
2. Execute as migrations em `supabase/migrations` usando a CLI do Supabase ou o SQL Editor.
3. Crie os usuários de demonstração no Supabase Auth e associe cada um a um perfil (`owner`, `admin` ou `professional`).
4. Configure as Edge Functions e segredos do agente conforme `docs/API_AGENTE.md`.

Não coloque `service_role`, tokens do agente ou qualquer segredo no frontend.

## Limites conhecidos desta entrega

O aplicativo usa um repositório local demonstrativo até que as variáveis do Supabase sejam fornecidas. Por isso, autenticação real, RLS em execução, sincronização entre dispositivos, caixa definitivo, baixa de estoque e Edge Functions ainda dependem da conexão Supabase. O schema e a documentação de integração foram preparados para essa ligação, sem inventar credenciais.

## Validação

O build de produção foi executado com sucesso através de `npm run build`.
