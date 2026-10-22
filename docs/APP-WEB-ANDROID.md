# Machado Gestão Web — interface do Android 1.19.4

Aplicativo web: https://barbearia-machado-rose.vercel.app/app

Instruções para adicionar ao iPhone: https://barbearia-machado-rose.vercel.app/app/instalar

O modo aplicativo usa as mesmas telas, componentes e estilos do APK Android 1.19.4: Caixa, Comandas, Agenda, Clientes e Menu, com navegação inferior, destaque verde animado, profissionais centralizados e janelas compactas. O Menu segue a mesma organização do aplicativo Android. O painel administrativo para PC continua em `/admin`, e o site público de agendamento permanece no endereço principal.

## Usar no iPhone

1. Abra o link do aplicativo no Safari.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Quando aparecer, ative **Abrir como App da Web** e confirme em **Adicionar**.
4. Abra pelo ícone **Machado Gestão** e entre com sua conta administrativa no primeiro acesso.

A sessão é lembrada enquanto estiver válida. Se expirar ou for encerrada, será necessário entrar novamente. O modo web não inclui a credencial administrativa do APK nos arquivos públicos. A autorização continua sendo verificada pela API.

O aplicativo precisa de internet para consultar e salvar. A instalação pelo Safari não exige Apple Developer nem assinatura de IPA. As funções usam os mesmos dados da barbearia no Neon.

## Verificação

- O CSS incorporado ao APK Android 1.19.4 foi comparado ao build web: todo o conteúdo original foi preservado; os estilos adicionais são exclusivos das instruções de instalação.
- Fluxo `/app → acesso → cinco seções → calendário e formulários`, com dados reais de leitura e uma conta temporária de teste.
- Chromium em tela de celular e WebKit com perfil de iPhone: navegação inferior, animação verde, janelas, Menu do aplicativo, retorno de subpáginas e sessão ao reabrir.
- As rotas internas continuam no prefixo `/app`; recuperação de acesso e instruções de instalação também ficam no mesmo escopo.
- Manifesto próprio com abertura em `/app/admin`, ícones e apresentação independente do navegador.
- Painel `/admin` e agendamento público verificados separadamente.

O APK Android não foi substituído nesta entrega. A versão web usa a interface dessa base, sem exigir uma atualização no Android.
