import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { CatalogProvider } from './CatalogStore'
import { PublicLanding, Privacy } from './PublicPages'
import { backend } from './dataClient'
export { AdminLayout } from './AdminApp'
const AdminApp = lazy(() => import('./AdminApp'))
const PublicBooking = lazy(() => import('./PublicBooking').then(module => ({ default: module.PublicBookingV2 })))
const RecoveryPage = lazy(() => import('./RecoveryPage'))

export default function App() {
  const native = Capacitor.isNativePlatform()
  const navigate = useNavigate()
  useEffect(() => {
    const auth = backend?.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') window.setTimeout(() => navigate('/recuperar-acesso', { replace: true }), 0)
    })
    return () => auth?.data.subscription.unsubscribe()
  }, [navigate])
  return <CatalogProvider><Suspense fallback={<main className="auth-shell"><p role="status">Carregando…</p></main>}><Routes>
    <Route path="/" element={native ? <Navigate to="/admin" replace /> : <PublicLanding />} />
    <Route path="/agendar" element={native ? <Navigate to="/admin" replace /> : <PublicBooking />} />
    <Route path="/privacidade" element={<Privacy />} />
    <Route path="/recuperar-acesso" element={native ? <Navigate to="/admin" replace /> : <RecoveryPage />} />
    <Route path="/admin/*" element={<AdminApp />} />
    <Route path="*" element={<Navigate to={native ? '/admin' : '/'} replace />} />
  </Routes></Suspense></CatalogProvider>
}
