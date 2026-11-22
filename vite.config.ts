import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { applyWebAppMetadata } from './shared/web-app-metadata.mjs'

export default defineConfig({
  plugins: [react(), {
    name: 'machado-professional-entry',
    transformIndexHtml: { order: 'pre', handler(html, context) {
      const professional = process.env.VITE_APP_EDITION === 'professional'
      return applyWebAppMetadata(html, context.originalUrl || context.path, professional)
        .replace('/src/main.tsx', professional ? '/src/professional/main.tsx' : '/src/main.tsx')
    } },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' }, watch: { ignored: ['**/android/**', '**/ios/**', '**/dist-professional/**', '**/.private/**'] } },
  build: { minify: false, rollupOptions: { output: { manualChunks: { react: ['react','react-dom','react-router-dom'] } } } },
})
