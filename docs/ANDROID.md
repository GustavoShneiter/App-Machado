# Android — Machado Gestão

O aplicativo Android é nativo (Capacitor) e abre diretamente o painel administrativo. Ele usa o mesmo Supabase do site: um agendamento feito em `/agendar` aparece no app automaticamente.

## Fluxo de desenvolvimento

Após qualquer mudança no sistema, sincronize a versão Android:

```powershell
cd "E:\App Gestão Machado"
npm run android:sync
```

## Gerar o APK instalável

Este computador precisa ter o Android Studio e o Android SDK instalados. Depois:

1. Abra o Android Studio.
2. Escolha **Open** e selecione `E:\App Gestão Machado\android`.
3. Aguarde a sincronização do Gradle.
4. Para testar no celular: **Build → Build APK(s)**.
5. O APK de teste será criado em `android\app\build\outputs\apk\debug\app-debug.apk`.

Para Play Store, use **Build → Generate Signed Bundle / APK → Android App Bundle** e guarde a chave de assinatura em local seguro. O identificador do aplicativo é `com.barbeariamachado.gestao`.

## Comportamento

- Ao abrir o app, o destino é `/admin`, nunca o agendamento público.
- O login do proprietário continua obrigatório para o painel.
- A página pública de agendamento segue independente no site e não exige login.
- O app exige Android 7.0 ou superior (API 24).
