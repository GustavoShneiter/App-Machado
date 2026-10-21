# Operação integrada — versão 1.18

O procedimento atual está em [ENTREGA-1.18.md](ENTREGA-1.18.md), incluindo instalação, rotina diária, recuperação, cópias de segurança e homologação.

Agenda, Clientes, Comandas, Caixa, Produtos, Pacotes e Relatórios consultam o banco Neon por uma API autenticada hospedada na Vercel. As funções SQL preservam as transações operacionais do sistema. Os dados são atualizados após cada alteração, ao retornar à tela, ao reconectar e periodicamente com a página visível. O catálogo público fornece somente os campos necessários ao agendamento.

Não há dados demonstrativos no ambiente publicado. O Supabase foi mantido intacto como origem histórica da migração; o site e o APK 1.18 não dependem dele.
