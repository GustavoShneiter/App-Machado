# Machado Gestão 1.19.10 — Administração

- [Web admin para PC](https://barbearia-machado-rose.vercel.app/admin).
- [Versão web / iPhone com a interface do Android](https://barbearia-machado-rose.vercel.app/app).
- [Android 1.19.10](https://github.com/GustavoShneiter/App-Machado/releases/download/gestao-v1.19.10/Machado-Gestao-v1.19.10.apk).
- [Guia da atualização](../../docs/ENTREGA-1.19.10.md).

Mantém Caixa, Comandas, Agenda, Clientes e Menu. Conta administrativa com e-mail e senha em todas as edições. Criar conta cadastra uma nova unidade independente; não acrescenta um administrador à unidade atual. Guarde os códigos de recuperação do cadastro.

Em **Menu → Profissionais**, o responsável define e-mail/senha dos barbeiros e as metas semanais. Deixar a senha vazia na edição preserva a atual. Alterá-la revoga as sessões anteriores; inativar o profissional bloqueia seu acesso. As metas também podem ser definidas em Relatórios, que reúne filtros, gráficos, comissões e CSV.

No Menu aparecem **Versão web admin** e **Versão web**, nesta ordem. Para atualizar dados, puxe para baixo a partir do topo. O aplicativo usa o mesmo visual verde musgo da web e dos profissionais.

Android: identificador com.barbeariamachado.gestao, código 30. Login individual, sem conta administrativa fixa no pacote. Assinatura igual à distribuição anterior. Fontes principais em src/AdminApp.tsx, src/OperationalPages.tsx, src/ManagementPages.tsx e src/reports/. [Isolamento das unidades](../../docs/UNIDADES-E-CADASTRO.md).
