# Central de acessos — Barbearia Machado

## Clientes

| Destino | Link |
|---|---|
| Landing page com Agendar e WhatsApp | [Barbearia Machado](https://barbearia-machado-rose.vercel.app/) |
| Escolher serviço e agendar diretamente | [Agendamento](https://barbearia-machado-rose.vercel.app/agendar/horarios) |
| WhatsApp da barbearia | [Abrir WhatsApp](https://wa.me/554588186553) |

## Administração

| Destino | Link |
|---|---|
| Painel web para PC | [Machado Gestão no computador](https://barbearia-machado-rose.vercel.app/admin) |
| Aplicativo web, mesma interface do Android | [Machado Gestão](https://barbearia-machado-rose.vercel.app/app) |
| Versão para iPhone pelo Safari | [Abrir no iPhone](https://barbearia-machado-rose.vercel.app/app) |
| Instruções de instalação no iPhone | [Adicionar à Tela de Início](https://barbearia-machado-rose.vercel.app/app/instalar) |

A edição administrativa web e a edição para iPhone usam o mesmo endereço. No iPhone, o Safari permite adicionar o ícone à Tela de Início. O Android administrativo 1.19.9 também usa login individual. [Baixar Machado Gestão](https://github.com/GustavoShneiter/App-Machado/releases/download/gestao-v1.19.9/Machado-Gestao-v1.19.9.apk).

## Profissionais

| Destino | Link único para toda a equipe |
|---|---|
| Web / iPhone | [Machado Profissional](https://barbearia-machado-rose.vercel.app/profissional) |
| Instalação no iPhone | [Adicionar à Tela de Início](https://barbearia-machado-rose.vercel.app/profissional/instalar) |

**Android profissional:** [baixar Machado Profissional 1.2.0](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.2.0/Machado-Profissional-v1.2.0.apk). É o mesmo APK para a equipe; cada profissional entra com a própria conta. A conta administrativa permanece no aplicativo Machado Gestão.

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
- [Release do Android profissional](https://github.com/GustavoShneiter/App-Machado/releases/tag/profissional-v1.2.0).

As edições têm navegação, sessões e pacotes distintos e compartilham o mesmo banco operacional para manter o trabalho sincronizado.

## Novas unidades e metas

**Criar conta** no Machado Gestão cadastra outra unidade isolada. Para acessar a atual, use sua conta existente. A administração define metas semanais em Profissionais ou Relatórios; o barbeiro acompanha e pode ocultar a visualização. [Guia desta atualização](ENTREGA-1.19.9.md).
