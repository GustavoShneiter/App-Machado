# Machado Gestão 1.18 — entrega

Site: https://barbearia-machado-rose.vercel.app

Agendamento público: https://barbearia-machado-rose.vercel.app/agendar

Painel: https://barbearia-machado-rose.vercel.app/admin

O site e o aplicativo Android são distribuídos separadamente e utilizam o mesmo backend na Vercel. O banco agora é PostgreSQL da Neon, na região de São Paulo. O login é executado na Vercel com Better Auth. Fotos ficam no Vercel Blob público, e backups ficam em outro armazenamento Blob privado. Esta versão não depende do Supabase para funcionar.

## Instalação e acesso

1. Instale `Machado-Gestao-v1.18.apk` no Android. Se houver uma versão antiga com assinatura de depuração, desinstale-a primeiro: a chave de assinatura de produção é diferente. Os cadastros migrados ficam no servidor e permanecem disponíveis.
2. Entre com o e-mail e a senha já usados pelo proprietário. A senha existente foi preservada na migração.
3. Confira Empresa, Serviços, Profissionais e Estoque antes de abrir o primeiro caixa.
4. Use o endereço público acima na bio do Instagram. O menu do Android copia o endereço público correto.

## Rotina diária

1. Abra o Caixa com o dinheiro físico contado no início do dia.
2. O cliente agenda no site; o atendimento aparece na Agenda e recebe uma comanda.
3. Confirme chegada, atendimento e conclusão. Serviços com valor a consultar precisam receber um preço antes da conclusão.
4. Receba a comanda no Caixa, escolhendo o meio de pagamento efetivamente utilizado.
5. Registre repasses somente quando o dinheiro for pago ao profissional. Comissão segue a configuração do serviço e profissional.
6. Lance despesas, reforços e retiradas com justificativa.
7. Feche o Caixa informando o dinheiro físico contado. Pix e cartões não aumentam o dinheiro da gaveta.
8. Confira os relatórios por data e profissional. O faturamento usa a data do atendimento; o recebido usa a data do pagamento. Descontos e gorjetas são considerados, e comandas com mais de um profissional são repartidas no filtro.

## Recuperação de acesso

No painel, use Menu → Alterar senha e informe a senha atual. Se esquecer a senha, use “Esqueci minha senha” e um dos códigos entregues no arquivo privado `CODIGOS-RECUPERACAO.txt`. Cada código funciona uma única vez e encerra as sessões anteriores. Guarde esses códigos fora do celular e não os envie aos clientes.

## Backups e manutenção

Uma cópia diária é programada na Vercel às 05h de Brasília (08h UTC). O proprietário pode criar uma cópia privada ou exportar um arquivo em Menu → Cópias de segurança. Os arquivos incluem dados pessoais e credenciais protegidas por hash: guarde-os em local restrito.

A restauração foi verificada em tabelas temporárias, com validação de tipos, índices e referências entre registros. A restauração real deve ser executada pelo responsável técnico em ambiente separado e validada antes de substituir dados em uso. Nunca restaure uma cópia por cima da operação sem preservar o estado atual.

O endpoint `/api/health` confirma a conexão com o banco. Falhas do backend são registradas nos logs de Functions na Vercel com identificador de requisição. O menu mostra a data da última cópia concluída.

As contas de hospedagem, banco, arquivos e código precisam permanecer sob controle do responsável pelo sistema. A chave de assinatura Android e sua senha foram guardadas na pasta privada de entrega; preserve-as para publicar atualizações compatíveis. Não coloque esses arquivos no GitHub nem no site.

## Atualizações

Publicar o site não atualiza automaticamente um APK instalado. Após uma mudança no frontend, publique o site e gere um novo APK com `npm run android:sync`, seguido de `android/gradlew.bat assembleRelease`. Aumente `versionCode` e `versionName`, utilize a mesma chave de produção e teste a instalação sobre a versão anterior.

## Validações executadas

- Build TypeScript, testes de renderização, cálculos financeiros e lint.
- Auditoria npm sem vulnerabilidades reportadas.
- Migração de 26 tabelas e conta existente, com conferência de contagens e preservação do hash da senha.
- Banco: reserva pública, conflitos, comanda, recebimento, comissão, repasse, estoque e acesso anônimo bloqueado.
- API: autenticação, sessão Android, permissões, backup, rejeição de arquivo inválido, recuperação única e revogação de sessões.
- Navegador: reserva pública → cliente no painel → abrir caixa → concluir atendimento → receber Pix → fechar caixa; tela mobile e aviso offline.
- Cópia privada gravada e lida com SHA-256 conferido; teste de restauração sem alterar dados operacionais.
- Site final publicado validado novamente pela API e pelo fluxo completo de navegador.
- APK de release instalado no emulador Android: login no ambiente publicado e sessão preservada após encerrar e abrir o app.

## Homologação na barbearia

Utilize durante um dia inteiro com o proprietário: agendamentos reais, encaixe, cancelamento, serviços e produtos, dinheiro, Pix, cartão, comissão, repasse, relatório e fechamento. Compare a contagem física e os recebimentos com o sistema. Essa etapa valida a rotina real, os aparelhos e a conexão da barbearia.

Esta versão registra recebimentos integrais por comanda, com um meio de pagamento. Ela não realiza cobrança automática de cartão, emissão fiscal nem conciliação bancária.
