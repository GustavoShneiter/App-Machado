# Unidades e planilhas Machado

Cada cadastro de proprietário cria uma unidade independente. O e-mail do login identifica a conta vinculada à unidade; profissionais cadastrados por ela continuam pertencendo à mesma equipe.

Agenda, clientes, atendimentos, comissões, caixa, relatórios, produtos, perfis, configurações e histórico do agente são limitados à unidade da sessão autenticada. Relações no banco usam a unidade e o identificador do registro. A troca de conta limpa a interface, descarta respostas antigas e impede que formulários de outra sessão gravem na nova conta.

## Google Drive por unidade

No primeiro acesso administrativo, o sistema prepara uma solicitação anual se ainda não existir planilha para aquele ano. O proprietário autoriza o Google uma vez usando o mesmo Gmail do cadastro. O instalador cria o arquivo no Drive desse usuário, sem copiar histórico ou preços de outra unidade. O arquivo é reutilizado nas próximas entradas; cada ano tem sua própria conexão.

A integração não usa a senha Google do aplicativo. O Google pede autorização individual para planilhas, identificação da conta, conexão ao servidor e sincronização agendada. O instalador deve executar como **Usuário com acesso ao app da Web**, nunca como o desenvolvedor. Credenciais e cache usam UserProperties, isoladas por usuário Google e por unidade. O servidor confirma o e-mail com o Google e mantém chaves de sincronização separadas por unidade e ano.

As planilhas já conectadas de 2026 e 2027 não são recriadas. Meses anteriores e alterações manuais continuam preservados. Um mesmo arquivo Google não pode ser conectado a duas unidades ou anos.

## Operação

- Cada unidade de WhatsApp precisa de sua própria credencial e instância/número configurado no agente. Uma unidade nova começa sem respostas ou campanhas ativas.
- Autorizações de planilha usam links de 20 minutos, consumidos uma única vez. A criação anual é idempotente. Credenciais recuperáveis de jobs são criptografadas no banco e as chaves de leitura ficam vinculadas ao arquivo e ao ano.
- Se a autorização for interrompida, o proprietário pode reconectar pelo aplicativo. O processo reaproveita o arquivo pendente registrado no Google para evitar cópias em novas tentativas.

## Instalação do serviço Google

Preparar o projeto independente com scripts/build-google-sheet-installer.mjs. Publicar o Code.gs e o appsscript.json gerados, com execução USER_ACCESSING e acesso a contas Google. Configurar GOOGLE_SHEETS_WEBAPP_URL no servidor com a URL /exec publicada. Nenhuma senha, token de unidade ou credencial de cliente faz parte do código publicado.

Os testes de isolamento, HTTP, troca de conta, recebimento e instalador usam banco descartável ou dados fictícios. Não criam unidades de teste na produção.

## Validação externa em 20/11/2026

A publicação Google está na versão 3, executando como o usuário que acessa. A autorização inicial e a criação no Drive ainda precisam de validação real: neste navegador com várias contas Google conectadas, o endereço publicado apresentou “Página não encontrada”. Os testes automatizados do instalador usam serviços Google simulados; não substituem essa validação externa. As conexões existentes de 2026 e 2027 continuam sincronizando e não foram substituídas.

O Google documenta que múltiplas contas simultâneas não são suportadas em web apps do Apps Script: https://developers.google.com/apps-script/guides/projects#multiple_google_accounts. Para conferir a primeira autorização, usar uma sessão com somente o Gmail da unidade. Não sair das demais contas sem garantir acesso a elas. A autorização faz parte da seção Planilha do mesmo aplicativo; não há APK instalador separado.
