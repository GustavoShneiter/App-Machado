# Machado Gestão para iPhone — base 1.19.4

Projeto iOS nativo do aplicativo já utilizado no Android, com Agenda, Caixa, Comandas, Clientes, Menu, comissões, cadastros, fotos e exportação/compartilhamento. Usa a mesma API publicada na Vercel e o mesmo Neon; não existe migração nem cópia separada de dados.

- Nome: **Machado Gestão**.
- Identificador: `com.barbeariamachado.gestao`.
- Versão: **1.19.4**, build **25**.
- Plataformas: iPhone e iPad com iOS/iPadOS 15 ou mais recente.
- Projeto: `ios/App/App.xcodeproj`, esquema compartilhado **App**.
- Dependências: Node.js 24, Capacitor iOS 8.5.2, Swift Package Manager e Xcode 26 ou mais recente.

## O que está preparado

As telas e as regras de negócio são as mesmas da 1.19.4. O plugin Swift `ManagedAccess` fornece ao aplicativo o acesso administrativo privado configurado na entrega. O controlador nativo registra esse plugin antes de carregar o aplicativo, incluindo o caminho de inicialização por cenas do iOS. O login do site permanece separado.

O projeto inclui ícone de 1024px sem transparência, tela de abertura da Machado, orientação para iPhone/iPad, uso das áreas seguras da tela, textos de permissão para câmera/fotos e manifesto do motivo de acesso a arquivos usado pelo compartilhamento. As fotos são escolhidas pelo seletor do sistema; os arquivos de exportação e backup usam a folha de compartilhamento do iOS.

O conteúdo do aplicativo é incorporado ao pacote, e a conexão ao sistema ocorre por HTTPS. A Agenda e as alterações de dados precisam de internet.

## Abrir o pacote privado no Mac

1. Extraia `Machado-iPhone-1.19.4-Projeto-Xcode-PRIVADO.zip` no Mac.
2. Na pasta extraída, instale as dependências com `npm ci`.
3. Execute `npm run ios:open`. Esse comando valida o acesso privado, gera o aplicativo, sincroniza os recursos e abre o projeto no Xcode.
4. No alvo **App → Signing & Capabilities**, escolha sua equipe Apple e mantenha **Automatically manage signing** ativado.
5. Conecte o iPhone, selecione-o no Xcode e execute o aplicativo. Conclua as autorizações solicitadas no aparelho.

O pacote privado já contém o recurso necessário ao acesso automático. Não contém credenciais de banco, arquivos `.env.local` nem a chave de assinatura Android. Guarde esse pacote com os responsáveis pela barbearia, pois o acesso administrativo do aplicativo acompanha a distribuição.

Ao obter somente o código do GitHub, o recurso privado não acompanha o repositório. Nesse caso, configure localmente o acesso da distribuição antes de usar `npm run ios:prepare-access`. Não coloque credenciais no código nem em mensagens, logs ou artefatos públicos.

## TestFlight e arquivo instalável

Para distribuir à equipe pelo TestFlight, é necessário vincular o projeto a uma conta Apple Developer ativa, registrar o aplicativo no App Store Connect e assinar o build.

No Xcode, selecione um destino de dispositivo iOS, use **Product → Archive**, valide pelo Organizer e use **Distribute App → App Store Connect**. Convide a equipe pelo TestFlight. Para gerar um arquivo local de distribuição, use a opção de exportação correspondente ao perfil de assinatura disponível.

Como alternativa ao menu Archive, configure a variável local `APPLE_TEAM_ID` com o identificador de dez caracteres da sua equipe e execute `npm run ios:archive`. O resultado fica em `ios/App/output/Machado-Gestao.xcarchive`. Esse comando só funciona no macOS e exige o acesso privado real. A compilação de verificação sem acesso é recusada durante o arquivamento.

Esta distribuição com entrada automática foi preparada para a equipe autorizada da Machado. Uma publicação aberta para outras empresas ou clientes requer um fluxo de autorização próprio. O workflow público não recebe o acesso privado e não produz uma distribuição da barbearia.

## Verificação

- `npm run ios:sync`: build das telas, sincronização dos plugins e verificação do projeto.
- `npm run ios:check`: versão, ligação dos arquivos Swift, controlador de inicialização, ícones, recursos, permissões e exclusão das credenciais do Git/site.
- `node scripts/test-ios-api.mjs`: valida a origem `capacitor://localhost`, autenticação, sessão e leitura da Agenda no backend publicado, encerrando apenas a sessão criada pelo teste.
- Workflow GitHub **Verificar iPhone**: compilações no Xcode para simulador e iPhone sem assinatura, usando uma configuração sem acesso. Não usa segredos nem altera dados da barbearia.

A assinatura, a instalação no iPhone físico, as fotos/câmera e o compartilhamento no aparelho devem ser conferidos antes da entrega operacional. A compilação sem assinatura não é um `.ipa` instalável, e a versão web no Safari continua disponível em https://barbearia-machado-rose.vercel.app/admin.

Referências oficiais: [Capacitor iOS](https://capacitorjs.com/docs/ios), [ambiente Xcode](https://capacitorjs.com/docs/getting-started/environment-setup), [Apple Developer](https://developer.apple.com/programs/enroll/) e [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
