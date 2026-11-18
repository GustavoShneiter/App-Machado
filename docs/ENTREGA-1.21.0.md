# Gestão 1.21.0 / Profissional 1.3.0

Design autorizado em 18/11/2026 a partir das referências aprovadas em 17/11. Início permanece no centro da navegação inferior das duas edições.

- Gestão: Agenda / Caixa / Início / Clientes / Menu.
- Profissional: Agenda / Caixa / Início / Relatórios / Menu. A sessão continua limitando agenda, comissões e metas ao próprio profissional.
- PC mantém painel lateral e composição em colunas. iPhone usa as versões web/PWA; não é um novo IPA nem uma publicação na App Store.
- Caixa separa Hoje, Extrato e Repasses, recebimentos, pendências e dinheiro físico. Filtros e ações usam os registros existentes, mantendo as regras financeiras.
- Relatórios alternam Faturamento, Recebido e Resultado; período/profissional, exportação CSV, metas e consulta dos atendimentos preservados.
- Agenda começa em lista; grade de 40 minutos continua disponível. Datas, busca, profissionais e bloqueios continuam operacionais. Formulários abrem em painéis com rolagem e foco.
- Manrope entregue em pesos estáticos para consistência de renderização no WebKit; fonte variável original e licença preservadas.

## Backend compatível

O hotfix `eb52aea` de disponibilidade real e preferência de horário foi preservado. A migração `014_appointment_attendee.sql` adiciona o nome da pessoa atendida à reserva: dois nomes podem compartilhar o telefone do responsável sem renomear o cadastro. Agendas administrativas e profissionais mostram esse nome, com fallback para os registros anteriores. Nenhuma regra de comissão, pagamento ou repasse foi alterada. Controles, credenciais e piloto do WhatsApp não foram modificados.

## Verificação

- Build e renderização de todas as seções com dados e vazias; regressões de dinheiro/Pix, comissões, relatórios, pacotes e calendário.
- Matriz visual/interativa de 360, 390, 768 e 1440px, incluindo WebKit: navegação central, busca, filtros, grade, formulários e fluxos de recebimento/repasse; sem escrita de produção durante os testes visuais.
- API do agente em banco temporário isolado: disponibilidade, preferência/período, conflitos, bloqueios, autenticação, isolamento e dependente com o telefone do responsável.
- Migração 014 ensaiada com rollback, backup privado dos registros afetados e comparação de integridade antes da aplicação.
- Revisão visual independente: correções materiais solicitadas resolvidas nas capturas de navegador. Não equivale a certificar todo fluxo em aparelho físico.

## Arquivos

APKs assinados em `releases/android/`; versões, pacotes, tamanhos e SHA-256 em `manifest-1.21.0.json`. Android exige instalar a atualização. Web/PC/iPhone recebem o design após a publicação. É necessário ter internet.

Fontes normativas: `DESIGN.md` e `.impeccable/design.json`. As imagens de protótipo continuam como referências preservadas; números ilustrativos não foram incorporados ao aplicativo.
