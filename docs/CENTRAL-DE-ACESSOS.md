# Central de acessos — Barbearia Machado

## Clientes

| Destino | Link |
|---|---|
| Landing page com Agendar e WhatsApp | [Barbearia Machado](https://app-machado.45-140-203-243.sslip.io/) |
| Escolher serviço e agendar diretamente | [Agendamento](https://app-machado.45-140-203-243.sslip.io/agendar/horarios) |
| WhatsApp da barbearia | [Abrir WhatsApp](https://wa.me/554588186553) |

## Administração

| Destino | Link |
|---|---|
| Painel web para PC | [Machado Gestão no computador](https://app-machado.45-140-203-243.sslip.io/admin) |
| Aplicativo web, mesma interface do Android | [Machado Gestão](https://app-machado.45-140-203-243.sslip.io/app) |
| Versão para iPhone pelo Safari | [Abrir no iPhone](https://app-machado.45-140-203-243.sslip.io/app) |
| Instruções de instalação no iPhone | [Adicionar à Tela de Início](https://app-machado.45-140-203-243.sslip.io/app/instalar) |

A edição administrativa web e a edição para iPhone usam o mesmo endereço. No iPhone, o Safari permite adicionar o ícone à Tela de Início. O Android administrativo 1.21.6 também usa login individual. [Baixar Machado Gestão](https://github.com/GustavoShneiter/App-Machado/raw/refs/heads/main/releases/android/Machado-Gestao-v1.21.6.apk).

## Profissionais

| Destino | Link único para toda a equipe |
|---|---|
| Web / iPhone | [Machado Profissional](https://app-machado.45-140-203-243.sslip.io/profissional) |
| Instalação no iPhone | [Adicionar à Tela de Início](https://app-machado.45-140-203-243.sslip.io/profissional/instalar) |

**Android profissional:** [baixar Machado Profissional 1.3.7](https://github.com/GustavoShneiter/App-Machado/raw/refs/heads/main/releases/android/Machado-Profissional-v1.3.7.apk). É o mesmo APK para a equipe; cada profissional entra com a própria conta. A conta administrativa permanece no aplicativo Machado Gestão.

O login determina a agenda e as comissões exibidas. Não há site nem APK diferente para cada barbeiro. Endereços pessoais antigos redirecionam ao portal comum e respeitam a conta conectada.

No Machado Gestão, abra **Menu → Profissionais → Novo profissional** ou **Editar**. O administrador escolhe o **E-mail de login** e a **Senha de login** (pelo menos 12 caracteres). Na edição, use **Salvar acesso**; deixar a nova senha vazia mantém a atual. Use **Copiar acesso para o profissional** na confirmação para copiar os dados escolhidos. A senha não pode ser consultada depois; pode ser redefinida pelo administrador. A troca da senha ou do e-mail encerra as sessões anteriores. Profissionais inativos não acessam o sistema.

Os acessos existentes foram preservados. Senhas não são publicadas nesta central nem no repositório. No profissional, **Minha conta** mostra somente seu próprio e-mail e permite alterar sua senha.

No iPhone: **Safari → Compartilhar → Adicionar à Tela de Início**; habilite **Abrir como App da Web**, se aparecer. Os aplicativos precisam de internet.

## Código e versões

- [Identidade visual premium e verificações](VISUAL-PREMIUM.md).

- [Edição profissional](../apps/profissional/README.md).
- [Edição administrativa](../apps/administracao/README.md).
- [Novidades e configuração do profissional 1.1.0](PROFISSIONAL-1.1.0.md).
- [Histórico de verificações da versão 1.0.1](VERIFICACOES-PROFISSIONAIS-1.0.1.md).
- [Release do Android profissional](https://github.com/GustavoShneiter/App-Machado/tree/main/releases/android).

As edições têm navegação, sessões e pacotes distintos e compartilham o mesmo banco operacional para manter o trabalho sincronizado.

## Novas unidades e metas

**Criar conta** no Machado Gestão cadastra outra unidade isolada. Para acessar a atual, use sua conta existente. A administração define metas semanais em Profissionais ou Relatórios; o barbeiro acompanha e pode ocultar a visualização. [Guia desta atualização](ENTREGA-1.19.10.md).

## Servidor e backups

Servidor Contabo, banco da aplicação separado do agente e cópias cifradas. [Guia da migração](MIGRACAO-CONTABO-2026-11-18.md).
