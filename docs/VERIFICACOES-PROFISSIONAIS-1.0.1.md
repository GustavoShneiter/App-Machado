# Entrega — Machado Profissional 1.0.1 / Machado Gestão 1.19.6

Verificado em 22/10/2026. Código funcional: `c57baff3fed8d88acf6b7b379e205762a21b4e21`.

## Acessos e configuração

Toda a equipe usa [o mesmo portal profissional](https://barbearia-machado-rose.vercel.app/profissional) e [o mesmo APK Android](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.0.1/Machado-Profissional-v1.0.1.apk). O login determina a agenda, o e-mail da conta e as comissões exibidas. Endereços individuais antigos redirecionam ao portal comum.

No **Machado Gestão 1.19.6 → Menu → Profissionais**, o administrador escolhe o e-mail e a senha ao cadastrar. Na edição, **Login do profissional → Salvar acesso** atualiza o e-mail e permite definir outra senha. Senha vazia mantém a atual; senha nova exige confirmação e pelo menos 12 caracteres. Alterar o e-mail ou a senha encerra as sessões anteriores. Os acessos existentes foram preservados. O administrador continua usando seu aplicativo próprio.

O cadastro e a criação do acesso acontecem na mesma transação. E-mail duplicado, inválido ou senha inválida não deixam um profissional parcialmente cadastrado. A migração 009 garante a unicidade do e-mail sem diferenciar maiúsculas e minúsculas, sem alterar contas existentes.

## Verificações concluídas

| Verificação | Resultado |
|---|---|
| Build TypeScript e análise ESLint | Aprovados |
| Telas administrativas, cálculos financeiros e calendário | Aprovados |
| Migração 009 repetida e comparação das contas existentes | Aprovadas; dados preservados |
| Administrador escolhe e altera e-mail/senha pela interface | Aprovado localmente e em produção |
| Dois logins no mesmo portal, com perfil e e-mail próprios | Aprovados em produção; registros temporários removidos |
| Isolamento de agenda, catálogo, comissões, preferências e operações | Aprovado na API; acesso a outro profissional ou à administração negado |
| E-mail duplicado, senha inválida e cadastro revertido | Aprovados |
| Troca de e-mail preserva senha, redefinição revoga sessões, conta inativa bloqueada | Aprovadas |
| Agendamento, encaixe, conflito de horário, bloqueios e recorrência | Aprovados na API com registros de teste removidos |
| Comissão própria em comanda com vários profissionais | Aprovada; sem valores financeiros da barbearia no extrato profissional |
| Navegadores móvel Android, PC e WebKit com perfil iPhone 13 | Aprovados no endereço publicado |
| Login, agenda e sessão real; Caixa, metas, extrato e janelas | Aprovados; valores de Caixa substituídos somente no teste visual |
| APK profissional assinado: instalação, login real, Caixa, voltar e reabertura | Aprovado em emulador Android com API de produção |
| APK administrativo assinado: atualização, acesso gerenciado e cinco seções | Aprovado em emulador; editor de login conferido sem alterar contas reais |
| Credenciais administrativas em arquivos e classes do APK profissional | Ausentes |
| Download público do APK profissional | Aprovado; SHA-256 igual ao arquivo testado |
| Projeto nativo iOS, recursos e versão | Verificação local aprovada |

A interface profissional ganhou identificação da conta no cabeçalho, tela de entrada clara, agenda sem seletor redundante de profissionais, indicadores agrupados, atualização de período sinalizada e histórico semanal compacto. O saldo total a receber permanece separado dos resultados do período escolhido.

O teste de navegador usa login e agenda reais. Metas e valores determinísticos de Caixa são usados somente no navegador de teste para validar a apresentação; os valores e as preferências reais não são alterados. As regras financeiras e de autorização são testadas separadamente na API com dados temporários.

## Arquivos

| Edição | Versão / código Android | SHA-256 do APK |
|---|---|---|
| Machado Profissional | 1.0.1 / 2 | `33e432eff71d2139da9c9bbd1bb17268b14880bf638e9809c1bdd58f3fa944d4` |
| Machado Gestão, distribuição privada | 1.19.6 / 27 | `bf660aaece2d49f74ff05a84b7dc11baf04b999a95a70734dce3bcba3df9946a` |

Ambos mantêm o certificado de produção anterior. O APK administrativo contém acesso gerenciado e é entregue apenas na pasta privada de entrega. Não faz parte do Release público.

[Central de links e instruções de instalação](CENTRAL-DE-ACESSOS.md).

## Validação na barbearia

No iPhone, a edição entregue é web instalável pelo Safari, com as mesmas telas profissionais. A instalação em iPhone físico e um dia real de operação na barbearia precisam ser conferidos pelo responsável; os testes automatizados não substituem essa homologação.
