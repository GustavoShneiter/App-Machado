import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.barbeariamachado.gestao',
  appName: 'Machado Gestão',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    backgroundColor: '#f4f7f5',
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
}

export default config
