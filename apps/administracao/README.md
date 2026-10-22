# Machado Gestão 1.19.6 — Administração

- [Painel para PC](https://barbearia-machado-rose.vercel.app/admin).
- [Aplicativo web / iPhone, com a interface do Android](https://barbearia-machado-rose.vercel.app/app).
- [Como adicionar ao iPhone](https://barbearia-machado-rose.vercel.app/app/instalar).
- [Central de links](../../docs/CENTRAL-DE-ACESSOS.md).

Mantém as cinco seções da base 1.19: Caixa, Comandas, Agenda, Clientes e Menu. O administrador cria e gerencia o acesso individual dos profissionais em **Menu → Profissionais**.

Ao salvar um profissional novo, o administrador escolhe o e-mail e a senha; a criação da conta ocorre na mesma transação. Na edição, os campos de login mostram somente o acesso daquele profissional. **Salvar acesso** permite mudar o e-mail e definir uma nova senha; deixar a senha vazia mantém a atual. Alterar os dados de login revoga sessões anteriores. Desativar o profissional bloqueia o acesso. Toda a equipe usa o mesmo endereço `/profissional` e o mesmo APK profissional.

O aplicativo Android administrativo tem identificador `com.barbeariamachado.gestao`, versão 1.19.6, código 27. Sua distribuição privada contém acesso gerenciado e permanece fora dos anexos públicos do GitHub. O APK profissional é outro aplicativo, com login individual e identificação própria.

Fontes: `src/AdminApp.tsx`, `src/OperationalPages.tsx`, `src/ManagementPages.tsx`. Os componentes visuais de Agenda e janelas são compartilhados com a edição profissional para manter o mesmo padrão, com ações e dados limitados no servidor.
