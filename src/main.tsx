import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import { ConnectionStatus } from './ConnectionStatus'
import './styles.css'
import './public-polish.css'
import './readiness.css'
import './booking-layout.css'
import './navigation-119.css'
import './dialog-layout.css'
import './public-compact.css'
import './admin-polish.css'
import './web-app-install.css'
import './professional/professional.css'
import './professional/professional-space.css'
import { WebAppMetadata } from './AdminWebApp'
import { isWebApp, webAppBase } from './appExperience'

const queryClient = new QueryClient()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => {}) })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter basename={isWebApp() ? webAppBase : undefined}><WebAppMetadata /><ConnectionStatus /><App /></BrowserRouter></QueryClientProvider></AppErrorBoundary></StrictMode>,
)
