import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'

export function ProfessionalFeedback({ message, close }: { message: string; close: () => void }) {
  useEffect(() => { if (!message) return; const timer = window.setTimeout(close, 5000); return () => window.clearTimeout(timer) }, [message, close])
  if (!message) return null
  const content = <div className="pro-feedback" role="status"><CheckCircle2 size={19} /><span>{message}</span><button aria-label="Fechar confirmação" onClick={close}><X size={16} /></button></div>
  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
