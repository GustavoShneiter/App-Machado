# Machado Profissional 1.2.0

- [Web / iPhone](https://barbearia-machado-rose.vercel.app/profissional).
- [Android 1.2.0](https://github.com/GustavoShneiter/App-Machado/releases/download/profissional-v1.2.0/Machado-Profissional-v1.2.0.apk).
- [Instalar no iPhone](https://barbearia-machado-rose.vercel.app/profissional/instalar).
- [Central de acessos](../../docs/CENTRAL-DE-ACESSOS.md).

Um único aplicativo e endereço para toda a equipe. Cada profissional entra com o e-mail e a senha definidos pela administração. O login determina a unidade, a própria agenda e as próprias comissões. Nenhum faturamento geral ou resultado alheio é retornado ao barbeiro.

**Minha Agenda:** agenda própria, novos agendamentos, encaixes, bloqueios pontuais e recorrentes. Grade de 06h a 23h em intervalos de 40 min, compacta e preservada. A API limita ações ao profissional conectado.

**Meu Caixa:** saldo de comissões a receber, resultados do período, metas, evolução semanal e extrato agrupado por dia. Detalhes dos lançamentos, comparação de semanas e gráfico ficam em janelas. Só a administração define metas de comissão, serviços e clientes. O barbeiro acompanha e pode ocultar a visualização. Ocultar não apaga os valores. Recebimentos da barbearia e repasses continuam na administração.

**Menu:** foto, conta e senha, indicadores, visibilidade das metas e **Versão web**. Para recarregar dados, puxe para baixo a partir do topo. Duas atualizações no mesmo segundo também renovam Caixa e preferências. Animações de progresso respeitam a preferência por reduzir movimento.

No iPhone, abra o link no Safari e use **Compartilhar → Adicionar à Tela de Início**. É a edição web instalável, com a mesma interface do Android e login individual; exige internet. O pacote Android com.barbeariamachado.profissional, código 6, pode coexistir com o administrativo.

Fontes em src/professional/, API em server/professionals.mjs. Preferências são persistidas por perfil; metas são escritas somente por server/professional-goals.mjs com autorização administrativa. O banco é compartilhado entre edições e isolado por unidade.

Compilação: npm run build:professional ou npm run android:professional. O build usa dist-professional e restaura os recursos administrativos após empacotar. Assinatura e contas de teste ficam fora do Git. [Guia e verificações](../../docs/ENTREGA-1.19.9.md).
