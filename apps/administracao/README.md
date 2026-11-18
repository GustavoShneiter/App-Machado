# Machado Gestão 1.21.6 — Administração

- [Web admin para PC](https://app-machado.45-140-203-243.sslip.io/admin).
- [Versão web / iPhone com a interface do Android](https://app-machado.45-140-203-243.sslip.io/app).
- [Android 1.21.6](https://raw.githubusercontent.com/GustavoShneiter/App-Machado/main/releases/android/Machado-Gestao-v1.21.6.apk). Novos APKs assinados, verificados localmente no Defender sem ameaças detectadas. As versões anteriores Gestão 1.21.0 e Profissional 1.3.0 continuam suspensas..
- [Guia da atualização](../../docs/ENTREGA-1.19.10.md).

Mantém Caixa, Comandas, Agenda, Clientes e Menu. Conta administrativa com e-mail e senha em todas as edições. Criar conta cadastra uma nova unidade independente; não acrescenta um administrador à unidade atual. Guarde os códigos de recuperação do cadastro.

Em **Menu → Profissionais**, o responsável define e-mail/senha dos barbeiros e as metas semanais. Deixar a senha vazia na edição preserva a atual. Alterá-la revoga as sessões anteriores; inativar o profissional bloqueia seu acesso. As metas também podem ser definidas em Relatórios, que reúne filtros, gráficos, comissões e CSV.

No Menu aparecem **Versão web admin** e **Versão web**, nesta ordem. Para atualizar dados, puxe para baixo a partir do topo. O aplicativo usa o mesmo visual verde musgo da web e dos profissionais.

Android: identificador com.barbeariamachado.gestao, código 30. Login individual, sem conta administrativa fixa no pacote. Assinatura igual à distribuição anterior. Fontes principais em src/AdminApp.tsx, src/OperationalPages.tsx, src/ManagementPages.tsx e src/reports/. [Isolamento das unidades](../../docs/UNIDADES-E-CADASTRO.md).
