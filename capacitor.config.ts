import type { CapacitorConfig } from '@capacitor/cli'
const professional = process.env.MACHADO_APP_EDITION === 'professional'

const config: CapacitorConfig = {
  appId: professional ? 'com.barbeariamachado.profissional' : 'com.barbeariamachado.gestao',
  appName: professional ? 'Machado Profissional' : 'Machado Gestão',
  webDir: professional ? 'dist-professional' : 'dist',
  plugins: {
    SystemBars: { style: 'DARK' },
  },
  server: {
    androidScheme: 'https',
  },
  ios: {
    backgroundColor: '#121212',
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
}

export default config
