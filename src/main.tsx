import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import './styles.css'

const queryClient = new QueryClient()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))) })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></AppErrorBoundary></StrictMode>,
)
