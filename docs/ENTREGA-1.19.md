# Machado Gestão 1.19 — acesso automático no Android

O APK da barbearia abre diretamente a gestão, inclusive na primeira instalação. Não há campos de e-mail ou senha, recuperação de senha ou botão de sair no Android. Sessões expiradas são renovadas automaticamente. Sem internet, o app apresenta um botão para tentar novamente.

O site continua uma distribuição separada: https://barbearia-machado-rose.vercel.app. O painel no navegador continua exigindo uma conta autorizada. Banco Neon e API Vercel continuam compartilhados.

## Instalação

Instale `Machado-Gestao-v1.19.apk` sobre a versão 1.18 de produção. O identificador do app e a chave de assinatura foram mantidos; o versionCode é 20. Versões antigas assinadas com chave de depuração precisam ser desinstaladas antes. As informações da barbearia ficam no servidor.

## Distribuição privada

Quem possui o APK pode acessar a gestão. Distribua-o apenas às pessoas autorizadas. Esta distribuição utiliza uma conta administrativa própria, identificada como “Aplicativo da barbearia”; não incorpora a senha pessoal do proprietário. As ações dessa conta têm identificação compartilhada no histórico, sem identificar qual funcionário usou cada aparelho.

Para revogar o acesso de todos os aparelhos desta distribuição, desative o registro correspondente em `profiles` (`active=false`). As APIs conferem esse estado a cada operação. Após revogação, o app não consegue ler ou alterar dados, mesmo que uma sessão ainda exista. Alterar apenas a senha impede novas sessões, mas as existentes também precisam ser revogadas.

A credencial de distribuição está nos arquivos privados `.private/native-access.json` e `android/native-access.properties`. Ela faz parte do APK e pode ser extraída de um pacote distribuído. Não coloque esses arquivos em repositórios, hospedagem pública ou no pacote público de código-fonte. O site e seus arquivos JavaScript não incluem essa credencial.

## Compilação

Execute `npm run android:prepare-access`, `npm run android:sync` e `android/gradlew.bat assembleRelease`, usando o Java do Android Studio e a chave de produção existente. A preparação de acesso é idempotente: não reativa contas nem troca senhas revogadas. Preserve os arquivos privados para atualizações futuras.

Valide com `node --env-file=.env.local scripts/test-android.mjs`: atualização, primeira abertura com armazenamento local vazio, reabertura, sessão expirada e recuperação da conexão. O teste usa somente o emulador e a sessão criada por ele.

As rotinas operacionais e a homologação na barbearia seguem [ENTREGA-1.18.md](ENTREGA-1.18.md). Backups e exclusão total da operação permanecem restritos à conta do proprietário no painel web.
