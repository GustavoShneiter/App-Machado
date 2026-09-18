import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'android'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly' } },
  },
  {
    // A rota ativa de agendamento está isolada em PublicBooking.tsx; a tela legada
    // permanece no arquivo durante a transição visual, sem participar da compilação de regras.
    files: ['src/App.tsx'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
)
