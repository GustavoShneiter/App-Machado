import { useEffect, useRef, useState, type RefObject } from 'react'
import { RefreshCw } from 'lucide-react'
import './refresh-gesture.css'

type Props = { target: RefObject<HTMLElement | null>; refresh: () => Promise<void>; disabled?: boolean }
type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing'

/** The gesture only owns a downward drag that begins at the top of the page. */
export function RefreshGesture({ target, refresh, disabled = false }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [distance, setDistance] = useState(0)
  const latest = useRef({ refresh, disabled })
  const running = useRef(false)
  latest.current = { refresh, disabled }
  const threshold = 64

  async function update() {
    if (running.current || latest.current.disabled) return
    running.current = true
    setPhase('refreshing')
    setDistance(threshold)
    try { await latest.current.refresh() }
    finally { running.current = false; setPhase('idle'); setDistance(0) }
  }
  const updateRef = useRef(update)
  updateRef.current = update

  useEffect(() => {
    const element = target.current
    if (!element) return
    let start: { x: number; y: number } | null = null
    let pulled = 0
    let suppressClickUntil = 0
    function clear() { start = null; pulled = 0; if (!running.current) { setPhase('idle'); setDistance(0) } }
    function atTop(node: Element) {
      if (window.scrollY > 1 || (document.scrollingElement?.scrollTop ?? 0) > 1) return false
      // The WebView may scroll body/root or a nested panel instead of main.
      // Check the complete ancestor chain before claiming a downward drag.
      for (let parent: Element | null = node; parent; parent = parent.parentElement) {
        if (parent.scrollTop > 1 && parent.scrollHeight > parent.clientHeight) return false
      }
      return true
    }
    function begin(event: TouchEvent) {
      const node = event.target instanceof Element ? event.target : null
      if (running.current || latest.current.disabled || event.touches.length !== 1 || !node || !atTop(node)
        || node.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"],dialog[open]')) return
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      pulled = 0
    }
    function move(event: TouchEvent) {
      if (!start || running.current) return
      if (event.touches.length !== 1 || latest.current.disabled) { clear(); return }
      const dx = Math.abs(event.touches[0].clientX - start.x)
      const dy = event.touches[0].clientY - start.y
      if (dy < 0 || dx > Math.max(16, dy * .8)) { clear(); return }
      if (dy < 10) return
      if (event.cancelable) event.preventDefault()
      pulled = Math.min(100, dy * .48)
      suppressClickUntil = Date.now() + 450
      setDistance(pulled)
      setPhase(pulled >= threshold ? 'ready' : 'pulling')
    }
    function finish() {
      const shouldUpdate = start && pulled >= threshold && !latest.current.disabled
      start = null
      pulled = 0
      if (shouldUpdate) void updateRef.current()
      else clear()
    }
    function cancel() { clear() }
    function click(event: MouseEvent) {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation() }
    }
    element.addEventListener('touchstart', begin, { passive: true })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', finish)
    element.addEventListener('touchcancel', cancel)
    element.addEventListener('click', click, true)
    return () => {
      element.removeEventListener('touchstart', begin)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', finish)
      element.removeEventListener('touchcancel', cancel)
      element.removeEventListener('click', click, true)
    }
  }, [target])

  const label = phase === 'refreshing' ? 'Atualizando dados…' : phase === 'ready' ? 'Solte para atualizar' : 'Puxe para atualizar'
  return <>
    <div className="refresh-gesture-status" data-phase={phase} aria-hidden={phase === 'idle'} style={{ transform: `translate(-50%, ${phase === 'idle' ? -90 : Math.min(32, distance / 2)}px)` }}>
      <RefreshCw size={18} aria-hidden="true" /><span role="status" aria-live="polite">{phase === 'idle' ? '' : label}</span>
    </div>
    <button className="refresh-keyboard-control" disabled={disabled || phase === 'refreshing'} onClick={() => void updateRef.current()}>Atualizar dados</button>
  </>
}
