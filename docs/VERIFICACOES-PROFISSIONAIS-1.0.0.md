# Entrega Machado Profissional 1.0.0 / Machado Gestão 1.19.5

Verificado em 22/10/2026.

## Resultado publicado

| Item | Resultado |
|---|---|
| Aplicativo profissional web e iPhone | [Abrir](https://barbearia-machado-rose.vercel.app/profissional) — publicado |
| Administração web | [Abrir](https://barbearia-machado-rose.vercel.app/app) — publicado |
| Ambiente | Produção, equipe `machado14`, projeto `barbearia-machado` |
| Deploy funcional | `dpl_FYbZyk6znoPyZhdWNAjDGnsBEonM` — Ready |
| Compilação Vercel | React/Vite + API Node.js, região `gru1`, 32 segundos |
| Versões da API | Administração 1.19.5; profissional 1.0.0 |
| Android profissional | APK assinado, pacote `com.barbeariamachado.profissional`, versão 1.0.0, código 1 |
| Android administrativo | APK assinado, pacote original `com.barbeariamachado.gestao`, versão 1.19.5, código 26 |
| Distribuição | APK profissional no Release próprio; administrador e senhas em entrega privada |

## Fluxo e permissões

- Cadastro pelo formulário administrativo em produção: profissional inativo de teste salvo, conta individual criada na mesma operação, senha inicial exibida uma vez, link próprio e opção de nova senha presentes. Registro de teste excluído ao terminar.
- API: agendamento e encaixe na própria agenda; atendimento sobreposto recusado; bloqueio por período e recorrência; conclusão integrada à comanda e à comissão da administração.
- Uma conta profissional não consulta nem altera a agenda, o catálogo reservado, as metas ou o extrato de outro profissional. IDs alheios e operações administrativas são recusados pelo servidor.
- Caixa profissional validado com uma comanda contendo itens de dois profissionais: retorna somente a comissão do titular. Sem faturamento da barbearia, caixa físico, pagamentos de clientes ou parte da barbearia na resposta do extrato.
- Senha renovada revoga sessões anteriores; troca de senha pelo profissional conferida; profissional inativo perde a autorização. Login administrativo e profissional mantêm cookies distintos.
- SQL da migração 008 executado duas vezes na mesma transação e testado, incluindo tentativa de acesso cruzado, bloqueios e geração de comissão. Migração aplicada sem mudar o histórico de clientes, agendamentos, itens ou pagamentos existentes.

## Interface e dispositivos

| Ambiente | Verificação |
|---|---|
| Android emulado, APK assinado | Instalação, login individual na API publicada, duas seções, perfil próprio, Caixa real de comissões, botão Voltar e sessão ao reabrir |
| Android administrativo emulado | Instalação da atualização, acesso gerenciado e cinco seções; os dois aplicativos coexistem |
| Chromium em celular e PC | Login e agenda reais, duas seções, formulários de encaixe e recorrência, extrato, metas e indicadores, sem estouro horizontal |
| WebKit com perfil iPhone 13 | Mesmo fluxo, janelas compactas, sessão preservada e manifesto pessoal para instalação |
| Site público em 390 e 1440 pixels | Landing, botão de WhatsApp, agendamento, logo compacto e avanço automático preservados |

Os testes visuais de Caixa substituem valores somente dentro do navegador de teste para conferir metas, situações e layout. Login, agenda e manifesto usam a API real; o APK Android também foi conferido com suas comissões reais. Nenhuma meta ou comissão real foi alterada por essas verificações.

## Integridade e operação

- TypeScript, build de produção e análise de código aprovados.
- Semanas de segunda a domingo, virada de ano, ano bissexto, meta alcançada e arredondamento da estimativa de serviços testados.
- Todos os arquivos internos do APK profissional, incluindo as classes, inspecionados para confirmar ausência da identidade e senha administrativas. O site e o commit também passaram pela checagem de credenciais.
- Backup inclui preferências e identidades profissionais; restauração conferida em tabelas temporárias com tipos, índices e referências, sem modificar os dados operacionais.
- Compilação de iPhone da administração aprovada pelo [workflow do GitHub](https://github.com/GustavoShneiter/App-Machado/actions/runs/39830635808). A edição profissional para iPhone desta entrega é a versão web instalável.
- Consulta de erros da Vercel no deploy funcional retornou zero registros entre 18:20 e 18:30 UTC. Monitoramento e drenos externos não foram alterados.

A instalação pela interface do Safari e o uso no iPhone físico precisam ser conferidos no aparelho. A homologação de um dia real na barbearia deve validar o fluxo de clientes, encaixes, fechamento e repasse de comissões com a equipe.

[Central de links e instalação](CENTRAL-DE-ACESSOS.md).
