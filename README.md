# Machado Gestão

Gestão, agendamento e acompanhamento da equipe da Barbearia Machado. React/Vite, aplicativos Capacitor, API Node na Contabo, PostgreSQL 18, Better Auth e armazenamento persistente. Administração 1.21.6; Profissional 1.3.6.

- [Site e agendamento](https://app-machado.45-140-203-243.sslip.io/).
- [Administração no PC](https://app-machado.45-140-203-243.sslip.io/admin).
- [Administração web / iPhone, com a interface do Android](https://app-machado.45-140-203-243.sslip.io/app).
- [Profissionais web / iPhone](https://app-machado.45-140-203-243.sslip.io/profissional).
- [Central de links e downloads](docs/CENTRAL-DE-ACESSOS.md).
- [Migração, backups e operação](docs/MIGRACAO-CONTABO-2026-11-18.md).
- Agente WhatsApp: tempos, textos e automações em Menu → Agente WhatsApp. Integração por API restrita, com banco separado do agente.
- [Cadastro e isolamento das unidades](docs/UNIDADES-E-CADASTRO.md).

## Contas e unidades

O Machado Gestão usa e-mail e senha no Android e na web. A sessão permanece enquanto for válida. **Criar conta** abre outra unidade independente: clientes, profissionais, Agenda, Caixa, produtos, serviços, metas e backups próprios. O cadastro não concede acesso à Machado existente. Ao cadastrar, guarde os três códigos de recuperação exibidos uma única vez. A administração existente e seu histórico são preservados.

O responsável define o login dos barbeiros em **Menu → Profissionais**. Todos usam o mesmo aplicativo profissional e o mesmo endereço; cada login abre somente a própria agenda e as próprias comissões. Sessões administrativas e profissionais têm cookies separados. As senhas são armazenadas como hashes; não podem ser consultadas depois.

## Metas, relatórios e interface

Somente a administração define metas semanais de comissão, serviços e clientes, pelo perfil profissional ou por Relatórios. O barbeiro acompanha o progresso e pode ocultar a visualização, sem editar valores. Relatórios administrativos têm filtros de período e profissional, gráfico de participação, evolução diária e exportação CSV. O profissional vê apenas seus resultados.

O Caixa profissional destaca saldo, progresso, histórico semanal e extrato compacto, com detalhes em janelas. O visual claro e verde é compartilhado entre Android, web e iPhone. Para atualizar os dados, puxe a tela para baixo a partir do topo; o comando também fica acessível pelo teclado. Os links das versões web estão no Menu de cada edição.

## Desenvolvimento e verificações

Use Node.js 24, npm ci e um .env.local configurado a partir de .env.example. Credenciais de banco e Blob são exclusivas do servidor. Execute npm run dev:api e npm run dev. O Vite encaminha /api para a porta 3000.

npm run lint e npm run build verificam código, tipos, renderização e cálculos. Os scripts de unidades usam bancos descartáveis e credenciais privadas locais. Consulte o guia de entrega para os testes desta versão. Não execute scripts antigos de QA contra a produção sem revisar suas fixtures.

## Banco e backups

As migrações ficam em database/. A 011 adiciona unidades, políticas RLS, referências compostas e papel de execução sem BYPASSRLS; a012 torna as metas administradas pela gestão e identifica backups por unidade. Use npm run db:units -- --check para ensaiar sem persistir e --apply somente no processo de publicação documentado.

O backup exportado por um proprietário contém só a unidade dele, incluindo hashes das contas e códigos de recuperação, sem senhas em texto nem sessões ativas. Guarde-o em local privado. Na Contabo, o backup completo cifrado roda diariamente no servidor e tem uma cópia verificada neste computador quando ele está conectado. Veja o guia da migração para restauração e limites. Os arquivos supabase/ são históricos.

## Android e iPhone

Administração: npm run android:sync e android/gradlew.bat assembleRelease. Profissional: npm run android:professional. Assinatura local em android/keystore.properties, fora do Git. Os dois pacotes são separados e usam login individual; nenhum acesso administrativo é embutido. Alterações web exigem novo APK para os aparelhos instalados.

No iPhone, abra /app ou /profissional no Safari e use **Compartilhar → Adicionar à Tela de Início**. As edições web instaláveis exigem internet. O projeto nativo iOS existe e tem verificações de integração; a distribuição nativa via TestFlight/App Store exige Mac, Xcode e Apple Developer. A entrega disponível ao iPhone nesta etapa é a versão web instalável.
