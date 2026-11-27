# Correção da planilha de novembro de 2026

Em 27/11/2026, a planilha vinculada ao aplicativo tinha 216 células de novembro com a mesma contribuição `SUMIF` inserida duas vezes. Ocorreu ao reconectar células que já continham uma fórmula de sincronização: o conector tratava a fórmula anterior como base e acrescentava outra soma.

O conector agora reconhece e remove vínculos repetidos antes de criar ou reparar uma célula. A correção foi instalada no projeto Apps Script **Machado — Integração do Caixa** e executada na planilha de 2026. Nenhum lançamento operacional foi apagado.

Verificação após a correção:

- Nenhuma fórmula duplicada restante na aba NOVEMBRO; nenhuma base de controle de novembro contém vínculo anterior.
- Cortes em 03/11: 52 → 26. Cortes em 07/11: 50 → 25.
- Total de novembro: R$ 28.118 → R$ 16.399. Todos os totais diários da planilha são iguais aos valores publicados pelo servidor, somados por data, excluindo repasses e abatendo descontos.
- A planilha antiga tem pequenas diferenças manuais em 09/11 e 18/11; os valores atuais desses dias correspondem aos lançamentos publicados pelo app. Os dias 23 a 26/11 também foram acrescentados pelo app e não estavam na planilha antiga.
- A conexão de 2026 está com `publish_on_cash_close=true`, sem erro de sincronização. O backend publica um novo retrato ao fechar o caixa, e o acionador do Google `sincronizarMachado` está ativo com execuções automáticas concluídas.

O teste do conector reproduz uma célula com a soma duplicada e verifica que a sincronização volta a deixar exatamente uma contribuição, preservando o comportamento das alterações manuais.
