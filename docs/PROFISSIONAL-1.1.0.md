# Machado Profissional 1.1.0

[Abrir o sistema](https://barbearia-machado-rose.vercel.app/profissional) · [Baixar para Android](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.1.0/Machado-Profissional-v1.1.0.apk)

## Meu Caixa

O saldo a receber e as metas ficam no início, com superfícies em verde e tons claros. Os resultados do período, o histórico semanal e o extrato têm grupos próprios. A data escolhida afeta os resultados financeiros; as metas continuam identificadas como pertencentes à semana atual.

- **Ver meu progresso:** abre os objetivos, quanto falta e uma estimativa de serviços para alcançar a meta de comissão. A estimativa considera sua comissão média por serviço; não é garantia de receita.
- **Barras de meta:** animam a entrada e as mudanças de progresso. A preferência do aparelho por reduzir movimentos é respeitada.
- **Período:** permite consultar esta semana, as duas anteriores ou um intervalo personalizado.
- **Lançamentos:** ao tocar em uma comissão, o pop-up mostra serviço ou produto, cliente, quantidade, atendimento e repasse.
- **Ajuda do saldo:** explica a diferença entre saldo total pendente e comissões do período selecionado.

## Menu profissional

O terceiro item da navegação reúne as opções pessoais:

- **Foto de perfil:** escolher imagem, conferir a prévia e salvar. É possível remover a foto. Ela identifica o profissional também no agendamento da barbearia.
- **Minha conta e segurança:** consultar o e-mail, alterar a própria senha ou sair.
- **Minhas metas da semana:** editar os valores, ocultar a área sem perder as configurações ou remover todas as metas mediante confirmação. Zero desativa uma meta específica.
- **Meus indicadores:** escolher quais números aparecem no Caixa.

As alterações são persistidas por profissional e validadas no servidor. Um profissional não pode alterar foto nem preferências de outro. O e-mail de login continua sendo definido pela administração.

## Agenda compacta

A Agenda profissional passou de 108 para 66 pixels por hora, reduzindo a altura de 1.836 para 1.122 pixels, aproximadamente 39%. O funcionamento permanece entre **06h e 23h**, com os mesmos intervalos de **40 minutos**. Linhas e blocos menores preservam o posicionamento dos horários; os detalhes completos aparecem ao tocar no agendamento.

## Atualização e conferência

Instale o APK 1.1.0 sobre a edição profissional anterior. O pacote Android e a assinatura de produção permanecem os mesmos. O Machado Gestão administrativo continua na versão 1.19.6.

No iPhone, use o endereço comum pelo Safari e adicione à Tela de Início. A instalação em aparelho físico e a homologação durante o trabalho na barbearia continuam sendo verificações no local.

A migração `database/010_professional_goals.sql` acrescenta a opção de ocultar metas, sem alterar valores existentes. APKs anteriores que não enviam essa opção preservam a escolha já salva. Fotos são enviadas por uma rota autenticada, com limite de tamanho e formato; nenhuma credencial administrativa é incorporada ao APK profissional.

Os testes cobrem build, análise de código, autorização e isolamento, metas salvas/ocultadas/removidas, upload e remoção de foto no Blob, persistência após recarregar, navegação, pop-ups, animação e redução de movimento. A apresentação de resultados é conferida com valores substituídos somente no navegador de teste; os testes financeiros usam dados temporários removidos ao terminar.

## Referências de organização

A organização por período e resumo segue a referência funcional do [Fresha Performance Insights](https://www.fresha.com/help-center/knowledge-base/reports/100652-access-your-performance-insights); o agrupamento por categoria se apoia na documentação dos [relatórios da Trinks](https://ajuda.trinks.com/configuracoes-0-0). Cores, composição e implementação são próprias do Machado Profissional.
