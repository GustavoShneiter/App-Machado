import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'machado-professional-entry',
    transformIndexHtml: { order: 'pre', handler(html) {
      if (process.env.VITE_APP_EDITION !== 'professional') return html
      return html.replace('/src/main.tsx', '/src/professional/main.tsx')
        .replace('<title>Barbearia Machado</title>', '<title>Machado Profissional</title>')
        .replace('content="Machado Gestão"', 'content="Machado Pro"')
        .replace('/manifest.webmanifest', '/professional.webmanifest')
        .replace('/apple-touch-icon.png', '/professional-apple-touch-icon.png')
        .replace('/icon.svg', '/professional-icon-192.png')
    } },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' }, watch: { ignored: ['**/android/**', '**/ios/**', '**/dist-professional/**', '**/.private/**'] } },
  build: { minify: false, rollupOptions: { output: { manualChunks: { react: ['react','react-dom','react-router-dom'] } } } },
})
