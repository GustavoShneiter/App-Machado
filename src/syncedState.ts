import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const CHANNEL = 'barbearia-machado-live'

function parseStoredValue<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* o app segue funcionando sem armazenamento local */ }
}

export function useSyncedState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = readStorage(key)
    return parseStoredValue(saved, fallback)
  })
  const receivedRemotely = useRef(false)

  useEffect(() => {
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null
    const receive = (nextKey: string, raw: string | null) => {
      if (nextKey !== key || raw === null) return
      receivedRemotely.current = true
      setValue(parseStoredValue(raw, fallback))
    }
    const storage = (event: StorageEvent) => receive(event.key ?? '', event.newValue)
    const message = (event: MessageEvent<{ key: string; value: string }>) => receive(event.data?.key, event.data?.value)
    window.addEventListener('storage', storage)
    channel?.addEventListener('message', message)
    return () => { window.removeEventListener('storage', storage); channel?.removeEventListener('message', message); channel?.close() }
  }, [key])

  useEffect(() => {
    if (receivedRemotely.current) { receivedRemotely.current = false; return }
    const raw = JSON.stringify(value)
    writeStorage(key, raw)
    if ('BroadcastChannel' in window) { const channel = new BroadcastChannel(CHANNEL); channel.postMessage({ key, value: raw }); channel.close() }
  }, [key, value])

  return [value, setValue]
}
