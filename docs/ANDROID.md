# Android — Machado Gestão base 1.19 ajustada

O APK abre o painel administrativo e utiliza a API publicada na Vercel, o mesmo banco Neon do site, Better Auth e Vercel Blob. O site de agendamento é uma distribuição separada.

Prepare o acesso privado com `npm run android:prepare-access`, gere os arquivos web e sincronize o Android com `npm run android:sync`. Configure a chave privada de produção em `android/keystore.properties` e execute `android/gradlew.bat assembleRelease` usando o Java do Android Studio. O APK é gerado em `android/app/build/outputs/apk/release/app-release.apk`.

O identificador continua `com.barbeariamachado.gestao`. A base 1.19 ajustada usa `versionName 1.19.1` e `versionCode 22`, requer Android 7.0/API 24 e conecta por HTTPS. Pode atualizar aparelhos com 1.19 ou 1.20 de produção. O build de produção não usa a chave de depuração. Versões antigas de depuração precisam ser desinstaladas antes da instalação inicial da versão assinada. As próximas versões de produção devem manter a mesma chave.

O botão de voltar fecha as camadas abertas e retorna à navegação. O acesso à gestão é automático, sem tela de login, usando uma conta própria da distribuição privada do APK. O site continua exigindo autenticação no painel. O link público copiado no menu utiliza o endereço do site, e arquivos CSV usam o compartilhamento nativo do Android. Não há gravação de operações sem internet.

O app usa a tela inicial e a navegação inferior da base 1.19. A seção selecionada recebe um fundo verde animado e os profissionais da Agenda ficam centralizados. Não publique arquivos de assinatura, credenciais de acesso nem o APK em canais abertos. Os arquivos de entrega e as instruções de uso estão descritos em [ENTREGA-1.19-AJUSTADA.md](ENTREGA-1.19-AJUSTADA.md).
