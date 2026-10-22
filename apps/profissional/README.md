# Machado Profissional 1.0.1

Aplicativo da equipe, separado do **Machado Gestão** administrativo.

- Web e iPhone: [abrir Machado Profissional](https://barbearia-machado-rose.vercel.app/profissional).
- Android: [baixar o APK profissional](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.0.1/Machado-Profissional-v1.0.1.apk).
- [Central de acessos](../../docs/CENTRAL-DE-ACESSOS.md).

O APK é o mesmo para todos os barbeiros. A conta individual determina qual agenda e quais comissões aparecem. O identificador Android `com.barbeariamachado.profissional` permite instalar junto do administrador. Nenhuma credencial administrativa está embutida neste APK.

## Duas seções

**Minha Agenda:** visualizar a própria agenda, marcar cliente, criar encaixe, confirmar chegada/atendimento/conclusão, cancelar atendimento ainda aberto, bloquear horários, dias, semanas e meses e criar/remover recorrências. Os horários seguem a base administrativa: 06h–23h, de 40 em 40 minutos. Encaixes permitem horário e duração próprios, respeitando ocupações e bloqueios.

**Meu Caixa:** somente comissões do profissional em serviços e produtos; saldo total a receber, comissões geradas e repassadas, histórico desta semana, passada e retrasada, intervalo personalizado, serviços realizados e clientes distintos. Metas semanais de comissão, serviços e clientes, estimativa de serviços para atingir a meta e escolha dos indicadores. Preferências persistidas por perfil.

Concluir um atendimento gera a comanda e a comissão no fluxo existente. Recebimento de clientes, repasse de comissões e alterações financeiras continuam na administração. Atendimentos já encerrados não podem ser apagados pelo profissional.

## Conta e instalação

O administrador escolhe o e-mail e a senha no cadastro do profissional, com confirmação da senha. A senha aparece somente na confirmação do cadastro; o servidor conserva apenas seu hash. Em **Editar profissional → Login do profissional**, a administração consulta e muda o e-mail e define uma nova senha usando **Salvar acesso**. Deixar a senha vazia preserva a atual. Alterar o e-mail ou a senha revoga as sessões anteriores. Desativar o profissional impede seu acesso. E-mails de login são únicos sem diferenciar maiúsculas e minúsculas.

Todos usam `/profissional` e o mesmo APK. O login determina o perfil; links pessoais antigos redirecionam ao portal comum. **Minha conta** mostra somente o e-mail conectado. No iPhone, abra o portal no Safari e use **Compartilhar → Adicionar à Tela de Início**. Se exibido, habilite **Abrir como App da Web**. Entre com a conta individual. É a edição web instalável; requer internet e dispensa Apple Developer.

## Organização técnica

| Parte | Local |
|---|---|
| Interface profissional | `src/professional/` |
| Autorização, extrato e contas | `server/professionals.mjs` |
| Autenticação separada | `/api/professional-auth/*`, cookie `machado-professional` |
| API limitada ao perfil | `/api/professional/*` |
| Provisionamento administrativo | `/api/professional-accounts` |
| Regras de agenda e preferências | `database/008_professional_workspace.sql` |
| Manifesto comum do iPhone | `/professional.webmanifest` |
| Metadados da edição | `apps/profissional/app.json` |

O banco operacional é compartilhado para refletir imediatamente os agendamentos no painel da barbearia. A aplicação, a navegação, as sessões, as permissões e o pacote Android são separados. A API verifica o perfil em toda requisição e não retorna faturamento, caixa físico, pagamentos ou comissões alheias no extrato profissional. O catálogo do agendamento público continua público.

## Compilar e verificar

Na raiz do repositório, com as dependências instaladas:

```text
npm run db:professionals -- --check
npm run db:professionals
node --env-file=.env.local scripts/migrate-professional-login.mjs
npm run build:professional
npm run android:professional
npm run test:professional-api
npm run test:professional-browser
node --env-file=.env.local scripts/test-professional-admin-login.mjs
```

Os testes de API usam uma conta temporária de QA e excluem os registros criados ao terminar. O teste de navegador usa login e agenda reais de leitura; valores determinísticos de Caixa são substituídos somente no navegador de teste para conferir metas e layout, sem alterar comissões ou preferências reais. O `--check` da migração executa e reverte os testes SQL sem alterar o histórico.

O build Android profissional usa `dist-professional/` e `-PmachadoProfessional=true`. O script restaura os arquivos administrativos após empacotar. A chave de assinatura é local e ignorada pelo Git. Senhas de entrega permanecem em `.private/`, nunca em commits ou Releases.
