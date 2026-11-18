# Migração para a Contabo

Gestão 1.21.5 (Android 38) e Profissional 1.3.5 (Android 13).

## Arquitetura

O React/Vite, a API Node, Better Auth e as regras PostgreSQL foram mantidos. A aplicação é servida pelo Node 24 em um contêiner próprio; Caddy fornece HTTPS. Fotos e arquivos privados passam a usar o volume persistente da aplicação.

O PostgreSQL 18 da aplicação tem volume, rede, credenciais e banco próprios. Os bancos e volumes do n8n/Evolution não são reutilizados. O agente continua consultando a API do app, com seu acesso restrito; compartilhar a máquina não significa compartilhar tabelas ou senhas administrativas.

Endereço canônico: `https://app-machado.45-140-203-243.sslip.io`.

- Agendamento: `/agendar`.
- Gestão no computador: `/admin`.
- Gestão no celular/iPhone: `/app`.
- Profissionais: `/profissional`.

O endereço antigo da Vercel fica como encaminhamento transparente durante a atualização dos links e APKs. Esse caminho é transitório: os novos APKs acessam diretamente a Contabo. A configuração `vercel.json` não publica mais o backend nem o agendamento diário de backup na Vercel.

## Preservação dos acessos e dos dados

O segredo real de autenticação foi preservado, junto com os hashes de senha, sessões, unidades, permissões, relações e histórico. Não foi necessário redefinir senhas. Os dados foram comparados por quantidade e hash de cada tabela, com ordenação e fuso explícitos. As definições/donos das funções e as políticas de acesso foram comparadas separadamente.

O ensaio usa `machado_stage` e bloqueia gravações públicas sem a credencial privada de homologação. Os clientes e pagamentos fictícios do ensaio não entram no banco definitivo `machado`, que é restaurado de uma cópia nova da origem.

No corte, o agente retém mensagens antes de confirmar o recebimento, drena execuções/envios e preserva os agendamentos que estavam ativos. A origem recebe bloqueios de escrita no banco, evitando duas bases graváveis. A cópia final é conferida antes de liberar o destino. O bloqueio temporário de migração é removido somente do destino.

As fotos existentes são copiadas do armazenamento anterior com verificação dos bytes. Somente os respectivos endereços de fotos mudam após a comparação inicial.

## Backups e restauração

O serviço `machado-app-backup.timer` produz diariamente um arquivo `tar.age` cifrado, com banco completo, papéis PostgreSQL, fotos, configuração privada e certificados do banco. Retenção local: 14 dias. A chave privada de restauração não fica no servidor.

A tarefa Windows `Machado-App-Backup-Privado` copia arquivos cifrados para `E:\Projetos\Barbearia Machado\backups-privados`, conferindo SHA-256. Executa diariamente e ao entrar no Windows. O computador precisa estar ligado, conectado e com a conta aberta para receber novas cópias; os backups do servidor continuam independentemente dele.

A identidade `identidade-restauracao.agekey` é privada e deve ser guardada também em um local seguro separado. Não está no GitHub. Perder todas as cópias dessa identidade impede abrir os arquivos cifrados.

Para restaurar, em ambiente isolado:

1. Descriptografe com `age -d -i identidade-restauracao.agekey backup.tar.age` e extraia o arquivo em uma pasta privada.
2. Prepare PostgreSQL 18 com os papéis do backup e um banco novo; nunca restaure por cima da produção sem um plano de corte.
3. Restaure `database.dump` com `pg_restore --exit-on-error` e recoloque as fotos no volume persistente.
4. Reponha as configurações/certificados privados com permissões restritas. Reinicie somente os contêineres da aplicação e execute as verificações de login, Agenda, Caixa e permissões.

O rollback para a origem só é simples antes de haver novas gravações no destino. Depois disso, pagamentos, reservas, mensagens e demais alterações precisam ser reconciliados antes de reabrir a base antiga. Nunca basta retirar o bloqueio e voltar para uma cópia desatualizada.

## Verificações

- Cópia/restauração PostgreSQL e comparação de tabelas, funções e políticas.
- Cadastro/login de duas unidades fictícias e isolamento dos respectivos clientes, Caixa, backups e profissionais.
- Reserva pública concorrente: somente uma reserva aceita; horário ocupado deixa de estar disponível.
- Edição de serviço e recebimento no app profissional, com valor/percentual calculados no servidor e visualização imediata na gestão.
- Recebimentos concorrentes: um único pagamento; gestão não recebe novamente.
- Fotos locais com comparação SHA-256 e bloqueio de caminhos privados.
- Login e cinco seções principais em gestão mobile/desktop e profissional mobile, sem erros de execução nem estouro horizontal.
- Compatibilidade do endereço antigo com login de origem Android e token assinado encaminhado pela Vercel.
- Código, tipos, renderização administrativa e cálculos financeiros; APKs assinados e verificados localmente pelo Defender.

Os testes de homologação estão em `scripts/test-contabo-staging.mjs` e `scripts/test-contabo-flows.mjs`. Exigem os arquivos privados do ensaio e recusam produção. Os scripts de congelamento/cópia são ferramentas de migração, não fazem parte do fluxo normal do usuário.

## Operação e custos

Essa mudança utiliza a VPS já contratada. Não elimina a mensalidade da Contabo nem eventuais cobranças de IA/WhatsApp contratadas separadamente. Não foi contratado nenhum serviço pago adicional nesta migração.

O app depende de internet. Servidor e banco têm backups, mas continuam sujeitos a falhas da máquina, rede, disco e manutenção. O hostname gratuito depende do DNS do sslip.io; não foi comprado domínio. Aplicativo e agente compartilham CPU, memória e disco, com limites próprios dos contêineres do app; acompanhar o consumo e os backups continua necessário.

Para alterações futuras, o GitHub guarda código e APKs. A publicação na Contabo é uma etapa separada: transferir somente código revisado, construir a imagem, testar e recriar `web`. Não enviar `.env`, `.private`, chaves de assinatura, bancos ou backups ao repositório. `deploy/compose.yaml`, `deploy/Dockerfile` e `deploy/backup.sh` documentam a estrutura utilizada.
