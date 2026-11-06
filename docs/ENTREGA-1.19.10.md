# Machado Gestão 1.19.10 e Profissional 1.2.1

Esta revisão corrige a rolagem por toque e simplifica a apresentação dos dois aplicativos. Não altera o banco, as regras de comissão, a privacidade entre profissionais, os agendamentos ou as metas atribuídas pela administração.

## Instalar

- [Android — Gestão 1.19.10](https://github.com/GustavoShneiter/App-Machado/releases/download/gestao-v1.19.10/Machado-Gestao-v1.19.10.apk)
- [Android — Profissional 1.2.1](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.2.1/Machado-Profissional-v1.2.1.apk)
- [Gestão no PC](https://barbearia-machado-rose.vercel.app/admin)
- [Gestão web e iPhone](https://barbearia-machado-rose.vercel.app/app)
- [Profissional web e iPhone](https://barbearia-machado-rose.vercel.app/profissional)
- [Página pública](https://barbearia-machado-rose.vercel.app/)

No Android, instale sobre a versão anterior. Os pacotes usam a mesma assinatura. No iPhone, abra a edição web no Safari e use Compartilhar → Adicionar à Tela de Início. A atualização web usa os mesmos endereços.

## O que mudou

- A página volta a rolar para cima e para baixo. Atualizar continua disponível ao puxar para baixo no topo.
- Caixa profissional: saldo centralizado em musgo, metas compactas, três comissões recentes e extrato completo ao tocar em Ver todas.
- Meu resultado reúne indicadores e evolução em uma área recolhida. O relatório e a escolha de período continuam disponíveis.
- Preferências de indicadores e de visibilidade das metas são preservadas.
- Administração: cabeçalhos e destaques centralizados, Caixa organizado, informações de repasse em colunas, Menu direto e janelas consistentes.
- Removidos textos de apresentação redundantes. Rótulos, estados, validações e avisos de exclusão continuam disponíveis.

O saldo a receber inclui todos os períodos. O filtro de período afeta comissões e resultados. As metas continuam mostrando a semana atual e só podem ser definidas pela administração.

## Direção visual

Manter carvão e verde musgo. Centralizar títulos e destaques; alinhar descrições e valores nas listas em colunas estáveis. As referências de [Monzo Insights](https://monzo.com/help/business-accounts/what-is-insights), [Revolut Analytics](https://help.revolut.com/en-US/help/accounts/budget-and-analytics/what-is-the-analytics-dashboard/) e os estudos locais Mercury/Revolut orientaram a separação entre saldo, atividade e análises, sem reproduzir suas marcas.

## Verificação

Os testes de regressão da rolagem devem conferir deslocamento real do documento com eventos de toque confiáveis, atualização apenas no topo, navegação, formulários e popups nos dois aplicativos. Os testes visuais usam dados simulados, sem criar lançamentos na operação da barbearia. A entrega inclui o relatório de verificação e os hashes dos APKs.
