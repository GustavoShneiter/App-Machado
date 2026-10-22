import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfessionalApp from './ProfessionalApp'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { ConnectionStatus } from '../ConnectionStatus'
import { WebAppMetadata } from '../AdminWebApp'
import '../styles.css'
import '../navigation-119.css'
import '../dialog-layout.css'
import '../admin-polish.css'
import '../readiness.css'
import '../web-app-install.css'
import './professional.css'

const queryClient = new QueryClient()
createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter><WebAppMetadata /><ConnectionStatus /><Suspense fallback={<main className="auth-shell"><p role="status">Abrindo Machado Profissional…</p></main>}><ProfessionalApp /></Suspense></BrowserRouter></QueryClientProvider></AppErrorBoundary></StrictMode>,
)
