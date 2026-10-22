# Machado — atualização visual

Administração **1.19.7** (Android 28) e Profissional **1.1.1** (Android 4).

A mesma identidade aparece nos dois APKs, no administrativo para PC e nos aplicativos web para iPhone: carvão, dourado suave e couro, títulos em Space Grotesk, superfícies com transparência e bordas discretas. A fonte é servida localmente, com sua licença em `public/fonts/`.

O Caixa administrativo organiza saldo, rendimento e gráfico em uma composição assimétrica no PC. No celular, os destaques se empilham. O profissional mantém saldo, metas animadas, indicadores, histórico de comissões e Menu com perfil. A navegação mantém suas seções e recebe destaque dourado animado, resposta ao toque e foco visível. As janelas usam a mesma escala e superfícies do restante da interface.

## Agenda

A apresentação administrativa passa de 1.836 para 1.122 pixels de altura nos navegadores com suporte a CSS `zoom`, como nas verificações em Chromium e WebKit. A grade profissional já usa 1.122 pixels. Permanecem os 26 intervalos de 40 minutos, das 06h às 23h. Em navegadores sem suporte a `zoom`, a apresentação administrativa mantém a altura anterior.

O ajuste ocorre no CSS. Cálculos, posições geradas, horários, bloqueios, ocupação e callbacks permanecem os mesmos. Eventos mantêm suas cores de situação e a janela de detalhes. As fotos e os nomes dos profissionais continuam centralizados, inclusive em várias linhas.

## Escopo preservado

Nenhum componente React, estado, hook, rota, callback, regra financeira, autenticação, chamada de API ou estrutura de banco foi alterado. Os únicos ajustes fora dos estilos e recursos visuais são metadados de versão/empacotamento, cores de abertura/instalação e a configuração visual das prévias de teste. A página pública de clientes mantém seu layout.

## Verificação

- Build de produção, TypeScript e ESLint.
- Renderização das 12 rotas administrativas com e sem registros, além das verificações financeiras e de calendário existentes.
- Navegação e centralização com 2, 5 e 9 profissionais; respeito à preferência de movimento reduzido.
- Edição/criação de clientes, produtos, serviços, profissionais e pacotes, incluindo telas pequenas e orientação horizontal.
- Administrativo em Chromium para PC/celular e WebKit para iPhone; calendário, bloqueios, Caixa, Comandas, estoque, comissões e popups.
- Profissional nos mesmos três cenários: login individual, Agenda completa, Caixa, metas animadas, ocultar/remover metas, Menu e foto. Preferências e valores usados na revisão visual são interceptados apenas no navegador de teste.
- APKs instalados em emulador Android: administração com cinco seções e editor de acesso; profissional com login individual, três seções, Caixa, Menu, popup de foto, botão Voltar e sessão preservada. Assinaturas verificadas; APK profissional inspecionado para confirmar ausência das credenciais administrativas.
- Conferência de 50 arquivos funcionais: conteúdo preservado, exceto os números de versão exibidos em `runtime.ts` e nos metadados de saúde/status do servidor.

As verificações de WebKit simulam o navegador do iPhone; não substituem o teste no aparelho físico. Para iPhone, a entrega continua como aplicativo web instalado pelo Safari.

## Acessos e instalação

- [Administração para PC](https://barbearia-machado-rose.vercel.app/admin).
- [Administração web / iPhone](https://barbearia-machado-rose.vercel.app/app).
- [Profissionais web / iPhone](https://barbearia-machado-rose.vercel.app/profissional).
- [Android profissional 1.1.1](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.1.1/Machado-Profissional-v1.1.1.apk).

O APK administrativo é entregue privadamente em `entrega/Administracao/Machado-Gestao-v1.19.7.apk`. Ambos conservam suas identidades de pacote e a assinatura de produção para atualização sobre as versões anteriores.

No iPhone: Safari → Compartilhar → Adicionar à Tela de Início. A navegação e as contas continuam as mesmas.
