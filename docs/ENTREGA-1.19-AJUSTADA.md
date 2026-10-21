# Machado Gestão — base 1.19 ajustada

A interface administrativa voltou à cópia preservada da 1.19. O layout da 1.20 e seus arquivos de entrega foram descartados. As duas alterações solicitadas são:

- Barra inferior com Caixa, Comandas, Agenda, Clientes e Menu. A Agenda usa o mesmo tamanho de ícone dos demais itens, sem círculo elevado. Um fundo verde se desloca até a seção selecionada, com animação discreta do ícone e transição de conteúdo. A preferência de movimento reduzido é respeitada.
- Profissionais da Agenda centralizados, com foto e nome alinhados. Quando há mais profissionais, a lista quebra em linhas e cada linha continua centralizada.

Os fluxos da Agenda, Comandas, Caixa e demais telas seguem a base 1.19. O acesso automático do Android permanece. A apresentação atual da página pública foi mantida separadamente em `booking-layout.css`. Não há migração de banco nesta entrega.

## Instalação

Instale `Machado-Gestao-v1.19-ajustada.apk`. O nome da versão no Android é 1.19.1; o versionCode é 22 para permitir atualizar também aparelhos que instalaram a 1.20. Usa o mesmo identificador e a mesma chave de produção. Não precisa desinstalar as versões de produção anteriores. O APK original 1.19 permanece preservado como referência.

O APK contém acesso administrativo automático. Distribua apenas às pessoas autorizadas; os arquivos privados de acesso e assinatura ficam fora do GitHub.

## Verificação

`npm run build` verifica TypeScript, renderização das telas e cálculos existentes. `npm run lint` verifica o código. Para conferir o visual sem alterar dados reais, execute `node scripts/preview-check.mjs` e depois `node scripts/test-navigation.mjs`.

O teste visual percorre as cinco seções, confere a posição do fundo verde, o tamanho uniforme dos ícones, a preferência de movimento reduzido e o alinhamento com 2, 5 e 9 profissionais. O APK de produção deve ser instalado sobre a versão anterior e conferido no Android.

As instruções operacionais da base continuam em [ENTREGA-1.19.md](ENTREGA-1.19.md) e [ENTREGA-1.18.md](ENTREGA-1.18.md).
