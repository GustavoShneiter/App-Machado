import { useEffect, useState } from 'react'

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online ? null : <div className="connection-banner" role="status">Sem internet. Reconecte para consultar horários ou salvar alterações.</div>
}
